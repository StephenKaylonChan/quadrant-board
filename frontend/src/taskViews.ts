import { STATUS_META } from './statusMeta'
import type { Task } from './types'

export type BoardView = 'current' | 'review' | 'archive'
export type ScopeFilter = 'all' | 'important' | 'normal' | 'dated' | 'undated'

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

export function matchScope(task: Task, scope: ScopeFilter): boolean {
  if (scope === 'important') return task.important
  if (scope === 'normal') return !task.important
  if (scope === 'dated') return task.due_date !== null
  if (scope === 'undated') return task.due_date === null
  return true
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
