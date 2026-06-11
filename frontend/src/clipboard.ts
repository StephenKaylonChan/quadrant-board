// 把一张图片复制进系统剪贴板。
// 浏览器剪贴板基本只收 PNG,其他格式(jpg/webp)先画到画布上转一道再写入。
export async function copyImageToClipboard(url: string): Promise<void> {
  if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') {
    throw new Error('当前浏览器不支持复制图片到剪贴板')
  }

  const blob = await (await fetch(url)).blob()
  let pngBlob = blob
  if (blob.type !== 'image/png') {
    if (typeof createImageBitmap === 'undefined') {
      throw new Error('当前浏览器不支持图片转码')
    }
    const bitmap = await createImageBitmap(blob)
    const canvas = document.createElement('canvas')
    canvas.width = bitmap.width
    canvas.height = bitmap.height
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('浏览器无法创建图片画布')
    ctx.drawImage(bitmap, 0, 0)
    pngBlob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('图片转换失败'))), 'image/png'),
    )
  }
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': pngBlob })])
}
