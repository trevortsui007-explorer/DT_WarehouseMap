import * as THREE from 'three';

// Local coordinates keep the outline aligned when a rack is rotated.
// 在货架局部坐标添加高亮框、底板和名称，随父节点一起旋转。
export function addRackHighlight(parent, rack) {
  const width = rack.cols * rack.width,
    height = rack.levels * rack.levelHeight;
  const volume = new THREE.BoxGeometry(width + 0.18, height + 0.18, rack.depth + 0.18);
  const edges = new THREE.EdgesGeometry(volume);
  volume.dispose();
  const outline = new THREE.LineSegments(
    edges,
    new THREE.LineBasicMaterial({
      color: '#d6a63e',
      transparent: true,
      opacity: 0.85,
      depthTest: false,
      depthWrite: false,
    })
  );
  outline.position.set(width / 2, height / 2, rack.depth / 2);
  outline.renderOrder = 10;
  // 装饰图形不参与射线拾取，避免遮住真正的货架或货位命中目标。
  outline.raycast = () => {};
  parent.add(outline);

  const base = new THREE.Mesh(
    new THREE.PlaneGeometry(width + 0.45, rack.depth + 0.45),
    new THREE.MeshBasicMaterial({
      color: '#f9e6a8',
      transparent: true,
      opacity: 0.48,
      depthWrite: false,
      side: THREE.DoubleSide,
    })
  );
  base.rotation.x = -Math.PI / 2;
  base.position.set(width / 2, 0.025, rack.depth / 2);
  base.raycast = () => {};
  parent.add(base);

  const canvas = document.createElement('canvas');
  canvas.width = 768;
  canvas.height = 96;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff3c9';
  ctx.fillRect(0, 0, 768, 96);
  ctx.strokeStyle = '#d6a63e';
  ctx.lineWidth = 5;
  ctx.strokeRect(3, 3, 762, 90);
  ctx.fillStyle = '#654f24';
  ctx.font = 'bold 34px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(`${rack.name} · ${rack.fgCode}`, 384, 48, 730);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthTest: false, depthWrite: false }));
  label.position.set(width / 2, height + 0.65, rack.depth / 2);
  label.scale.set(4.8, 0.6, 1);
  label.renderOrder = 11;
  label.raycast = () => {};
  parent.add(label);
}
