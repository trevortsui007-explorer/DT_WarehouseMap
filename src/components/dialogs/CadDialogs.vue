<template>
  <dialog id="precise-dialog">
    <form id="precise-form">
      <h2>精确移动与旋转</h2>
      <p class="muted">先绕基点旋转，再沿世界坐标移动。正角度为顺时针。</p>
      <div class="fields">
        <label>X 位移 / 米<input name="dx" type="number" step="any" value="0" required /></label
        ><label>Y 位移 / 米<input name="dy" type="number" step="any" value="0" required /></label
        ><label>旋转角度 / 度<input name="angle" type="number" step="any" value="0" required /></label
        ><label
          >旋转基点<select name="pivot">
            <option value="center">所选对象整体中心</option>
            <option value="custom">自定义坐标</option>
          </select></label
        ><label>自定义基点 X / 米<input id="pivot-x" name="px" type="number" step="any" value="0" required /></label
        ><label>自定义基点 Y / 米<input id="pivot-y" name="py" type="number" step="any" value="0" required /></label>
      </div>
      <p id="precise-error" class="form-error" role="alert"></p>
      <div class="actions"><button class="primary">应用</button><button type="button" data-close>取消</button></div>
    </form>
  </dialog>
  <dialog id="array-dialog">
    <form id="array-form">
      <h2>阵列复制</h2>
      <p class="muted">行列总数包含原件。复制货架会生成新货位；运行态独立来自 WMS。</p>
      <div class="fields">
        <label>行数 / Y 方向<input name="rows" type="number" min="1" max="20" value="2" required /></label
        ><label>列数 / X 方向<input name="cols" type="number" min="1" max="20" value="1" required /></label
        ><label>列间净距 / 米<input name="gapX" type="number" min="0" max="100" step="any" value="2" required /></label
        ><label>行间净距 / 米<input name="gapY" type="number" min="0" max="100" step="any" value="2" required /></label>
      </div>
      <p id="array-summary" class="muted"></p>
      <p id="array-error" class="form-error" role="alert"></p>
      <div class="actions">
        <button id="array-confirm" class="primary">确认生成</button><button type="button" data-close>取消</button>
      </div>
    </form>
  </dialog>
  <dialog id="delete-dialog">
    <h2>删除所选对象</h2>
    <p id="delete-message"></p>
    <div class="actions">
      <button id="delete-confirm" class="danger">确认删除</button><button data-close>取消</button>
    </div>
  </dialog>
  <dialog id="shortcuts-dialog">
    <h2>快捷键与选择操作</h2>
    <table class="shortcut-table">
      <tbody>
        <tr>
          <th>Ctrl + Z</th>
          <td>撤销</td>
        </tr>
        <tr>
          <th>Ctrl + Shift + Z / Ctrl + Y</th>
          <td>重做</td>
        </tr>
        <tr>
          <th>Ctrl + S</th>
          <td>保存到本机</td>
        </tr>
        <tr>
          <th>Ctrl + D</th>
          <td>复制所选货架／区域</td>
        </tr>
        <tr>
          <th>Delete</th>
          <td>删除所选对象，需确认；不删除货位或边界</td>
        </tr>
        <tr>
          <th>方向键 / Shift + 方向键</th>
          <td>移动 0.1 米 / 1 米</td>
        </tr>
        <tr>
          <th>Q / E</th>
          <td>绕所选对象整体中心逆／顺时针旋转 90°</td>
        </tr>
        <tr>
          <th>F / Home</th>
          <td>聚焦选择 / 全仓适配</td>
        </tr>
        <tr>
          <th>空格＋拖动 / 平移按钮</th>
          <td>平移二维地图</td>
        </tr>
        <tr>
          <th>Alt＋拖动</th>
          <td>临时关闭吸附</td>
        </tr>
        <tr>
          <th>Shift＋点击或框选</th>
          <td>追加／切换选择</td>
        </tr>
        <tr>
          <th>左→右框选 / 右→左框选</th>
          <td>完整包含 / 相交即选</td>
        </tr>
        <tr>
          <th>Esc</th>
          <td>取消拖动、框选，或清除选择</td>
        </tr>
        <tr>
          <th>? / F1</th>
          <td>打开本帮助</td>
        </tr>
      </tbody>
    </table>
    <p class="muted">
      输入框内保留文字编辑快捷键。位置编辑只在二维启用。FG 筛选中淡化的货架不参与选择。仓库边界仅通过属性面板编辑。
    </p>
    <button data-close class="primary">知道了</button>
  </dialog>
</template>
