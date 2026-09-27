import { slots, uid, validate } from '../../core/model/model.js';
import { validateArea, AREA_TYPES } from '../../core/spatial/spatial.js';
import { validateDoors, newDoor } from '../../core/doors/doors.js';
// 封装属性面板的编辑命令，统一通过 execute 处理权限、回滚、历史及刷新。
export function createLayoutCommands(api) {
  // 对象解构提取依赖方法；这些方法由调用方注入，命令本身不读写存储。
  const { current, chosen, spatial, cad, canEdit, execute } = api;
  return {
    // 创建具有新身份的货架和货位；查看全部 FG 时使用 FG01 作为新增归属。
    addRack(levels) {
      execute('CreateRack', () => {
        const fgCode = api.zone() === 'ALL' ? 'FG01' : api.zone();
        let n = 1;
        while (api.model().racks.some(rack => rack.name === `${fgCode}-${String(n).padStart(2, '0')}`)) n++;
        const rack = {
          id: uid(),
          spaceId: 'main',
          fgCode,
          name: `${fgCode}-${String(n).padStart(2, '0')}`,
          x: 4,
          y: 3,
          cols: 6,
          levels: Number(levels),
          width: 1.35,
          depth: 1.4,
          levelHeight: 1.5,
          rotation: 0,
        };
        rack.slots = slots(rack);
        api.model().racks.push(rack);
        cad.set([rack.id], false);
      });
    },
    // 仅接收白名单属性；按层列复用原货位，修改货架显示名称不重编已有货位编码。
    updateRack(data) {
      const rack = current();
      if (!rack) return;
      execute('UpdateRackProperties', () => {
        const next = { ...rack };
        for (const [key, value] of Object.entries(data).filter(([key]) =>
          ['name', 'fgCode', 'x', 'y', 'cols', 'levels', 'width', 'depth', 'levelHeight', 'rotation'].includes(key)
        ))
          next[key] = ['name', 'fgCode'].includes(key) ? value.trim() : Number(value);
        validate(next, api.model().racks);
        next.slots = slots(next, rack.slots);
        Object.assign(rack, next);
        if (api.zone() !== 'ALL' && rack.fgCode !== api.zone()) api.setZone(rack.fgCode);
      });
    },
    // 克隆货架几何并重建货位身份，副本不沿用原货位编码。
    duplicateRack() {
      const rack = current();
      if (!rack) return;
      execute('CopyRack', () => {
        const copy = structuredClone(rack);
        copy.id = uid();
        let i = 2;
        while (api.model().racks.some(item => item.name === `${rack.name}-副本${i}`)) i++;
        copy.name = `${rack.name}-副本${i}`;
        copy.x += 2;
        copy.y += 2;
        copy.slots = slots(copy);
        api.model().racks.push(copy);
        cad.set([copy.id], false);
      });
    },
    // 确认后删除地图货架；是否允许移除已使用货位仍须由服务端发布校验决定。
    removeRack() {
      const rack = current();
      if (!rack || !canEdit()) return;
      if (!confirm(`删除地图中的货架 ${rack.name} ？不会操作 WMS。`)) return;
      execute('DeleteObjects', () => {
        api.model().racks = api.model().racks.filter(item => item.id !== rack.id);
        api.clearPrimary();
      });
    },
    // 修改货位编码前调用身份保护，再校验非空和唯一性，不能绕过已发布编码锁定。
    bindCode(value) {
      const slot = chosen();
      if (!slot) return;
      execute('BindLocationCode', () => {
        api.assertCanRename?.(slot);
        const code = value.trim();
        if (!code) throw Error('货位编码不能为空');
        if (
          api
            .model()
            .racks.flatMap(rack => rack.slots)
            .some(item => item.id !== slot.id && item.code === code)
        )
          throw Error('货位编码已存在');
        slot.code = code;
      });
    },
    // 按边界计算默认位置并新增物理区域，虚拟库位通过独立绑定命令维护。
    addArea(type) {
      execute('CreateArea', () => {
        const boundary = api.model().boundary;
        const area = {
          id: uid(),
          type,
          name: AREA_TYPES[type].label + ' ' + (api.model().areas.filter(item => item.type === type).length + 1),
          x: boundary.x + 2,
          y: boundary.y + boundary.depth - 7,
          width: type === 'aisle' ? 12 : 8,
          depth: type === 'aisle' ? 2.5 : 5,
          rotation: 0,
        };
        api.model().areas.push(area);
        cad.set([area.id], false);
      });
    },
    // 区域和边界共用属性提交；调整边界时额外检查原有门是否仍能完整容纳。
    updateArea(data) {
      const area = spatial.selected();
      if (!area) return;
      execute(area.id === 'boundary' ? 'ResizeBoundary' : 'UpdateArea', () => {
        const next = { ...area };
        for (const [key, value] of Object.entries(data)) next[key] = key === 'name' ? value.trim() : Number(value);
        const boundary = area.id === 'boundary';
        validateArea(next, boundary);
        if (boundary) validateDoors(next);
        Object.assign(area, next);
      });
    },
    // 删除区域并清理其绑定；边界不能通过此入口删除。
    removeArea() {
      const area = spatial.selected();
      if (!area || area.id === 'boundary') return;
      execute('DeleteObjects', () => {
        api.model().areas = api.model().areas.filter(item => item.id !== area.id);
        api.model().areaBindings = api.model().areaBindings.filter(binding => binding.areaId !== area.id);
        spatial.clear();
      });
    },
    // 在可用边段寻找新门位置，再校验完整门集合。
    addDoor() {
      execute('CreateDoor', () => {
        const boundary = api.model().boundary;
        const door = newDoor(boundary);
        boundary.doors ??= [];
        boundary.doors.push(door);
        validateDoors(boundary);
      });
    },
    // 先构造候选门集合校验，成功后才更新原门属性。
    updateDoor(id, data) {
      execute('UpdateDoor', () => {
        const boundary = api.model().boundary,
          door = boundary.doors.find(item => item.id === id),
          next = { ...door };
        for (const [key, value] of Object.entries(data))
          next[key] = ['offset', 'width'].includes(key) ? Number(value) : value.trim();
        validateDoors({ ...boundary, doors: boundary.doors.map(item => (item.id === id ? next : item)) });
        Object.assign(door, next);
      });
    },
    // 只删除指定门，墙段由渲染器根据剩余门洞重新计算。
    removeDoor(id) {
      execute('DeleteDoor', () => {
        api.model().boundary.doors = api.model().boundary.doors.filter(door => door.id !== id);
      });
    },
  };
}
