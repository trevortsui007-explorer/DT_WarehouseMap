// 解码校验在基础设施层完成，Core 不访问 Image 或 FileReader。
export function decodeUnderlay(dataUrl) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      if (!image.naturalWidth || image.naturalWidth * image.naturalHeight > 50000000)
        reject(Error('图片尺寸无效或超过 5000 万像素'));
      else resolve(image);
    };
    image.onerror = () => reject(Error('图片损坏或无法加载，旧底图保持不变'));
    image.src = dataUrl;
  });
}
export async function readUnderlay(file) {
  if (!file || !['image/png', 'image/jpeg'].includes(file.type) || file.size > 20 * 1024 * 1024)
    throw Error('请选择不超过 20 MB 的 PNG/JPEG');
  const dataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(Error('无法读取图片'));
    reader.readAsDataURL(file);
  });
  const image = await decodeUnderlay(dataUrl);
  return { dataUrl, name: file.name, pixelWidth: image.naturalWidth, pixelHeight: image.naturalHeight };
}
export async function verifyUnderlay(image) {
  if (!image) return;
  const decoded = await decodeUnderlay(image.dataUrl);
  if (decoded.naturalWidth !== image.pixelWidth || decoded.naturalHeight !== image.pixelHeight)
    throw Error('图片实际尺寸与备份不符');
}
