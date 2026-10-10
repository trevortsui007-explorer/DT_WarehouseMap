import { parseWorkspaceImport } from '../../core/workspace/import-workspace.js';
import {
  emptyResources,
  validateResources,
  projectBackup,
  markResourcesForReview,
} from '../../core/workspace/resources.js';
import { calibrate, worldToImage } from '../../core/workspace/calibration.js';
import { surveyTarget, geometryStamp, surveyStatus, createSurvey } from '../../core/workspace/survey.js';
import { validateLayout } from '../../core/model/layout-validation.js';
import { readUnderlay, verifyUnderlay } from '../../infrastructure/import-export/underlay-image.js';
import { exportLayout } from '../../infrastructure/import-export/json-exporter.js';

// 本机资源有独立保存队列；成功落盘后才更新展示，不进入布局 Undo 或 Runtime。
export function createWorkspaceResources(api) {
  let data = emptyResources(),
    queue = Promise.resolve(),
    revision = 0,
    interaction = null,
    points = [],
    disposed = false;
  const state = { busy: false, error: '', recoveries: [] };
  const notify = () => {
    if (!disposed) api.changed();
  };
  const fail = error => {
    state.error = error.message;
    notify();
  };
  async function run(task, edit = true) {
    if (state.busy || (edit && !api.canEdit())) return false;
    state.busy = true;
    state.error = '';
    notify();
    const result = queue.then(task);
    queue = result.catch(() => {});
    try {
      await result;
      return true;
    } catch (error) {
      fail(error);
      return false;
    } finally {
      state.busy = false;
      notify();
    }
  }
  async function persist(next) {
    const validated = validateResources(next);
    if (!api.repository.saveResources) throw Error('当前工作区不支持本机资源存储');
    await api.repository.saveResources(api.model().layoutId, validated);
    data = validated;
    revision++;
    notify();
  }
  async function reload() {
    try {
      data = api.repository.loadResources ? await api.repository.loadResources(api.model().layoutId) : emptyResources();
      revision++;
      interaction = null;
      points = [];
      state.recoveries = (await api.repository.listProjectRecoveries?.(api.model().layoutId)) || [];
      await verifyUnderlay(data.underlay);
    } catch (error) {
      fail(error);
    }
    notify();
  }
  function selected() {
    const target = surveyTarget(api.model(), api.selectedId());
    if (!target) return null;
    const record = data.surveys.find(item => item.objectId === target.object.id);
    return {
      id: target.object.id,
      name: target.object.name,
      kind: target.kind,
      keys: target.keys,
      current: Object.fromEntries(target.keys.map(key => [key, target.object[key]])),
      record: structuredClone(record || null),
      status: surveyStatus(record, target),
    };
  }
  return {
    reload,
    flush: () => queue,
    dispose() {
      disposed = true;
      return queue;
    },
    snapshot: () => ({
      ...state,
      underlay: data.underlay,
      revision,
      interaction,
      points: [...points],
      survey: selected(),
    }),
    get image() {
      return data.underlay;
    },
    get interaction() {
      return interaction;
    },
    error: fail,
    click(world) {
      if (interaction !== 'calibrate' || !data.underlay || !api.canEdit()) return;
      const point = worldToImage(data.underlay, world);
      if (point.x < 0 || point.y < 0 || point.x > data.underlay.pixelWidth || point.y > data.underlay.pixelHeight)
        return;
      points = points.length === 2 ? [point] : [...points, point];
      notify();
    },
    commands: {
      uploadUnderlay: file =>
        run(async () => {
          const image = await readUnderlay(file),
            b = api.model().boundary;
          await persist({
            ...data,
            underlay: {
              ...image,
              x: b.x,
              y: b.y,
              rotation: 0,
              scale: b.width / image.pixelWidth,
              visible: true,
              locked: true,
              opacity: 0.55,
              calibration: null,
              needsReview: false,
            },
          });
          interaction = null;
          points = [];
        }),
      updateUnderlay: input =>
        run(async () => {
          if (!data.underlay) return;
          const next = { ...data.underlay };
          for (const key of ['x', 'y', 'rotation', 'opacity'])
            if (input[key] !== undefined) next[key] = Number(input[key]);
          for (const key of ['visible', 'locked']) if (input[key] !== undefined) next[key] = !!input[key];
          if (input.width !== undefined && Math.abs(Number(input.width) - next.pixelWidth * next.scale) > 1e-8) {
            next.scale = Number(input.width) / next.pixelWidth;
            next.calibration = null;
          }
          await persist({ ...data, underlay: next });
          if (next.locked || !next.visible) interaction = null;
        }),
      removeUnderlay: () =>
        run(async () => {
          await persist({ ...data, underlay: null });
          interaction = null;
          points = [];
        }),
      setUnderlayInteraction(mode) {
        if (!api.canEdit() || state.busy) return;
        if (mode && !data.underlay?.visible) {
          fail(Error('请先显示底图'));
          return;
        }
        if (mode === 'move' && data.underlay.locked) {
          fail(Error('请先取消底图锁定'));
          return;
        }
        interaction = ['calibrate', 'move'].includes(mode) ? mode : null;
        points = [];
        api.cancelCad();
        notify();
      },
      calibrateUnderlay: (distance, unit) =>
        run(async () => {
          if (!data.underlay) return;
          await persist({ ...data, underlay: calibrate(data.underlay, points, distance, unit) });
          interaction = null;
          points = [];
        }),
      saveSurvey: (id, input) =>
        run(async () => {
          const target = surveyTarget(api.model(), id);
          if (!target) throw Error('对象已不存在');
          const record = createSurvey(target, input);
          await persist({ ...data, surveys: [...data.surveys.filter(item => item.objectId !== id), record] });
        }),
      applySurvey: id =>
        run(async () => {
          const record = data.surveys.find(item => item.objectId === id);
          const target = surveyTarget(api.model(), id);
          if (!record || !target || record.kind !== target.kind) throw Error('请先保存适用的实测记录');
          // 先校验完整候选布局，包括门越界和重叠；校验失败既不改模型也不改记录。
          const candidate = structuredClone(api.model());
          Object.assign(surveyTarget(candidate, id).object, record.values);
          validateLayout(candidate);
          const rollback = api.checkpoint?.();
          const success = api.execute('ApplySurvey', () =>
            Object.assign(surveyTarget(api.model(), id).object, record.values)
          );
          if (!success) throw Error('实测值未应用，请检查布局校验提示');
          const updated = {
            ...record,
            needsReview: false,
            appliedGeometry: geometryStamp(surveyTarget(api.model(), id)),
          };
          api.setEditLock?.(true);
          try {
            await persist({ ...data, surveys: data.surveys.map(item => (item.objectId === id ? updated : item)) });
          } catch (error) {
            rollback?.();
            throw error;
          } finally {
            api.setEditLock?.(false);
          }
        }),
      exportProject: () =>
        run(
          async () => exportLayout(projectBackup(api.model(), data, api.backupNames?.()), 'warehouse-project.json'),
          false
        ),
      async importProject(file, destination = 'replace') {
        if (state.busy || !api.canEdit() || !file) return;
        let backup;
        const valid = await run(async () => {
          if (file.size > 40 * 1024 * 1024) throw Error('项目备份不能超过 40 MB');
          const parsed = parseWorkspaceImport(await file.text());
          backup = parsed.backup;
          if (destination !== 'new') {
            if (backup.layout.layoutId !== api.model().layoutId || backup.layout.layoutCode !== api.model().layoutCode)
              throw Error('文件属于另一张地图，请将导入方式改为「作为新项目打开」；当前工作已保留');
            // 纯布局不包含资源，替换时保留现有底图和实测，并标记待核对。
            if (parsed.layoutOnly) backup.resources = markResourcesForReview(data);
          }
          await verifyUnderlay(backup.resources.underlay);
        });
        if (valid) {
          try {
            if (destination === 'new') {
              if (!api.importAsNewProject) throw Error('当前环境不支持多项目');
              await api.importAsNewProject(backup);
            } else if (!(await api.replaceProject(backup))) throw Error('项目未替换，请查看布局管理中的错误');
          } catch (error) {
            fail(error);
          }
        }
      },
      async recoverProject(id) {
        if (state.busy || !api.canEdit()) return;
        let backup;
        const valid = await run(async () => {
          backup = await api.repository.getProjectRecovery(id);
          await verifyUnderlay(backup.resources.underlay);
        });
        if (valid) {
          try {
            if (!(await api.replaceProject(backup))) throw Error('恢复失败，当前工作保留');
          } catch (error) {
            fail(error);
          }
        }
      },
    },
  };
}
