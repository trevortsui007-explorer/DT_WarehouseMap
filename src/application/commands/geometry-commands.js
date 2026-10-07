import { isFixture, validateFixture } from '../../core/spatial/fixtures.js';
import { isRoom } from '../../core/spatial/rooms.js';
import { bounds, transform, validateObjects, copies } from '../../core/geometry/cad-geometry.js';
import { validateArea } from '../../core/spatial/spatial.js';
import { validateDoors } from '../../core/doors/doors.js';

// 用注入的模型与执行器封装几何意图；Core 计算结果，Application 决定何时写入与记录历史。
export function createGeometryCommands(api) {
  // 先校验全部候选对象再原地更新；Object.assign 保留共享模型对象引用。
  function applyTransform(source, dx, dy, degrees = 0, pivot = { x: 0, y: 0 }) {
    const moved = transform(source, dx, dy, degrees, pivot);
    validateObjects(moved, api.model());
    moved.forEach(object =>
      Object.assign(
        api.objects().find(item => item.id === object.id),
        object
      )
    );
  }
  return {
    // 方向键连按的预览会更新内存模型，但不逐次创建历史；松键时统一记录。
    previewMove: (source, dx, dy) => applyTransform(source, dx, dy),
    // 拖动结束只提交一次位移命令，避免 pointermove 产生大量历史。
    move(source, dx, dy) {
      api.execute('MoveObjects', () => applyTransform(source, dx, dy));
    },
    // 未指定基点时绕选中集合的外包中心旋转，同时支持精确平移。
    rotate(source, dx, dy, degrees = 0, pivot) {
      const box = bounds(source);
      pivot ??= { x: box.x + box.width / 2, y: box.y + box.depth / 2 };
      api.execute(degrees ? 'RotateObjects' : 'MoveObjects', () => applyTransform(source, dx, dy, degrees, pivot));
    },
    // 批量追加验证过的副本，并将新对象设为当前选择。
    copy(source, offsets) {
      api.execute('ArrayCopy', () => {
        const added = copies(source, offsets, api.model());
        for (const object of added)
          (object.cols
            ? api.model().racks
            : isRoom(object)
              ? api.model().rooms
              : isFixture(object)
                ? api.model().fixtures
                : api.model().areas
          ).push(object);
        api.select(added.map(object => object.id));
      });
    },
    // 删除地图对象时同时移除被删区域的绑定；不操作 WMS 库存或 CurrentLocation。
    remove(ids) {
      api.execute('DeleteObjects', () => {
        if (ids.includes('boundary')) throw Error('主边界不能删除，请取消选择主边界');
        const model = api.model();
        model.rooms = (model.rooms || []).filter(object => !ids.includes(object.id));
        model.fixtures = (model.fixtures || []).filter(object => !ids.includes(object.id));
        model.racks = model.racks.filter(object => !ids.includes(object.id));
        model.areas = model.areas.filter(object => !ids.includes(object.id));
        model.areaBindings = (model.areaBindings || []).filter(binding => !ids.includes(binding.areaId));
        api.select([]);
      });
    },
    // 区域缩放先验证候选尺寸，再写回共享对象。
    resize(area, width, depth) {
      api.execute('UpdateArea', () => {
        const next = { ...area, width, depth };
        if (isFixture(next)) validateFixture(next);
        else validateArea(next, isRoom(next));
        if (isRoom(next)) validateDoors(next);
        Object.assign(area, next);
      });
    },
    // 将候选门放回完整门集合校验，以阻止沿边拖动后与其他门重叠。
    moveDoor(door, boundary, offset) {
      api.execute('MoveDoor', () => {
        const next = { ...door, offset };
        validateDoors({ ...boundary, doors: boundary.doors.map(item => (item.id === door.id ? next : item)) });
        Object.assign(door, next);
      });
    },
  };
}
