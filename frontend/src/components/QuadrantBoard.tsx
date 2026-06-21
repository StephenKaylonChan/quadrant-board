import { useMemo, useState } from 'react'
import { todayStr } from '../dates'
import { STATUS_META } from '../statusMeta'
import { BOARD_VIEW_LABEL, type BoardView } from '../taskViews'
import type { Task, TaskStatus } from '../types'
import TaskCard from './TaskCard'

// 拖拽落点要改的字段:新顺序 + 目标象限对应的重要性/截止日期
export interface MovePatch {
  sort_order: number
  important: boolean
  due_date: string | null
}

interface Props {
  tasks: Task[]
  viewMode: BoardView
  isFiltered: boolean
  onSelect: (task: Task) => void
  onDelete: (task: Task) => void
  onMove: (task: Task, patch: MovePatch) => void
  onStatusChange: (task: Task, status: TaskStatus) => void
  onDueChange: (task: Task, dueDate: string | null) => void
}

interface QuadrantDef {
  key: string
  title: string
  hint: string
  important: boolean
  hasDue: boolean
}

interface QuadrantTasks {
  current: Task[]
  review: Task[]
  archive: Task[]
}

// 两个维度:重要吗(上下)× 有没有截止日期(左右)
const QUADRANTS: QuadrantDef[] = [
  { key: 'plan', title: '重要 · 无期限', hint: '每天上午固定时间做', important: true, hasDue: false },
  { key: 'now', title: '重要 · 有期限', hint: '截止越近排越前,先做 1 号', important: true, hasDue: true },
  { key: 'skip', title: '不重要 · 无期限', hint: '少做或不做', important: false, hasDue: false },
  { key: 'squeeze', title: '不重要 · 有期限', hint: '穿插快速处理', important: false, hasDue: true },
]

function inQuadrant(t: Task, q: QuadrantDef): boolean {
  return t.important === q.important && (t.due_date !== null) === q.hasDue
}

// 有期限象限:截止日期越近越靠前,同一天再按状态和拖拽顺序。
// 无期限象限:没有日期压力,所以先按状态,再按拖拽顺序。
function sortActive(list: Task[], q: QuadrantDef): Task[] {
  return [...list].sort((a, b) => {
    if (q.hasDue && a.due_date !== b.due_date) {
      return a.due_date! < b.due_date! ? -1 : 1
    }
    const byStatus = STATUS_META[a.status].activeRank - STATUS_META[b.status].activeRank
    if (byStatus !== 0) return byStatus
    return a.sort_order - b.sort_order
  })
}

export default function QuadrantBoard({
  tasks,
  viewMode,
  isFiltered,
  onSelect,
  onDelete,
  onMove,
  onStatusChange,
  onDueChange,
}: Props) {
  const [draggingId, setDraggingId] = useState<number | null>(null)
  const [overQuad, setOverQuad] = useState<string | null>(null)
  const canEditCurrent = viewMode === 'current'
  const canDrag = canEditCurrent && !isFiltered

  const groupedTasks = useMemo(() => {
    const result: Record<string, QuadrantTasks> = {}
    for (const q of QUADRANTS) {
      const all = tasks.filter((t) => inQuadrant(t, q))
      result[q.key] = {
        current: sortActive(all.filter((t) => t.status !== 'done' && t.status !== 'review'), q),
        review: sortActive(all.filter((t) => t.status === 'review'), q),
        archive: sortActive(all.filter((t) => t.status === 'done'), q),
      }
    }
    return result
  }, [tasks])

  /**
   * 把拖着的任务插到 active 列表的 index 位置。
   * anchorDue:落在某张卡上时,采用那张卡的截止日期(拖进"今天"那一段 = 提前到今天);
   * 落在空白处则保留自己的日期(没有就给今天)。
   */
  function dropAt(q: QuadrantDef, active: Task[], index: number, anchorDue?: string | null) {
    const dragged = tasks.find((t) => t.id === draggingId)
    if (!dragged) return

    const rest = active.filter((t) => t.id !== dragged.id)
    const idx = Math.max(0, Math.min(index, rest.length))
    const before = rest[idx - 1]
    const after = rest[idx]

    let order: number
    if (!before && !after) order = dragged.sort_order
    else if (!before) order = after.sort_order - 1
    else if (!after) order = before.sort_order + 1
    else order = (before.sort_order + after.sort_order) / 2

    let due: string | null
    if (!q.hasDue) due = null
    else if (anchorDue !== undefined) due = anchorDue
    else due = dragged.due_date ?? todayStr()

    onMove(dragged, { sort_order: order, important: q.important, due_date: due })
  }

  function dropOnCard(q: QuadrantDef, active: Task[], card: Task, after: boolean) {
    if (card.id === draggingId) return
    const rest = active.filter((t) => t.id !== draggingId)
    const pos = rest.findIndex((t) => t.id === card.id)
    const idx = pos === -1 ? rest.length : pos + (after ? 1 : 0)
    dropAt(q, active, idx, q.hasDue ? card.due_date : undefined)
  }

  return (
    <main className={`board${draggingId !== null ? ' board-dragging' : ''}`}>
      <span className="axis axis-y">重要性</span>
      <span className="axis axis-x">时限压力 →</span>

      {QUADRANTS.map((q) => {
        const visible = groupedTasks[q.key][viewMode]

        return (
          <section
            key={q.key}
            className={`quadrant q-${q.key}${overQuad === q.key ? ' drag-over' : ''}`}
            onDragOver={(e) => {
              if (canDrag && draggingId !== null) {
                e.preventDefault() // 默认是"禁止放下",阻止掉才能触发 onDrop
                setOverQuad(q.key)
              }
            }}
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
                setOverQuad(null)
              }
            }}
            onDrop={(e) => {
              if (!canDrag) return
              e.preventDefault()
              setOverQuad(null)
              dropAt(q, visible, visible.length) // 落在象限空白处 = 排到末尾
            }}
          >
            <header className="q-head">
              <h2>{q.title}</h2>
              <span className="q-hint">{q.hint}</span>
              <span className="q-tools">
                <span className="q-count">{BOARD_VIEW_LABEL[viewMode]} {visible.length}</span>
              </span>
            </header>

            <div className="q-list">
              {visible.length === 0 ? (
                <p className="q-empty">{isFiltered ? '没有匹配任务' : '空着挺好'}</p>
              ) : (
                visible.map((t, i) => (
                  <TaskCard
                    key={t.id}
                    task={t}
                    index={i + 1}
                    dragging={t.id === draggingId}
                    draggable={canDrag}
                    allowDelete={canEditCurrent}
                    onClick={() => onSelect(t)}
                    onDelete={() => onDelete(t)}
                    onStatusChange={canEditCurrent ? (status) => onStatusChange(t, status) : undefined}
                    onDueChange={canEditCurrent ? (dueDate) => onDueChange(t, dueDate) : undefined}
                    onDragStart={() => setDraggingId(t.id)}
                    onDragEnd={() => {
                      setDraggingId(null)
                      setOverQuad(null)
                    }}
                    onDropOnCard={(after) => {
                      if (!canDrag) return
                      setOverQuad(null)
                      dropOnCard(q, visible, t, after)
                    }}
                  />
                ))
              )}
              {canDrag && draggingId !== null && <div className="drop-tail" aria-hidden="true">放到末尾</div>}
            </div>
          </section>
        )
      })}
    </main>
  )
}
