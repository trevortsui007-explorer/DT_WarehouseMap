// 将当前布局序列化为下载文件；对象 URL 用完延迟释放，避免打断浏览器开始下载。
export function exportLayout(model) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(model, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'warehouse-layout.json';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
