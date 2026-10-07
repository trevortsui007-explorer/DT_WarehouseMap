import { runtimeCount, runtimeColor } from '../../core/runtime/runtime.js';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { fgColor } from '../../core/model/model.js';
import { addRackHighlight } from './rack-highlight.js';
import { drawSpatial3d } from './spatial.js';
// 三维查看器消费同一 Layout 与 Runtime；对象映射仅用于命中和增量显示。
export function createThreeRenderer(api) {
  const runtimeNodes = new Map();
  const areaNodes = new Map();
  const rackNodes = new Map();
  // 选择只切换装饰层，不销毁货架网格，也不改变相机观察目标。
  function updateSelection() {
    const { cad, zone } = api.state();
    for (const [id, entry] of rackNodes) {
      const active = cad.has(id) && (zone === 'ALL' || entry.rack.fgCode === zone);
      if (active && !entry.highlight) {
        entry.highlight = new THREE.Group();
        addRackHighlight(entry.highlight, entry.rack);
        entry.group.add(entry.highlight);
      }
      if (entry.highlight) entry.highlight.visible = active;
    }
    updateRuntime();
  }
  // 刷新指定物理区域的摘要纹理，不重建整个场景。
  function updateArea(id) {
    areaNodes.get(id)?.();
  }
  // 按业务编码只刷新受影响货位的颜色和示意箱堆。
  function updateLocation(code) {
    runtimeNodes.get(code)?.();
  }
  // 快照变化时刷新所有已缓存运行态图形；几何结构保持不变。
  function updateRuntime() {
    for (const refresh of runtimeNodes.values()) refresh();
    for (const refresh of areaNodes.values()) refresh();
  }
  let renderer, scene, camera, controls, world, wrap;
  // 首次显示三维时创建 WebGL、相机与控制器；重复调用复用现有实例。
  function mount(container, viewport) {
    if (renderer) return;
    wrap = viewport;
    const matches = r => api.state().zone === 'ALL' || r.fgCode === api.state().zone;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true });
      renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
      renderer.setClearColor('#edf2f5');
      container.append(renderer.domElement);
      scene = new THREE.Scene();
      camera = new THREE.PerspectiveCamera(45, 1, 0.1, 1000);
      camera.position.set(38, 38, 42);
      controls = new OrbitControls(camera, renderer.domElement);
      controls.target.set(16, 0, 11);
      controls.enableDamping = true;
      // 沿鼠标指向缩放，复用原生控制器，不增加场景遍历；距离下限不代表模型碰撞保护。
      controls.zoomToCursor = true;
      controls.minDistance = 1;
      scene.add(new THREE.HemisphereLight(0xffffff, 0x748a98, 2.5));
      const light = new THREE.DirectionalLight(0xffffff, 3);
      light.position.set(12, 30, 18);
      scene.add(light);
      scene.add(new THREE.GridHelper(100, 50, 0xb8cbd4, 0xd8e2e7));
      world = new THREE.Group();
      scene.add(world);
      const ray = new THREE.Raycaster(),
        pointer = new THREE.Vector2();
      let down;
      renderer.domElement.addEventListener('pointerdown', e => (down = [e.clientX, e.clientY]));
      renderer.domElement.addEventListener('pointerup', e => {
        if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 5) return;
        const b = renderer.domElement.getBoundingClientRect();
        // 将容器内像素转换为 [-1, 1] 标准化设备坐标，再由相机射线执行拾取。
        pointer.set(((e.clientX - b.left) / b.width) * 2 - 1, (-(e.clientY - b.top) / b.height) * 2 + 1);
        ray.setFromCamera(pointer, camera);
        const hit = ray
          .intersectObjects(world.children, true)
          .find(
            h =>
              h.object.userData.doorId ||
              h.object.userData.areaId ||
              (h.object.userData.rackId &&
                matches(api.state().model.racks.find(r => r.id === h.object.userData.rackId)))
          );
        if (hit) api.select(hit.object.userData);
      });
      // 只在三维视图激活时绘制；OrbitControls 阻尼需要逐帧更新。
      renderer.setAnimationLoop(() => {
        if (api.state().view === '3d') {
          controls.update();
          renderer.render(scene, camera);
        }
      });
      resize();
    } catch (e) {
      console.error('三维视图初始化失败', e);
      container.textContent = '当前设备无法创建三维视图，请检查 WebGL 支持。二维编辑仍可使用。';
    }
  }
  // 创建长方体网格并挂载命中元数据；userData 保存身份引用，不是业务模型副本。
  function box(parent, w, h, d, x, y, z, color, data = {}) {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, d),
      new THREE.MeshStandardMaterial({ color, roughness: 0.75 })
    );
    mesh.position.set(x, y, z);
    mesh.userData = data;
    parent.add(mesh);
    return mesh;
  }
  // 布局或视图结构改变才重建 world；移除旧网格前释放几何、材质和纹理以免 GPU 内存累积。
  function renderLayout() {
    const { model, level, colorMode, slotId, spatial } = api.state();
    const visible = () => model.racks.filter(r => r.spaceId === 'main');
    const matches = r => api.state().zone === 'ALL' || r.fgCode === api.state().zone;
    if (!world) return;
    runtimeNodes.clear();
    areaNodes.clear();
    rackNodes.clear();
    while (world.children.length) {
      const obj = world.children[0];
      obj.traverse(o => {
        o.geometry?.dispose();
        if (o.material) {
          o.material.map?.dispose();
          o.material.dispose();
        }
      });
      world.remove(obj);
    }
    drawSpatial3d(
      {
        ...spatial,
        model: () => model,
        areaRuntime: id => api.state().areaRuntime(id),
        registerArea: (id, refresh) => areaNodes.set(id, refresh),
      },
      world,
      box
    );
    for (const r of visible()) {
      const g = new THREE.Group();
      // 地图 x/y 映射到 Three 的 x/z 地面，Three 的 y 为高度；顺时针角度转换为负 Y 轴弧度。
      g.position.set(r.x, 0, r.y);
      g.rotation.y = (-r.rotation * Math.PI) / 180;
      world.add(g);
      const w = r.cols * r.width,
        h = r.levels * r.levelHeight,
        frame = colorMode === 'fg' ? fgColor(r.fgCode) : '#506c7e';
      for (let c = 0; c <= r.cols; c++)
        for (const z of [0, r.depth]) box(g, 0.07, h, 0.07, c * r.width, h / 2, z, frame, { rackId: r.id });
      for (let l = 1; l <= r.levels; l++) {
        if (level && level !== l) continue;
        const y = (l - 1) * r.levelHeight + 0.1;
        box(g, w, 0.08, r.depth, w / 2, y, r.depth / 2, '#c8d7df', { rackId: r.id });
        for (const s of r.slots.filter(s => s.level === l)) {
          const data = { rackId: r.id, slotId: s.id };
          const base = box(
            g,
            r.width - 0.08,
            0.03,
            r.depth - 0.08,
            (s.col - 0.5) * r.width,
            y + 0.06,
            r.depth / 2,
            s.id === slotId ? '#f9e6a8' : colorMode === 'fg' ? fgColor(r.fgCode) : '#edf0f2',
            data
          );
          const boxes = [];
          // 最多六个箱体仅用于占用示意，不代表真实堆码或完整外箱数量。
          const n = 6;
          for (let k = 0; k < n; k++) {
            const bw = (r.width - 0.25) / 2,
              bh = Math.min(0.32, (r.levelHeight - 0.2) / 3);
            boxes.push(
              box(
                g,
                bw,
                bh,
                r.depth * 0.68,
                (s.col - 1) * r.width + 0.12 + bw / 2 + (k % 2) * (bw + 0.03),
                y + 0.1 + bh / 2 + Math.floor(k / 2) * (bh + 0.02),
                r.depth / 2,
                s.id === slotId ? '#f9e6a8' : colorMode === 'fg' ? fgColor(r.fgCode) : '#edcba6',
                data
              )
            );
          }
          // 复用网格改变材质和可见性；未知数量隐藏示意箱体，不显示假库存。
          const refresh = () => {
            const count = runtimeCount(api.state().runtime, s.code);
            base.material.color.set(
              s.id === api.state().slotId
                ? '#f9e6a8'
                : colorMode === 'fg'
                  ? fgColor(r.fgCode)
                  : runtimeColor(api.state().runtime, [s.code], '#81c8b8', '#e4ebef')
            );
            boxes.forEach((mesh, index) => {
              mesh.visible = count !== null && index < Math.min(count, 6);
            });
          };
          runtimeNodes.set(s.code, refresh);
          refresh();
        }
      }
      rackNodes.set(r.id, { group: g, rack: r, highlight: null });
      if (!matches(r))
        g.traverse(o => {
          if (o.material) {
            o.material.transparent = true;
            o.material.opacity = 0.16;
            o.material.depthWrite = false;
          }
        });
    }
    updateSelection();
  }
  // 同步 WebGL 画布尺寸与相机纵横比，更新投影矩阵。
  function resize() {
    if (renderer) {
      renderer.setSize(wrap.clientWidth, wrap.clientHeight);
      camera.aspect = wrap.clientWidth / Math.max(1, wrap.clientHeight);
      camera.updateProjectionMatrix();
    }
  }
  // 按二维世界范围设置观察目标和相机距离，不改变对象位置。
  function focusObject(b) {
    if (!controls) return;
    const d = Math.max(b.width, b.depth, 5);
    controls.target.set(b.x + b.width / 2, 0, b.y + b.depth / 2);
    camera.position.set(b.x + b.width / 2 + d * 0.7, d * 1.2, b.y + b.depth / 2 + d);
    controls.update();
  }
  // 将全局世界范围转换成三维相机位置与观察中心。
  function fitToView({ minX, minY, maxX, maxY }) {
    if (!controls) return;
    const cx = (minX + maxX) / 2,
      cy = (minY + maxY) / 2,
      d = Math.max(maxX - minX, maxY - minY, 25);
    camera.position.set(cx + d * 0.6, d, cy + d * 0.8);
    controls.target.set(cx, 0, cy);
    controls.update();
  }
  // 停止动画、释放控制器和 GPU 资源，并移除画布；单纯移除 DOM 不足以释放 WebGL 资源。
  function destroy() {
    controls?.dispose();
    renderer?.setAnimationLoop(null);
    scene?.traverse(object => {
      object.geometry?.dispose();
      if (object.material) {
        object.material.map?.dispose();
        object.material.dispose();
      }
    });
    renderer?.dispose();
    renderer?.domElement.remove();
    renderer = null;
  }
  return {
    mount,
    updateSelection,
    renderLayout,
    updateRuntime,
    updateLocation,
    updateArea,
    focusObject,
    fitToView,
    resize,
    destroy,
  };
}
