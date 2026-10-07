// 在预留顶部标签、底部统计区域后的可用画布中居中，单位为屏幕像素。
export function fitView(bounds, width, height, unit = 22) {
  const left = Math.min(35, width * 0.1),
    right = left;
  const top = Math.min(90, height * 0.2),
    bottom = Math.min(140, height * 0.3);
  const scale = Math.min(
    1.5,
    Math.max(1, width - left - right) / (Math.max(bounds.width, 0.01) * unit),
    Math.max(1, height - top - bottom) / (Math.max(bounds.depth, 0.01) * unit)
  );
  return {
    scale,
    x: (left + width - right) / 2 - (bounds.x + bounds.width / 2) * unit * scale,
    y: (top + height - bottom) / 2 - (bounds.y + bounds.depth / 2) * unit * scale,
  };
}
