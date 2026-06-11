import { useEffect, useRef, useState } from 'react'
import {
  createTask,
  deleteImage,
  deleteTask,
  imageUrl,
  updateTask,
  uploadImages,
} from '../api'
import type { TaskDraft } from '../api'
import { addDays, todayStr } from '../dates'
import type { Task, TaskImage, TaskStatus } from '../types'
import Lightbox from './Lightbox'

interface Props {
  task: Task | null // null = 新建模式,有值 = 编辑这个任务
  draft?: TaskDraft | null // 新建模式下的预填内容(AI 拆解的草稿)
  heading?: string // 弹窗标题,不传用默认
  onClose: () => void
  onChanged: () => Promise<void> | void // 数据变了通知 App 重新拉列表
}

const STATUS_OPTIONS: { value: TaskStatus; label: string }[] = [
  { value: 'todo', label: '待办' },
  { value: 'doing', label: '进行中' },
  { value: 'review', label: '待 Review' },
  { value: 'verify', label: '待验证' },
  { value: 'done', label: '已完成' },
]

// 截止日期的快捷选择;"选日期"会展开一个日期输入框
type DueChoice = 'today' | 'tomorrow' | 'date' | 'none'

const DUE_OPTIONS: { value: DueChoice; label: string }[] = [
  { value: 'today', label: '今天' },
  { value: 'tomorrow', label: '明天' },
  { value: 'date', label: '选日期' },
  { value: 'none', label: '无期限' },
]

function choiceOf(due: string | null): DueChoice {
  if (due === null) return 'none'
  if (due === todayStr()) return 'today'
  if (due === addDays(todayStr(), 1)) return 'tomorrow'
  return 'date'
}

// 新建模式下还没上传的图片:本地文件 + 预览地址
interface PendingImage {
  file: File
  url: string
}

