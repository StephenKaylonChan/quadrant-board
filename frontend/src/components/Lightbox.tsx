import { useState } from 'react'
import type { MouseEvent as ReactMouseEvent } from 'react'
import { copyImageToClipboard } from '../clipboard'
import { useDocumentEvent } from '../hooks/useDocumentEvent'

interface Props {
  url: string
  onClose: () => void
}

// 自制的图片预览层(灯箱):点空白处或 Esc 关闭,右键直接复制图片
export default function Lightbox({ url, onClose }: Props) {
  const [toast, setToast] = useState('')

  useDocumentEvent('keydown', (e) => {
    if (e.key === 'Escape') onClose()
  })

  async function copyCurrentImage() {
    try {
      await copyImageToClipboard(url)
      setToast('已复制到剪贴板')
    } catch (err) {
      setToast(err instanceof Error ? err.message : '复制失败:浏览器不支持或没给剪贴板权限')
    }
    window.setTimeout(() => setToast(''), 1500)
  }

  async function handleContextMenu(e: ReactMouseEvent) {
    e.preventDefault() // 拦掉浏览器默认右键菜单,改成"右键即复制"
    await copyCurrentImage()
  }

  return (
    <div className="lightbox" onClick={onClose} onContextMenu={(e) => void handleContextMenu(e)}>
      {/* 点图片本身不关闭,方便在图上右键 */}
      <img src={url} alt="图片预览" onClick={(e) => e.stopPropagation()} />
      <div className="lightbox-actions" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="lightbox-copy" onClick={() => void copyCurrentImage()}>
          复制图片
        </button>
        <span className="lightbox-hint">也可右键复制 · 点空白处或按 Esc 关闭</span>
      </div>
      {toast && <span className="lightbox-toast">{toast}</span>}
      <button type="button" className="lightbox-x" onClick={onClose} aria-label="关闭预览">
        ×
      </button>
    </div>
  )
}
