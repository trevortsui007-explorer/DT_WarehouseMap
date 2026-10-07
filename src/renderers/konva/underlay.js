import Konva from 'konva';
// 底图是独立渲染层：锁定时不命中，标定/摆放时临时置顶，离开工具即回到底层。
export function createUnderlayRenderer(stage, unit, api) {
  const layer = new Konva.Layer();
  stage.add(layer);
  let source = null,
    bitmap = null,
    attemptedImage = null,
    request = 0,
    disposed = false;
  async function render() {
    const state = api.state();
    const image = state.underlay;
    layer.destroyChildren();
    if (!image || !state.visible || !image.visible) {
      layer.hide();
      return;
    }
    layer.show();
    if (source !== image.dataUrl || (!bitmap && attemptedImage !== image)) {
      attemptedImage = image;
      source = image.dataUrl;
      bitmap = null;
      const current = ++request;
      try {
        const loaded = await api.decodeImage(source);
        if (disposed || current !== request) return;
        bitmap = loaded;
        return render();
      } catch (error) {
        if (!disposed && current === request) api.error(error);
        return;
      }
    }
    if (!bitmap || disposed) return;
    if (state.interaction) layer.moveToTop();
    else layer.zIndex(1);
    layer.listening(!!state.interaction);
    const node = new Konva.Image({
      image: bitmap,
      x: image.x * unit,
      y: image.y * unit,
      width: image.pixelWidth * image.scale * unit,
      height: image.pixelHeight * image.scale * unit,
      rotation: image.rotation,
      opacity: image.opacity,
      draggable: state.interaction === 'move' && !image.locked,
    });
    layer.add(node);
    node.on('mousedown touchstart', event => {
      event.cancelBubble = true;
    });
    node.on('click tap', event => {
      event.cancelBubble = true;
      const pointer = stage.getPointerPosition();
      api.click({
        x: (pointer.x - stage.x()) / stage.scaleX() / unit,
        y: (pointer.y - stage.y()) / stage.scaleY() / unit,
      });
    });
    node.on('dragstart dragmove', event => {
      event.cancelBubble = true;
    });
    node.on('dragend', event => {
      event.cancelBubble = true;
      api.move({ x: node.x() / unit, y: node.y() / unit });
    });
    // 标定点随图片旋转缩放，但仍以原图像素记录。
    const marks = new Konva.Group({ x: image.x * unit, y: image.y * unit, rotation: image.rotation, listening: false });
    layer.add(marks);
    for (const point of state.points || [])
      marks.add(
        new Konva.Circle({
          x: point.x * image.scale * unit,
          y: point.y * image.scale * unit,
          radius: 5 / stage.scaleX(),
          fill: '#d76a45',
          stroke: '#fff',
          strokeWidth: 1 / stage.scaleX(),
        })
      );
    layer.batchDraw();
  }
  return {
    render,
    destroy() {
      disposed = true;
      ++request;
      bitmap = null;
      layer.destroy();
    },
  };
}
