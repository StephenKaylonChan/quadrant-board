import { STATUS_META } from './statusMeta'
import { tasksForView } from './taskViews'
import type { Task } from './types'

export interface WeekReviewDay {
  date: string
  tasks: Task[]
}

export interface WeekReview {
  startDate: string
  endDate: string
  total: number
  created: Task[]
  completed: Task[]
  active: Task[]
  review: Task[]
  verify: Task[]
  overdue: Task[]
  importantActive: Task[]
  focus: Task[]
  days: {
    date: string
    created: number
    completed: number
    active: number
  }[]
}

function inRange(date: string | null, start: string, end: string): boolean {
  return date !== null && date >= start && date <= end
}

function uniqueTasks(days: WeekReviewDay[]): Task[] {
  const map = new Map<number, Task>()
  for (const day of days) {
    for (const task of day.tasks) {
      map.set(task.id, task)
    }
  }
  return [...map.values()]
}

function uniqueInOrder(tasks: Task[]): Task[] {
  const seen = new Set<number>()
  return tasks.filter((task) => {
    if (seen.has(task.id)) return false
    seen.add(task.id)
    return true
  })
}

function taskLine(task: Task): string {
  const due = task.due_date ? ` / ${task.due_date}` : ''
  return `- ${STATUS_META[task.status].icon} ${task.title}（${STATUS_META[task.status].label}${due}）`
}

export function buildWeekReview(days: WeekReviewDay[]): WeekReview {
  const startDate = days[0]?.date ?? ''
  const endDate = days.at(-1)?.date ?? startDate
  const endTasks = days.at(-1)?.tasks ?? []
  const allTasks = uniqueTasks(days)
  const active = tasksForView(endTasks, 'current')
  const review = tasksForView(endTasks, 'review')
  const verify = active.filter((task) => task.status === 'verify')
  const overdue = active.filter((task) => task.due_date !== null && task.due_date < endDate)
  const importantActive = active.filter((task) => task.important)

  return {
    startDate,
    endDate,
    total: allTasks.length,
    created: allTasks.filter((task) => inRange(task.created_date, startDate, endDate)),
    completed: allTasks.filter((task) => inRange(task.completed_date, startDate, endDate)),
    active,
    review,
    verify,
    overdue,
    importantActive,
    focus: uniqueInOrder([
      ...overdue,
      ...verify,
      ...importantActive.filter((task) => task.status === 'doing'),
    ]).slice(0, 8),
    days: days.map((day) => ({
      date: day.date,
      created: day.tasks.filter((task) => task.created_date === day.date).length,
      completed: day.tasks.filter((task) => task.completed_date === day.date).length,
      active: tasksForView(day.tasks, 'current').length,
    })),
  }
}

export function buildWeekReviewText(review: WeekReview): string {
  const lines = [
    `# 周回顾 ${review.startDate} ~ ${review.endDate}`,
    '',
    `- 涉及任务：${review.total}`,
    `- 本周新增：${review.created.length}`,
    `- 本周完成：${review.completed.length}`,
    `- 当前待处理：${review.active.length}`,
    `- 待 Review：${review.review.length}`,
    `- 待验证：${review.verify.length}`,
    `- 已过期：${review.overdue.length}`,
    `- 当前重要任务：${review.importantActive.length}`,
    '',
    '## 收口重点',
  ]

  lines.push(...(review.focus.length > 0 ? review.focus.map(taskLine) : ['- 暂无']))
  lines.push('', '## 每日节奏')
  lines.push(...review.days.map((day) => `- ${day.date}:新增 ${day.created},完成 ${day.completed},待处理 ${day.active}`))
  lines.push('', '## 本周完成')
  lines.push(...(review.completed.length > 0 ? review.completed.map(taskLine) : ['- 暂无']))
  lines.push('', '## 待 Review')
  lines.push(...(review.review.length > 0 ? review.review.map(taskLine) : ['- 暂无']))
  return lines.join('\n')
}
