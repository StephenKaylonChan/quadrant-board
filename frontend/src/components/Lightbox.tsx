import { useEffect, useState } from 'react'
import { copyImageToClipboard, copyPreparedImageToClipboard, prepareImageForClipboard } from '../clipboard'
import { useDocumentEvent } from '../hooks/useDocumentEvent'

interface Props {
  url: string
  onClose: () => void
}

// 自制的图片预览层(灯箱):点空白处或 Esc 关闭,按钮复制;右键保留浏览器原生菜单兜底
export default function Lightbox({ url, onClose }: Props) {
  const [toast, setToast] = useState('')
  const [preparedBlob, setPreparedBlob] = useState<Blob | null>(null)
  const [preparing, setPreparing] = useState(false)

  useDocumentEvent('keydown', (e) => {
    if (e.key === 'Escape') onClose()
  })

  useEffect(() => {
    let cancelled = false
    setPreparedBlob(null)
    setPreparing(true)
    prepareImageForClipboard(url)
      .then((blob) => {
        if (!cancelled) setPreparedBlob(blob)
      })
      .catch(() => {
        if (!cancelled) setPreparedBlob(null)
      })
      .finally(() => {
        if (!cancelled) setPreparing(false)
      })
    return () => {
      cancelled = true
    }
  }, [url])

  async function copyCurrentImage() {
    if (preparing) {
      setToast('图片还在准备中,稍后再试')
      window.setTimeout(() => setToast(''), 1500)
      return
    }
    try {
      if (preparedBlob) await copyPreparedImageToClipboard(preparedBlob)
      else await copyImageToClipboard(url)
      setToast('已复制到剪贴板')
    } catch (err) {
      setToast(err instanceof Error ? err.message : '复制失败:浏览器不支持或没给剪贴板权限')
    }
    window.setTimeout(() => setToast(''), 1500)
  }

  return (
    <div className="lightbox" onClick={onClose}>
      {/* 点图片本身不关闭,右键保留浏览器原生菜单 */}
      <img src={url} alt="图片预览" onClick={(e) => e.stopPropagation()} />
      <div className="lightbox-actions" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="lightbox-copy" disabled={preparing} onClick={() => void copyCurrentImage()}>
          {preparing ? '准备中' : '复制图片'}
        </button>
        <span className="lightbox-hint">也可右键图片用浏览器菜单复制 · 点空白处或按 Esc 关闭</span>
      </div>
      {toast && <span className="lightbox-toast">{toast}</span>}
      <button type="button" className="lightbox-x" onClick={onClose} aria-label="关闭预览">
        ×
      </button>
    </div>
  )
}
