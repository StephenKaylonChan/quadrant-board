import { useMemo, useState } from 'react'
import { todayStr } from '../dates'
import { STATUS_META } from '../statusMeta'
import type { Task } from '../types'
import TaskCard from './TaskCard'

// 拖拽落点要改的字段:新顺序 + 目标象限对应的重要性/截止日期
export interface MovePatch {
  sort_order: number
  important: boolean
  due_date: string | null
}

interface Props {
  tasks: Task[]
  onSelect: (task: Task) => void
  onDelete: (task: Task) => void
  onMove: (task: Task, patch: MovePatch) => void
}

interface QuadrantDef {
  key: string
  title: string
  hint: string
  important: boolean
  hasDue: boolean
}

interface QuadrantTasks {
  active: Task[]
  done: Task[]
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

// 优先级分层:已过期 > 进行中 > 待验证 > 待办 > 待 Review;
// 同一层内截止越近越靠前,再相同才看手动拖拽顺序
function sortActive(list: Task[], q: QuadrantDef, today: string): Task[] {
  // 已过期单独算第 0 层,压过所有状态
  const tier = (t: Task) =>
    q.hasDue && t.due_date !== null && t.due_date < today ? 0 : STATUS_META[t.status].activeRank

  return [...list].sort((a, b) => {
    const byTier = tier(a) - tier(b)
    if (byTier !== 0) return byTier
    if (q.hasDue && a.due_date !== b.due_date) {
      return a.due_date! < b.due_date! ? -1 : 1
    }
    return a.sort_order - b.sort_order
  })
}

export default function QuadrantBoard({ tasks, onSelect, onDelete, onMove }: Props) {
  const [draggingId, setDraggingId] = useState<number | null>(null)
  const [overQuad, setOverQuad] = useState<string | null>(null)
  // 各象限"已完成"折叠区的开合状态
  const [openArchive, setOpenArchive] = useState<Record<string, boolean>>({})
  const today = todayStr()

  const groupedTasks = useMemo(() => {
    const result: Record<string, QuadrantTasks> = {}
    for (const q of QUADRANTS) {
      const all = tasks.filter((t) => inQuadrant(t, q))
      result[q.key] = {
        active: sortActive(all.filter((t) => t.status !== 'done'), q, today),
        done: all.filter((t) => t.status === 'done'),
      }
    }
    return result
  }, [tasks, today])

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
        const { active, done } = groupedTasks[q.key]
        const archiveOpen = openArchive[q.key] ?? false

        return (
          <section
            key={q.key}
            className={`quadrant q-${q.key}${overQuad === q.key ? ' drag-over' : ''}`}
            onDragOver={(e) => {
              if (draggingId !== null) {
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
              e.preventDefault()
              setOverQuad(null)
              dropAt(q, active, active.length) // 落在象限空白处 = 排到末尾
            }}
          >
            <header className="q-head">
              <h2>{q.title}</h2>
              <span className="q-hint">{q.hint}</span>
              <span className="q-tools">
                <span className="q-count">当前 {active.length}</span>
                {done.length > 0 && (
                  <button
                    type="button"
                    className="q-archive-toggle"
                    onClick={() => setOpenArchive((p) => ({ ...p, [q.key]: !archiveOpen }))}
                  >
                    <span>归档 {done.length}</span>
                    <span className="archive-chevron">{archiveOpen ? '▾' : '▸'}</span>
                  </button>
                )}
              </span>
            </header>

            <div className="q-list">
              {active.length === 0 && done.length === 0 ? (
                <p className="q-empty">空着挺好</p>
              ) : (
                active.map((t, i) => (
                  <TaskCard
                    key={t.id}
                    task={t}
                    index={i + 1}
                    dragging={t.id === draggingId}
                    onClick={() => onSelect(t)}
                    onDelete={() => onDelete(t)}
                    onDragStart={() => setDraggingId(t.id)}
                    onDragEnd={() => {
                      setDraggingId(null)
                      setOverQuad(null)
                    }}
                    onDropOnCard={(after) => {
                      setOverQuad(null)
                      dropOnCard(q, active, t, after)
                    }}
                  />
                ))
              )}
              {draggingId !== null && <div className="drop-tail" aria-hidden="true">放到末尾</div>}
            </div>

            {done.length > 0 && archiveOpen && (
              <div className="archive archive-open">
                <ul className="archive-list">
                  {done.map((t) => (
                    <li key={t.id}>
                      <button type="button" onClick={() => onSelect(t)}>
                        {t.title}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        )
      })}
    </main>
  )
}
