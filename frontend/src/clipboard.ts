async function imageToPngBlob(url: string): Promise<Blob> {
  const blob = await (await fetch(url)).blob()
  if (blob.type === 'image/png') return blob

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
  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('图片转换失败'))), 'image/png'),
  )
}

function canWriteImageClipboard(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    !!navigator.clipboard?.write &&
    typeof ClipboardItem !== 'undefined'
  )
}

export function normalizeClipboardError(err: unknown): Error {
  if (err instanceof Error) {
    if (err.name === 'NotAllowedError' || /not allowed|permission/i.test(err.message)) {
      return new Error('浏览器拒绝写入剪贴板,可右键图片选择复制图片')
    }
    return err
  }
  return new Error('复制失败:浏览器不支持或没给剪贴板权限')
}

export function prepareImageForClipboard(url: string): Promise<Blob> {
  return imageToPngBlob(url)
}

export async function copyPreparedImageToClipboard(pngBlob: Blob): Promise<void> {
  if (!canWriteImageClipboard()) {
    throw new Error('当前浏览器不支持复制图片到剪贴板')
  }

  try {
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': pngBlob })])
  } catch (err) {
    throw normalizeClipboardError(err)
  }
}

// 把一张图片复制进系统剪贴板。
// 浏览器剪贴板基本只收 PNG,其他格式(jpg/webp)先画到画布上转一道再写入。
export async function copyImageToClipboard(url: string): Promise<void> {
  if (!canWriteImageClipboard()) {
    throw new Error('当前浏览器不支持复制图片到剪贴板')
  }

  try {
    // clipboard.write 必须尽早在点击/右键这个用户手势里触发;
    // 图片下载和转码放进 Promise,否则部分浏览器会在 await 后拒绝权限。
    await navigator.clipboard.write([
      new ClipboardItem({ 'image/png': imageToPngBlob(url) }),
    ])
  } catch {
    const prepared = await prepareImageForClipboard(url)
    await copyPreparedImageToClipboard(prepared)
  }
}