export default function TaskEditor({ task, draft, heading, onClose, onChanged }: Props) {
  const isEdit = task !== null

  // 初始截止日期:编辑用任务自己的;AI 草稿用 AI 给的;手动新建默认今天
  const initialDue = task !== null ? task.due_date : draft != null ? draft.due_date : todayStr()
  const initialImportant = task?.important ?? draft?.important ?? true

  const [title, setTitle] = useState(task?.title ?? draft?.title ?? '')
  const [description, setDescription] = useState(task?.description ?? draft?.description ?? '')
  const [important, setImportant] = useState(initialImportant)
  const [dueChoice, setDueChoice] = useState<DueChoice>(() => choiceOf(initialDue))
  const [customDate, setCustomDate] = useState(initialDue ?? todayStr())
  const [status, setStatus] = useState<TaskStatus>(task?.status ?? draft?.status ?? 'todo')
  const [confirmClose, setConfirmClose] = useState(false) // 点弹窗外面时的"是否保存"小对话框
  const [confirmDelete, setConfirmDelete] = useState(false) // 删除任务的二次确认
  const [images, setImages] = useState<TaskImage[]>(task?.images ?? [])
  const [pending, setPending] = useState<PendingImage[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [lightbox, setLightbox] = useState<string | null>(null) // 正在全屏预览的图片地址
  const fileInputRef = useRef<HTMLInputElement>(null)

  // 关闭弹窗时释放预览图占用的内存(URL.createObjectURL 创建的地址要手动回收)
  const pendingRef = useRef<PendingImage[]>([])
  pendingRef.current = pending
  useEffect(() => {
    return () => pendingRef.current.forEach((p) => URL.revokeObjectURL(p.url))
  }, [])

  async function addFiles(files: File[]) {
    const imgs = files.filter((f) => f.type.startsWith('image/'))
    if (imgs.length === 0) return

    if (isEdit && task) {
      // 编辑模式:直接上传到这个任务
      setBusy(true)
      setError('')
      try {
        const added = await uploadImages(task.id, imgs)
        setImages((prev) => [...prev, ...added])
        await onChanged()
      } catch (e) {
        setError(e instanceof Error ? e.message : '上传失败')
      } finally {
        setBusy(false)
      }
    } else {
      // 新建模式:先攒着,保存任务后一起上传
      setPending((prev) => [
        ...prev,
        ...imgs.map((file) => ({ file, url: URL.createObjectURL(file) })),
      ])
    }
  }

  // 监听整个页面的粘贴事件:弹窗开着时按 Ctrl/Cmd+V 就能贴图
  useEffect(() => {
    function onPaste(e: ClipboardEvent) {
      const files = Array.from(e.clipboardData?.files ?? [])
      if (files.length > 0) {
        e.preventDefault() // 是图片才拦截;纯文字照常粘贴进输入框
        void addFiles(files)
      }
    }
    document.addEventListener('paste', onPaste)
    return () => document.removeEventListener('paste', onPaste)
  })

  // 把快捷选择换算成具体日期(或 null = 无期限)
  function resolveDue(): string | null {
    if (dueChoice === 'none') return null
    if (dueChoice === 'today') return todayStr()
    if (dueChoice === 'tomorrow') return addDays(todayStr(), 1)
    return customDate || todayStr()
  }

  async function handleSubmit() {
    if (!title.trim()) {
      setError('标题不能为空')
      return
    }
    setBusy(true)
    setError('')
    try {
      const fields = {
        title: title.trim(),
        description,
        important,
        due_date: resolveDue(),
        status,
      }
      if (isEdit && task) {
        await updateTask(task.id, fields)
      } else {
        const created = await createTask(fields)
        if (pending.length > 0) {
          await uploadImages(created.id, pending.map((p) => p.file))
        }
      }
      await onChanged()
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存失败')
      setBusy(false) // 失败时留在弹窗里改;成功路径已经关掉了,不用恢复
    }
  }

  async function handleDelete() {
    if (!task) return
    setBusy(true)
    try {
      await deleteTask(task.id)
      await onChanged()
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : '删除失败')
      setBusy(false)
    }
  }

  async function removeImage(id: number) {
    setError('')
    try {
      await deleteImage(id)
      setImages((prev) => prev.filter((img) => img.id !== id))
      await onChanged()
    } catch (e) {
      setError(e instanceof Error ? e.message : '删除图片失败')
    }
  }

  function removePending(index: number) {
    setPending((prev) => {
      URL.revokeObjectURL(prev[index].url)
      return prev.filter((_, i) => i !== index)
    })
  }

  const quadrantName = `${important ? '重要' : '不重要'} · ${dueChoice === 'none' ? '无期限' : '有期限'}`

  // 有没有"关掉就会丢"的内容:编辑模式看字段是否改过;新建模式看是否填了东西
  const hasUnsaved = isEdit
    ? title !== task.title ||
      description !== task.description ||
      important !== task.important ||
      resolveDue() !== task.due_date ||
      status !== task.status
    : title.trim() !== '' ||
      description.trim() !== '' ||
      pending.length > 0 ||
      status !== (draft?.status ?? 'todo')

  // 点弹窗外面:没改动直接关,有改动先问一声
  function attemptClose() {
    if (busy) return
    if (hasUnsaved) setConfirmClose(true)
    else onClose()
  }

  return (
    <div
      className="overlay"
      onClick={(e) => {
        // 只有点在遮罩本身(弹窗外面)才触发,点弹窗里不算
        if (e.target === e.currentTarget) attemptClose()
      }}
    >
      <div className="modal" role="dialog" aria-modal="true">
        <h2>{heading ?? (isEdit ? '编辑任务' : '新任务')}</h2>

        <div className="field">
          <label className="field-label" htmlFor="task-title">标题</label>
          <input
            id="task-title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="一句话说清要做什么"
            autoFocus
          />
        </div>

        <div className="field">
          <label className="field-label" htmlFor="task-desc">备注</label>
          <textarea
            id="task-desc"
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="背景、线索、链接……(可留空)"
          />
        </div>

        <div className="field">
          <span className="field-label">重要吗?</span>
          <div className="seg">
            <button type="button" className={important ? 'on' : ''} onClick={() => setImportant(true)}>
              重要
            </button>
            <button type="button" className={!important ? 'on' : ''} onClick={() => setImportant(false)}>
              不重要
            </button>
          </div>
        </div>

        <div className="field">
          <span className="field-label">哪天截止?</span>
          <div className="due-row">
            <div className="seg">
              {DUE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  className={dueChoice === opt.value ? 'on' : ''}
                  onClick={() => setDueChoice(opt.value)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            {dueChoice === 'date' && (
              <input
                type="date"
                value={customDate}
                onChange={(e) => setCustomDate(e.target.value)}
                aria-label="具体截止日期"
              />
            )}
          </div>
        </div>

        <p className="quad-preview">
          会落在象限:<b>{quadrantName}</b>
        </p>

        <div className="field">
          <span className="field-label">状态</span>
          <div className="seg">
            {STATUS_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                className={status === opt.value ? 'on' : ''}
                onClick={() => setStatus(opt.value)}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <span className="field-label">图片</span>
          <div className="images">
            {images.map((img) => (
              <div key={img.id} className="thumb">
                <button
                  type="button"
                  className="thumb-pic"
                  onClick={() => setLightbox(imageUrl(img))}
                  title="点击放大预览"
                >
                  <img src={imageUrl(img)} alt={img.original_name || '任务图片'} />
                </button>
                <button
                  type="button"
                  className="thumb-x"
                  onClick={() => void removeImage(img.id)}
                  aria-label="删除图片"
                >
                  ×
                </button>
              </div>
            ))}
            {pending.map((p, i) => (
              <div key={p.url} className="thumb thumb-pending">
                <button
                  type="button"
                  className="thumb-pic"
                  onClick={() => setLightbox(p.url)}
                  title="点击放大预览"
                >
                  <img src={p.url} alt="待上传图片" />
                </button>
                <button
                  type="button"
                  className="thumb-x"
                  onClick={() => removePending(i)}
                  aria-label="移除图片"
                >
                  ×
                </button>
              </div>
            ))}
            <button
              type="button"
              className="thumb-add"
              onClick={() => fileInputRef.current?.click()}
            >
              + 选图
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              hidden
              onChange={(e) => {
                void addFiles(Array.from(e.target.files ?? []))
                e.target.value = '' // 清空 input,同一张图才能重复选
              }}
            />
          </div>
          <p className="paste-hint">截图后 Ctrl / Cmd + V 直接粘贴;点图片放大,预览里右键复制</p>
        </div>

        {lightbox && <Lightbox url={lightbox} onClose={() => setLightbox(null)} />}

        {confirmDelete && (
          <div className="confirm-layer">
            <div className="confirm-box">
              <p>确定删除「{task?.title}」?附带的图片也会一起删除。</p>
              <div className="confirm-actions">
                <button
                  type="button"
                  className="danger-btn"
                  onClick={() => {
                    setConfirmDelete(false)
                    void handleDelete()
                  }}
                >
                  删除
                </button>
                <button type="button" className="ghost-btn" onClick={() => setConfirmDelete(false)}>
                  取消
                </button>
              </div>
            </div>
          </div>
        )}

        {confirmClose && (
          <div className="confirm-layer">
            <div className="confirm-box">
              <p>{isEdit ? '有未保存的修改,要保存吗?' : '任务还没保存,要保存吗?'}</p>
              <div className="confirm-actions">
                <button
                  type="button"
                  className="primary-btn"
                  onClick={() => {
                    setConfirmClose(false)
                    void handleSubmit()
                  }}
                >
                  保存
                </button>
                <button type="button" className="danger-btn" onClick={onClose}>
                  不保存
                </button>
                <button type="button" className="ghost-btn" onClick={() => setConfirmClose(false)}>
                  继续编辑
                </button>
              </div>
            </div>
          </div>
        )}

        {error && <p className="error-text">{error}</p>}

        <div className="modal-foot">
          {isEdit && (
            <button type="button" className="danger-btn" onClick={() => setConfirmDelete(true)} disabled={busy}>
              删除任务
            </button>
          )}
          <span className="spacer" />
          <button type="button" className="ghost-btn" onClick={onClose} disabled={busy}>
            取消
          </button>
          <button type="button" className="primary-btn" onClick={() => void handleSubmit()} disabled={busy}>
            {busy ? '处理中…' : '保存'}
          </button>
        </div>
      </div>
    </div>
  )
}
