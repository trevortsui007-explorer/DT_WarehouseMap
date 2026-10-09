import { alignObjects } from '../../core/geometry/alignment.js';
import { isRoom } from '../../core/spatial/rooms.js';
import { createSelectionService } from '../selection/selection-service.js';
import { createGeometryCommands } from '../commands/geometry-commands.js';
import { createInteractionSurface } from '../../renderers/konva/interaction.js';
import {
  bounds,
  boxSelect,
  transform,
  validateObjects,
  snapMove,
  arrayOffsets,
  copies,
} from '../../core/geometry/cad-geometry.js';
import { draggedDoorOffset } from '../../core/doors/doors.js';
// 协调选择、快捷键与手势提交；几何交给 Core，图形预览交给交互表面。
export function createCadEditor(api) {
  const $ = s => document.querySelector(s),
    unit = api.unit;
  let drag = null,
    marquee = null,
    space = false,
    hand = false,
    cancelling = false,
    nudgeBefore = null,
    suppressClick = false;
  const editable = () => api.objects(),
    objects = () => selection.objects(),
    isInput = e => e.target?.closest?.('input,textarea,select,[contenteditable="true"]'),
    dialog = () => !!document.querySelector('dialog[open]');
  const selection = createSelectionService({ objects: editable, primary: api.primary, render: api.render });
  const commands = createGeometryCommands({
    model: api.model,
    objects: editable,
    execute: api.execute,
    select: ids => selection.set(ids, false),
  });
  // 手势完成后同步主选对象，保持属性面板与选择集合一致。
  function sync() {
    api.primary(objects().at(-1)?.id || null);
  }
  function set(next, redraw = true) {
    selection.set(next, redraw);
  }
  // 平移或刚结束拖动时忽略点击，避免释放鼠标误改选择。
  function select(id, event, explicit = false) {
    // 画布拖动后的合成 click 需要抑制，侧栏明确选择不应被同一计时窗口拦截。
    if (space || hand || (suppressClick && !explicit)) return;
    selection.select(id, event);
  }
  // 方向键连续移动作为一次编辑记录，松键、切换操作或失焦时结束。
  function finishNudge() {
    if (nudgeBefore) {
      api.record(nudgeBefore);
      nudgeBefore = null;
    }
  }
  // 撤销未提交的微调并清除手势预览；cancelling 防止 stopDragging 触发意外提交。
  function cancel() {
    if (nudgeBefore) {
      api.replace(nudgeBefore);
      nudgeBefore = null;
    }
    cancelling = true;
    drag = null;
    marquee = null;
    surface.stopDragging();
    cancelling = false;
    suppressClick = false;
    surface.clear();
    api.render();
  }
  // 把精确移动或旋转交给命令执行器，由同一历史边界提交。
  function commitTransform(dx, dy, degrees = 0, pivot) {
    if (objects().length) commands.rotate(objects(), dx, dy, degrees, pivot);
  }
  // 复制当前选择集合，默认沿 X/Y 各偏移两米。
  function duplicate(offsets = [{ dx: 2, dy: 2 }]) {
    if (objects().length) commands.copy(objects(), offsets);
  }
  // 仅允许删除货架或区域；选中单个货位时提示先选择整架。
  function remove() {
    if (api.slotSelected()) {
      api.toast('当前选中的是货位，请先选择整架；快捷键不会删除货位。');
      return;
    }
    const list = objects();
    if (!list.length) return;
    $('#delete-message').textContent =
      `删除所选 ${list.length} 个对象？删除房间会同时删除所属门，未选中的内部对象保留。可撤销，不操作 WMS。`;
    $('#delete-dialog').showModal();
  }
  $('#delete-confirm').onclick = () => {
    commands.remove([...selection.ids]);
    $('#delete-dialog').close();
  };
  const surface = createInteractionSurface(
    { stage: api.stage, unit, host: api.host, canEdit: api.canEdit, isPanning: () => space || hand },
    {
      select,
      // 记录起始几何副本，后续位移始终相对此基准计算，避免逐帧累积误差。
      dragStart(id) {
        if (!selection.ids.has(id)) selection.set([id], false);
        finishNudge();
        drag = { id, start: objects().map(object => structuredClone(object)), dx: 0, dy: 0 };
        suppressClick = true;
      },
      // 拖动中只更新图形和辅助线；7 像素吸附容差按缩放换算，尚不修改布局。
      dragMove(id, x, y, alt) {
        if (!drag || drag.id !== id) return;
        const source = drag.start.find(object => object.id === id);
        const snap = snapMove(
          drag.start,
          editable().filter(object => !selection.ids.has(object.id)),
          x - source.x,
          y - source.y,
          7 / (unit * surface.scale()),
          alt
        );
        drag.dx = snap.dx;
        drag.dy = snap.dy;
        surface.moveObjects(drag.start, snap.dx, snap.dy);
        surface.guides(snap.guides);
      },
      // 释放鼠标后提交一次模型修改；延迟解除点击抑制以避开本次拖动生成的 click。
      dragEnd(id) {
        if (cancelling || !drag || drag.id !== id) return;
        const state = drag;
        drag = null;
        surface.clear();
        commands.move(state.start, state.dx, state.dy);
        sync();
        setTimeout(() => (suppressClick = false), 0);
      },
      resizeStart() {
        drag = { resize: true };
      },
      // 缩放完成后按 0.5 米取整，并通过区域命令提交。
      resizeEnd(area, width, depth) {
        if (cancelling) return;
        drag = null;
        commands.resize(area, Math.max(0.5, Math.round(width * 2) / 2), Math.max(0.5, Math.round(depth * 2) / 2));
      },
      // 门拖动开始前结清方向键历史，再建立门的独立选择。
      doorStart(onSelect) {
        finishNudge();
        onSelect();
        drag = { door: true };
        suppressClick = true;
      },
      doorOffset: draggedDoorOffset,
      // 门的拖动预览结束后才校验与提交偏移。
      doorEnd(door, boundary, offset) {
        if (cancelling) return;
        drag = null;
        commands.moveDoor(door, boundary, offset);
        setTimeout(() => (suppressClick = false), 0);
      },
      // 保存框选起点及旧选择，Shift 框选完成后与原集合合并。
      marqueeStart(start, screen, add) {
        finishNudge();
        marquee = { start, screen, add, previous: [...selection.ids] };
      },
      marqueeMove(point) {
        if (marquee) surface.marquee(marquee.start, point);
      },
      // 小于 4 像素视为点击；终点在起点左侧时采用相交选择，否则采用完全包含。
      marqueeEnd(point) {
        if (!marquee) return;
        const state = marquee,
          start = state.start;
        marquee = null;
        surface.clear();
        const picked =
          Math.hypot((point.x - start.x) * unit * surface.scale(), (point.y - start.y) * unit * surface.scale()) < 4
            ? []
            : boxSelect(
                editable(),
                {
                  x: Math.min(start.x, point.x),
                  y: Math.min(start.y, point.y),
                  width: Math.abs(point.x - start.x),
                  depth: Math.abs(point.y - start.y),
                  rotation: 0,
                },
                point.x < start.x
              );
        set(state.add ? [...state.previous, ...picked] : picked);
      },
    }
  );
  // 同步空格临时平移和手形工具的交互状态。
  function updatePan() {
    surface.setPan(space || hand);
    $('#pan-tool').classList.toggle('active', hand);
  }
  // 整理选择并返回界面摘要，此处不直接绘制 Konva 对象。
  function render() {
    selection.prune();
    return { count: selection.ids.size, bounds: selection.ids.size ? bounds(objects()) : null };
  }
  // 优先聚焦已选货架/区域；没有集合选择时允许使用门的外部范围。
  function focus() {
    const list = objects(),
      external = api.externalBounds?.();
    if (!list.length && !external) {
      api.toast('请先选择货架、区域或门');
      return;
    }
    api.focus(list.length ? bounds(list) : external);
  }
  // 打开精确变换表单，以选中集合的外包中心填充默认基点。
  function showPrecise() {
    if (api.view() !== '2d' || !objects().length) return;
    $('#precise-form').reset();
    $('#precise-form [name=angle]').disabled = objects().some(isRoom);
    $('#precise-error').textContent = '';
    const b = bounds(objects());
    $('#pivot-x').value = (b.x + b.width / 2).toFixed(3);
    $('#pivot-y').value = (b.y + b.depth / 2).toFixed(3);
    $('#precise-dialog').showModal();
  }
  $('#precise-form').onsubmit = e => {
    e.preventDefault();
    const f = new FormData(e.target);
    const list = objects(),
      b = bounds(list),
      pivot =
        f.get('pivot') === 'custom'
          ? { x: Number(f.get('px')), y: Number(f.get('py')) }
          : { x: b.x + b.width / 2, y: b.y + b.depth / 2 };
    try {
      const next = transform(list, Number(f.get('dx')), Number(f.get('dy')), Number(f.get('angle') || 0), pivot);
      validateObjects(next, api.model());
      commitTransform(Number(f.get('dx')), Number(f.get('dy')), Number(f.get('angle')), pivot);
      $('#precise-dialog').close();
    } catch (err) {
      $('#precise-error').textContent = err.message;
    }
  };
  // 验证阵列参数并显示临时副本；预览不加入模型，也不进入 Undo。
  function arrayPreview() {
    try {
      const f = new FormData($('#array-form')),
        offsets = arrayOffsets(
          objects(),
          Number(f.get('rows')),
          Number(f.get('cols')),
          Number(f.get('gapX')),
          Number(f.get('gapY'))
        );
      if (!offsets.length) throw Error('行列数包含原件，请至少设为 1 行 2 列或 2 行 1 列');
      const candidate = copies(objects(), offsets, api.model());
      $('#array-error').textContent = '';
      $('#array-summary').textContent =
        `保留原件，新增 ${candidate.length} 个对象。按世界 X/Y 方向排列，净间距以每组外包矩形计算。`;
      $('#array-confirm').disabled = false;
      surface.preview(candidate);
      return offsets;
    } catch (err) {
      $('#array-error').textContent = err.message;
      $('#array-confirm').disabled = true;
      surface.clear();
      return null;
    }
  }
  // 重置并打开阵列表单，立即绘制首次预览。
  function showArray() {
    if (api.view() !== '2d' || !objects().length) return;
    $('#array-form').reset();
    $('#array-dialog').showModal();
    arrayPreview();
  }
  $('#array-form').oninput = arrayPreview;
  $('#array-form').onsubmit = e => {
    e.preventDefault();
    const offsets = arrayPreview();
    if (offsets) {
      duplicate(offsets);
      $('#array-dialog').close();
    }
  };
  $('#array-dialog').addEventListener('close', () => surface.clear());
  for (const d of document.querySelectorAll('dialog')) {
    d.querySelectorAll('[data-close]').forEach(b => (b.onclick = () => d.close()));
    d.addEventListener('close', () => {
      api.host.focus({ preventScroll: true });
    });
  }
  $('#precise-open').onclick = showPrecise;
  $('#array-open').onclick = showArray;
  $('#selection-copy').onclick = () => duplicate();
  $('#selection-delete').onclick = remove;
  $('#focus-selection').onclick = focus;
  $('#shortcut-help').onclick = () => $('#shortcuts-dialog').showModal();
  $('#pan-tool').onclick = () => {
    hand = !hand;
    updatePan();
  };
  // 统一分派快捷键：先处理对话框与输入焦点，再检查视图和编辑权限。
  function keydown(e) {
    const mod = e.ctrlKey || e.metaKey,
      key = e.key.toLowerCase();
    if (dialog()) return;
    if (mod && key === 's') {
      e.preventDefault();
      finishNudge();
      $('#save').click();
      return;
    }
    if (isInput(e)) return;
    if (key === 'escape') {
      e.preventDefault();
      if (drag || marquee || nudgeBefore) cancel();
      else set([]);
      return;
    }
    if (mod && ['z', 'y'].includes(key)) {
      e.preventDefault();
      finishNudge();
      (key === 'y' || e.shiftKey ? $('#redo') : $('#undo')).click();
      return;
    }
    if (e.key === '?' || e.key === 'F1') {
      e.preventDefault();
      $('#shortcuts-dialog').showModal();
      return;
    }
    if (key === 'home') {
      e.preventDefault();
      api.fit();
      return;
    }
    if (key === 'f' && !mod) {
      e.preventDefault();
      focus();
      return;
    }
    if (api.view() !== '2d') return;
    if (e.code === 'Space') {
      e.preventDefault();
      space = true;
      updatePan();
      return;
    }
    if (!api.canEdit()) {
      if ((mod && key === 'd') || e.key === 'Delete' || e.key.startsWith('Arrow')) e.preventDefault();
      return;
    }
    if (mod && key === 'd') {
      e.preventDefault();
      if (!e.repeat) {
        finishNudge();
        duplicate();
      }
      return;
    }
    if (e.key === 'Delete') {
      e.preventDefault();
      if (!e.repeat) {
        finishNudge();
        remove();
      }
      return;
    }
    if (['q', 'e'].includes(key) && !mod) {
      e.preventDefault();
      if (objects().some(isRoom)) {
        api.toast('房间保持轴对齐，请取消选择房间后旋转');
        return;
      }
      if (!e.repeat) {
        finishNudge();
        commitTransform(0, 0, key === 'q' ? -90 : 90);
      }
      return;
    }
    const delta = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
    if (delta && objects().length) {
      e.preventDefault();
      if (drag) return;
      nudgeBefore ??= JSON.stringify(api.model());
      const step = e.shiftKey ? 1 : 0.1;
      try {
        commands.previewMove(objects(), delta[0] * step, delta[1] * step);
        api.render();
      } catch (err) {
        api.toast(err.message);
      }
    }
  }
  // 通过 AbortSignal 注册的事件会在应用销毁时统一解绑，避免重复挂载后多次响应。
  window.addEventListener('keydown', keydown, { signal: api.signal });
  window.addEventListener(
    'keyup',
    e => {
      if (e.code === 'Space') {
        space = false;
        updatePan();
      }
      if (e.key.startsWith('Arrow')) finishNudge();
    },
    { signal: api.signal }
  );
  window.addEventListener(
    'blur',
    () => {
      finishNudge();
      space = false;
      updatePan();
      if (drag || marquee) cancel();
    },
    { signal: api.signal }
  );
  // End a key-repeat command before any subsequent pointer command can enter history.
  window.addEventListener('pointerdown', finishNudge, { capture: true, signal: api.signal });
  api.host.tabIndex = 0;
  api.host.addEventListener('pointerdown', () => api.host.focus({ preventScroll: true }));
  return {
    cancel,
    set,
    select,
    has: id => selection.ids.has(id),
    ids: () => [...selection.ids],
    clear(redraw = true) {
      set([], redraw);
    },
    beginNodes: surface.beginNodes,
    bind: surface.bind,
    alignmentOptions: () => editable().map(o => ({ id: o.id, name: o.name })),
    clearAlignment: () => surface.clear(),
    previewAlignment(referenceId, mode, gap) {
      const result = alignObjects(
        objects(),
        editable().find(o => o.id === referenceId),
        mode,
        gap
      );
      validateObjects(result, api.model());
      surface.preview(result);
      return result.map(o => ({ id: o.id, name: o.name, x: o.x, y: o.y }));
    },
    applyAlignment(referenceId, mode, gap) {
      return api.execute('AlignObjects', () => {
        const result = alignObjects(
          objects(),
          editable().find(o => o.id === referenceId),
          mode,
          gap
        );
        validateObjects(result, api.model());
        for (const next of result)
          Object.assign(
            editable().find(o => o.id === next.id),
            { x: next.x, y: next.y }
          );
      });
    },
    bindResize: surface.bindResize,
    bindDoor: surface.bindDoor,
    render,
    focus,
    finishNudge,
    isPanning: () => space || hand,
    isCancelling: () => cancelling,
    paintSelection() {
      surface.selection(objects());
    },
    syncFrom(id) {
      set(id ? [id] : [], false);
    },
    beforeDraw() {
      if (!drag && !marquee && !$('#array-dialog').open) surface.clear();
    },
  };
}
