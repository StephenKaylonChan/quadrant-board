import type { CSSProperties } from 'react'
import { STATUS_META } from '../statusMeta'
import type { Task } from '../types'

interface Props {
  tasks: Task[]
  boardDate: string
  onSelect: (task: Task) => void
}

interface ScatterPoint {
  task: Task
  x: number
  y: number
  reason: string
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function daysUntil(dueDate: string, boardDate: string): number {
  const due = new Date(`${dueDate}T00:00:00`).getTime()
  const base = new Date(`${boardDate}T00:00:00`).getTime()
  return Math.round((due - base) / 86_400_000)
}

function timePressure(task: Task, boardDate: string): { x: number; reason: string } {
  if (task.due_date === null) return { x: 14, reason: '无期限' }
  const days = daysUntil(task.due_date, boardDate)
  if (days < 0) return { x: 86, reason: `已过期 ${task.due_date.slice(5)}` }
  if (days === 0) return { x: 80, reason: '今日截止' }
  if (days === 1) return { x: 70, reason: '明日截止' }
  if (days <= 3) return { x: 62, reason: `${days} 天后截止` }
  if (days <= 7) return { x: 48, reason: '一周内截止' }
  return { x: 34, reason: '长期期限' }
}

function importancePosition(task: Task): number {
  const base = task.important ? 72 : 30
  const statusOffset = task.status === 'doing' ? 8 : task.status === 'verify' ? 5 : task.status === 'done' ? -6 : 0
  const spread = ((task.id % 5) - 2) * 2.6
  return clamp(base + statusOffset + spread, 12, 88)
}

function scatterPoint(task: Task, boardDate: string): ScatterPoint {
  const pressure = timePressure(task, boardDate)
  const xSpread = ((task.id % 11) - 5) * 2.2
  return {
    task,
    x: clamp(pressure.x + xSpread, 8, 94),
    y: importancePosition(task),
    reason: pressure.reason,
  }
}

function hasCollision(point: ScatterPoint, placed: ScatterPoint[]): boolean {
  return placed.some((other) => Math.abs(other.x - point.x) < 12 && Math.abs(other.y - point.y) < 8)
}

function spreadCollisions(points: ScatterPoint[]): ScatterPoint[] {
  const placed: ScatterPoint[] = []
  const yOffsets = [0, 8, -8, 16, -16, 24, -24, 32, -32]
  const xOffsets = [0, -6, 6, -12, 12]

  for (const point of [...points].sort((a, b) => b.x - a.x || b.y - a.y)) {
    const candidates = yOffsets.flatMap((yOffset) => (
      xOffsets.map((xOffset) => ({
        ...point,
        x: clamp(point.x + xOffset, 8, 94),
        y: clamp(point.y + yOffset, 12, 88),
      }))
    ))
    const candidate = candidates
      .sort((a, b) => (
        Math.abs(a.x - point.x) + Math.abs(a.y - point.y)
        - Math.abs(b.x - point.x) - Math.abs(b.y - point.y)
      ))
      .find((item) => !hasCollision(item, placed))
    placed.push(candidate ?? point)
  }

  return placed.sort((a, b) => a.task.id - b.task.id)
}

function pointStyle(point: ScatterPoint): CSSProperties & Record<'--x' | '--y', string> {
  return {
    '--x': `${point.x}%`,
    '--y': `${100 - point.y}%`,
  }
}

export default function TaskScatter({ tasks, boardDate, onSelect }: Props) {
  const points = spreadCollisions(tasks.map((task) => scatterPoint(task, boardDate)))
  const importantCount = tasks.filter((task) => task.important).length
  const datedCount = tasks.filter((task) => task.due_date !== null).length
  const overdueCount = tasks.filter((task) => task.due_date !== null && task.due_date < boardDate).length

  return (
    <main className="scatter-board">
      <header className="scatter-head">
        <div>
          <h2>压力坐标</h2>
          <p>优先收口、低压储备和长期事项一屏对照。</p>
        </div>
        <div className="scatter-stats" aria-label="坐标统计">
          <span><b>{tasks.length}</b>任务</span>
          <span><b>{importantCount}</b>重要</span>
          <span><b>{datedCount}</b>有期限</span>
          <span><b>{overdueCount}</b>过期</span>
        </div>
      </header>

      <section className="scatter-stage" aria-label="任务压力坐标图">
        <span className="scatter-axis scatter-axis-y">重要性 ↑</span>
        <span className="scatter-axis scatter-axis-x">时限压力 →</span>
        <span className="scatter-guide scatter-guide-v" />
        <span className="scatter-guide scatter-guide-h" />
        <span className="scatter-corner scatter-corner-hot">优先收口</span>
        <span className="scatter-corner scatter-corner-low">低压储备</span>

        {points.length === 0 ? (
          <p className="scatter-empty">暂无可展示任务</p>
        ) : (
          points.map((point) => (
            <button
              key={point.task.id}
              type="button"
              className={`scatter-point scatter-${point.task.status}${point.task.due_date !== null && point.task.due_date < boardDate ? ' scatter-overdue' : ''}`}
              style={pointStyle(point)}
              onClick={() => onSelect(point.task)}
              title={`${point.reason} / ${STATUS_META[point.task.status].label}`}
            >
              <span className="scatter-dot" aria-hidden="true" />
              <span className="scatter-title">{point.task.title}</span>
              <span className="scatter-reason">{point.reason}</span>
            </button>
          ))
        )}
      </section>
    </main>
  )
}
