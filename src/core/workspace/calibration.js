// 底图坐标以原图像素保存；世界坐标始终为米，不依赖画布缩放。
export function imageToWorld(image, point) {
  const angle = (image.rotation * Math.PI) / 180;
  return {
    x: image.x + image.scale * (point.x * Math.cos(angle) - point.y * Math.sin(angle)),
    y: image.y + image.scale * (point.x * Math.sin(angle) + point.y * Math.cos(angle)),
  };
}
export function worldToImage(image, point) {
  const angle = (image.rotation * Math.PI) / 180,
    dx = point.x - image.x,
    dy = point.y - image.y;
  return {
    x: (dx * Math.cos(angle) + dy * Math.sin(angle)) / image.scale,
    y: (-dx * Math.sin(angle) + dy * Math.cos(angle)) / image.scale,
  };
}
export function meters(value, unit = 'm') {
  if (!['m', 'mm'].includes(unit) || String(value).trim() === '' || !Number.isFinite(Number(value)))
    throw Error('请输入有效尺寸及单位');
  return Number(value) / (unit === 'mm' ? 1000 : 1);
}
// 标定只返回新底图，固定第一点的世界位置；永不接收或修改布局对象。
export function calibrate(image, points, distance, unit) {
  const length = meters(distance, unit);
  if (length <= 0 || points.length !== 2) throw Error('请选择两点并输入正数距离');
  for (const p of points)
    if (
      !Number.isFinite(p.x) ||
      !Number.isFinite(p.y) ||
      p.x < 0 ||
      p.y < 0 ||
      p.x > image.pixelWidth ||
      p.y > image.pixelHeight
    )
      throw Error('标定点必须位于图片内');
  const pixels = Math.hypot(points[1].x - points[0].x, points[1].y - points[0].y);
  if (pixels < 1) throw Error('标定点距离过近');
  const anchor = imageToWorld(image, points[0]);
  const next = { ...image, scale: length / pixels };
  const moved = imageToWorld(next, points[0]);
  next.x += anchor.x - moved.x;
  next.y += anchor.y - moved.y;
  next.calibration = { points: structuredClone(points), distance: length };
  next.needsReview = false;
  return next;
}
