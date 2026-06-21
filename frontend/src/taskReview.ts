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
  netChange: number
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
  const created = allTasks.filter((task) => inRange(task.created_date, startDate, endDate))
  const completed = allTasks.filter((task) => inRange(task.completed_date, startDate, endDate))

  return {
    startDate,
    endDate,
    total: allTasks.length,
    created,
    completed,
    active,
    review,
    verify,
    overdue,
    importantActive,
    netChange: created.length - completed.length,
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
    `- 本周净变化：${review.netChange >= 0 ? '+' : ''}${review.netChange}`,
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

export function buildWeekAiSummaryPrompt(review: WeekReview): string {
  const lines = [
    `请基于下面的周回顾数据,帮我总结 ${review.startDate} ~ ${review.endDate} 的工作状态。`,
    '',
    '要求:',
    '- 用 3 点概括本周完成、积压和风险',
    '- 找出下周最应该先收口的任务',
    '- 给出 3 条可执行的下周安排建议',
    '',
    buildWeekReviewText(review),
  ]
  return lines.join('\n')
}
