import { STATUS_META } from './statusMeta'
import type { Task, TaskStatus } from './types'

export type BoardView = 'current' | 'review' | 'archive'
export type ScopeFilter = 'all' | 'important' | 'normal' | 'dated' | 'undated'
export type StatusFilter = 'all' | TaskStatus

export const BOARD_VIEW_LABEL: Record<BoardView, string> = {
  current: '当前',
  review: '待 Review',
  archive: '归档',
}

export const BOARD_VIEW_ORDER: BoardView[] = ['current', 'review', 'archive']

export const SCOPE_FILTERS: { key: ScopeFilter; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'important', label: '重要' },
  { key: 'normal', label: '不重要' },
  { key: 'dated', label: '有期限' },
  { key: 'undated', label: '无期限' },
]

export const STATUS_FILTERS: { key: StatusFilter; label: string }[] = [
  { key: 'all', label: '全部状态' },
  { key: 'doing', label: STATUS_META.doing.label },
  { key: 'verify', label: STATUS_META.verify.label },
  { key: 'todo', label: STATUS_META.todo.label },
  { key: 'review', label: STATUS_META.review.label },
  { key: 'done', label: STATUS_META.done.label },
]

export function tasksForView(source: Task[], view: BoardView): Task[] {
  if (view === 'review') return source.filter((task) => task.status === 'review')
  if (view === 'archive') return source.filter((task) => task.status === 'done')
  return source.filter((task) => task.status !== 'done' && task.status !== 'review')
}

export function countByView(source: Task[]): Record<BoardView, number> {
  return {
    current: tasksForView(source, 'current').length,
    review: tasksForView(source, 'review').length,
    archive: tasksForView(source, 'archive').length,
  }
}

export function countTodaySummary(source: Task[], today: string) {
  const active = tasksForView(source, 'current')
  return {
    active: active.length,
    overdue: active.filter((task) => task.due_date !== null && task.due_date < today).length,
    dueToday: active.filter((task) => task.due_date === today).length,
    verify: active.filter((task) => task.status === 'verify').length,
    review: tasksForView(source, 'review').length,
    doneToday: source.filter((task) => task.completed_date === today).length,
  }
}

export function matchScope(task: Task, scope: ScopeFilter): boolean {
  if (scope === 'important') return task.important
  if (scope === 'normal') return !task.important
  if (scope === 'dated') return task.due_date !== null
  if (scope === 'undated') return task.due_date === null
  return true
}

export function matchStatus(task: Task, status: StatusFilter): boolean {
  return status === 'all' || task.status === status
}

export function matchSearch(task: Task, keyword: string): boolean {
  if (!keyword) return true
  const text = [
    task.title,
    task.description,
    STATUS_META[task.status].label,
    task.due_date ?? '',
    task.created_date,
    task.completed_date ?? '',
  ].join('\n').toLowerCase()
  return text.includes(keyword)
}
