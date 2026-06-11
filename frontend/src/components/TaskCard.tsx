import { useState } from 'react'
import type { DragEvent, MouseEvent as ReactMouseEvent } from 'react'
import { imageUrl } from '../api'
import { copyImageToClipboard } from '../clipboard'
import { dueLabel } from '../dates'
import { STATUS_META } from '../statusMeta'
import type { Task, TaskImage } from '../types'

interface Props {
  task: Task
  index: number // 在象限内的位置序号(从 1 开始,跟着拖拽顺序变)
  dragging: boolean
  draggable?: boolean
  allowDelete?: boolean
  onClick: () => void
  onDelete: () => void // 点卡片上的 ×,由 App 弹二次确认
  onDragStart: () => void
  onDragEnd: () => void
  // 把别的卡片拖到这张卡上松手:after 表示插到这张卡的后面还是前面
  onDropOnCard: (after: boolean) => void
}

export default function TaskCard({
  task,
  index,
  dragging,
  draggable = true,
  allowDelete = true,
  onClick,
  onDelete,
  onDragStart,
  onDragEnd,
  onDropOnCard,
}: Props) {
  const [copyTip, setCopyTip] = useState<{ id: number; text: string } | null>(null)
  const [dropSide, setDropSide] = useState<'before' | 'after' | null>(null)

  function dropAfter(e: DragEvent<HTMLElement>): boolean {
    // 两列网格里判断"放前面还是后面":以反对角线分割,
    // 落点偏左上算前面,偏右下算后面
    const r = e.currentTarget.getBoundingClientRect()
    return (e.clientX - r.left) / r.width + (e.clientY - r.top) / r.height > 1
  }

  function handleDrop(e: DragEvent<HTMLElement>) {
    e.preventDefault()
    e.stopPropagation() // 别让象限的 onDrop 再处理一遍
    setDropSide(null)
    onDropOnCard(dropAfter(e))
  }

  async function copyThumb(e: ReactMouseEvent, img: TaskImage) {
    e.stopPropagation() // 点缩略图只复制,不打开编辑弹窗
    try {
      await copyImageToClipboard(imageUrl(img))
      setCopyTip({ id: img.id, text: '已复制' })
    } catch (err) {
      setCopyTip({ id: img.id, text: err instanceof Error ? err.message : '复制失败' })
    }
    window.setTimeout(() => setCopyTip(null), 1600)
  }

  const due = dueLabel(task.due_date)
  const statusMeta = STATUS_META[task.status]
  const dropClass = dropSide === null || dragging || !draggable ? '' : ` card-drop-${dropSide}`
  const overdueClass = due?.overdue ? ' card-overdue' : ''

  return (
    <article
      className={`card card-${task.status}${overdueClass}${dragging ? ' card-dragging' : ''}${!draggable ? ' card-static' : ''}${dropClass}`}
      draggable={draggable}
      onClick={onClick}
      onDragStart={(e) => {
        if (!draggable) return
        e.dataTransfer.effectAllowed = 'move'
        onDragStart()
      }}
      onDragEnd={() => {
        if (!draggable) return
        setDropSide(null)
        onDragEnd()
      }}
      onDragOver={(e) => {
        if (!draggable) return
        e.preventDefault()
        if (!dragging) setDropSide(dropAfter(e) ? 'after' : 'before')
      }}
      onDragLeave={(e) => {
        if (!draggable) return
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
          setDropSide(null)
        }
      }}
      onDrop={draggable ? handleDrop : undefined}
    >
      <div className="card-top">
        <span className="card-top-left">
          <span className="card-index">{index}</span>
          <span className={`chip chip-${task.status}`}>
            <span className="chip-icon" aria-hidden="true">{statusMeta.icon}</span>
            {statusMeta.label}
          </span>
        </span>
        <span className="card-top-right">
          {due && (
            <span className={`chip ${due.overdue ? 'chip-overdue' : 'chip-due'}`}>{due.text}</span>
          )}
          {allowDelete && (
            <button
              type="button"
              className="card-x"
              title="删除任务"
              aria-label="删除任务"
              onClick={(e) => {
                e.stopPropagation() // 别触发卡片的"打开编辑"
                onDelete()
              }}
            >
              ×
            </button>
          )}
        </span>
      </div>
      <h3 className="card-title">{task.title}</h3>
      {task.description && <p className="card-desc">{task.description}</p>}
      {task.images.length > 0 && (
        <div className="card-thumbs">
          {task.images.map((img) => (
            <button
              key={img.id}
              type="button"
              className="card-thumb"
              title="点击复制图片到剪贴板"
              onClick={(e) => void copyThumb(e, img)}
            >
              <img src={imageUrl(img)} alt={img.original_name || '任务图片'} />
              {copyTip?.id === img.id && <span className="copied-badge">{copyTip.text}</span>}
            </button>
          ))}
        </div>
      )}
    </article>
  )
}
