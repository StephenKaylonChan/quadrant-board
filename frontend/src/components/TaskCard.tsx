import { useState } from 'react'
import type { DragEvent, MouseEvent as ReactMouseEvent } from 'react'
import { imageUrl } from '../api'
import { copyImageToClipboard } from '../clipboard'
import { dueLabel } from '../dates'
import type { Task, TaskImage, TaskStatus } from '../types'

interface Props {
  task: Task
  index: number // 在象限内的位置序号(从 1 开始,跟着拖拽顺序变)
  dragging: boolean
  onClick: () => void
  onDelete: () => void // 点卡片上的 ×,由 App 弹二次确认
  onDragStart: () => void
  onDragEnd: () => void
  // 把别的卡片拖到这张卡上松手:after 表示插到这张卡的后面还是前面
  onDropOnCard: (after: boolean) => void
}

const STATUS_LABEL: Record<TaskStatus, string> = {
  todo: '待办',
  doing: '进行中',
  review: '待 Review',
  verify: '待验证',
  done: '已完成',
}

// 卡片上最多直接展示几张缩略图,多出来的显示 +N
const MAX_THUMBS = 4

export default function TaskCard({
  task,
  index,
  dragging,
  onClick,
  onDelete,
  onDragStart,
  onDragEnd,
  onDropOnCard,
}: Props) {
  const [copiedId, setCopiedId] = useState<number | null>(null)

  function handleDrop(e: DragEvent<HTMLElement>) {
    e.preventDefault()
    e.stopPropagation() // 别让象限的 onDrop 再处理一遍
    // 两列网格里判断"放前面还是后面":以反对角线分割,
    // 落点偏左上算前面,偏右下算后面
    const r = e.currentTarget.getBoundingClientRect()
    const after = (e.clientX - r.left) / r.width + (e.clientY - r.top) / r.height > 1
    onDropOnCard(after)
  }

  async function copyThumb(e: ReactMouseEvent, img: TaskImage) {
    e.stopPropagation() // 点缩略图只复制,不打开编辑弹窗
    try {
      await copyImageToClipboard(imageUrl(img))
      setCopiedId(img.id)
      window.setTimeout(() => setCopiedId(null), 1200)
    } catch {
      /* 复制失败时不打断操作,静默忽略 */
    }
  }

  const thumbs = task.images.slice(0, MAX_THUMBS)
  const extra = task.images.length - thumbs.length
  const due = dueLabel(task.due_date)

  return (
    <article
      className={`card card-${task.status}${dragging ? ' card-dragging' : ''}`}
      draggable
      onClick={onClick}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'move'
        onDragStart()
      }}
      onDragEnd={onDragEnd}
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleDrop}
    >
      <div className="card-top">
        <span className="card-top-left">
          <span className="card-index">{index}</span>
          <span className={`chip chip-${task.status}`}>{STATUS_LABEL[task.status]}</span>
        </span>
        <span className="card-top-right">
          {due && (
            <span className={`chip ${due.overdue ? 'chip-overdue' : 'chip-due'}`}>{due.text}</span>
          )}
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
        </span>
      </div>
      <h3 className="card-title">{task.title}</h3>
      {task.description && <p className="card-desc">{task.description}</p>}
      {thumbs.length > 0 && (
        <div className="card-thumbs">
          {thumbs.map((img) => (
            <button
              key={img.id}
              type="button"
              className="card-thumb"
              title="点击复制图片到剪贴板"
              onClick={(e) => void copyThumb(e, img)}
            >
              <img src={imageUrl(img)} alt={img.original_name || '任务图片'} />
              {copiedId === img.id && <span className="copied-badge">已复制</span>}
            </button>
          ))}
          {extra > 0 && <span className="card-thumb-more">+{extra}</span>}
        </div>
      )}
    </article>
  )
}
