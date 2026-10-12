<script setup>
defineProps({ name: String });
// 原生 SVG 复用工具栏图标；继承按钮颜色与禁用状态，不影响按钮名称。
const paths = {
  layout: 'M3 3h18v18H3z M3 9h18 M9 9v12',
  undo: 'M8 4L3 9l5 5 M3 9h11a6 6 0 0 1 0 12',
  redo: 'M16 4l5 5-5 5 M21 9H10a6 6 0 0 0 0 12',
  export: 'M12 3v12 M8 11l4 4 4-4 M4 16v5h16v-5',
  save: 'M4 3h13l3 3v15H4z M8 3v6h8V3 M8 21v-8h8v8',
  upload: 'M12 16V3 M8 7l4-4 4 4 M4 16v5h16v-5',
  draft: 'M14 3H5v18h14V8z M14 3v5h5 M8 12h8 M8 16h6',
  publish: 'M12 16V3 M7 8l5-5 5 5 M4 15v6h16v-6',
  published: 'M14 3H5v18h14V8z M14 3v5h5 M8 14l3 3 5-6',
  close: 'M6 6l12 12 M18 6L6 18',
  check: 'M5 12l4 4L19 6',
  info: 'M12 11v6 M12 7h.01 M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',
  warehouse: 'M3 21V8l9-5 9 5v13H3z M7 21V11h10v10 M7 15h10 M7 18h10 M10 7h4',
  pan: 'M12 3v18 M3 12h18 M9 6l3-3 3 3 M9 18l3 3 3-3 M6 9l-3 3 3 3 M18 9l3 3-3 3',
  focus: 'M8 3H3v5 M16 3h5v5 M3 16v5h5 M21 16v5h-5 M8 8h8v8H8z',
  copy: 'M9 9h11v11H9z M15 6V3H3v12h3',
  delete: 'M4 6h16 M9 6V3h6v3 M6 6l1 15h10l1-15 M10 10v7 M14 10v7',
  align: 'M4 3v18 M8 5h12v5H8z M8 14h8v5H8z',
  precise: 'M4 4h10v10H4z M14 9h6 M17 6l3 3-3 3 M9 14v6 M6 17l3 3 3-3',
  array: 'M3 3h6v6H3z M15 3h6v6h-6z M3 15h6v6H3z M15 15h6v6h-6z',
  help: 'M9 9a3 3 0 1 1 5 2c-2 1-2 2-2 3 M12 17h.01 M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',
  reset: 'M4 9a8 8 0 1 1 0 7 M4 3v6h6',
};
</script>
<template>
  <svg
    class="tool-icon"
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.6"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
    focusable="false"
  >
    <path :d="paths[name]" />
  </svg>
</template>
<style scoped>
.tool-icon {
  flex-shrink: 0;
  vertical-align: middle;
}
</style>
