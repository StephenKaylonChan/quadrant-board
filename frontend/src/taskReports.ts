import { STATUS_META, SYNC_STATUS_ORDER } from './statusMeta'
import { BOARD_VIEW_LABEL, SCOPE_FILTERS, type BoardView, type ScopeFilter } from './taskViews'
import type { Task, TaskStatus } from './types'

function firstDescLine(task: Task): string {
  return task.description
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean) ?? ''
}

function formatSyncTask(task: Task, today: string): string[] {
  const due = task.due_date
    ? task.due_date < today
      ? `（已过期 ${task.due_date.slice(5)}）`
      : `（截止 ${task.due_date.slice(5)}）`
    : ''
  const desc = firstDescLine(task)
  return desc ? [`- ${task.title}${due}`, `  备注：${desc}`] : [`- ${task.title}${due}`]
}

export function buildDailySync(tasks: Task[], today: string, weekday: string): string {
  const byStatus = (status: TaskStatus) => tasks.filter((task) => task.status === status)
  const lines: string[] = [`今日待办同步（${today} 周${weekday}）：`, '', '总体：']

  for (const status of SYNC_STATUS_ORDER) {
    const meta = STATUS_META[status]
    lines.push(`- ${meta.icon} ${meta.syncSummary}：${byStatus(status).length} 个`)
  }

  SYNC_STATUS_ORDER.forEach((status, index) => {
    const meta = STATUS_META[status]
    const list = byStatus(status)
    lines.push('', `${index + 1}. ${meta.icon} ${meta.syncTitle}`)
    lines.push(...(list.length > 0 ? list.flatMap((task) => formatSyncTask(task, today)) : ['- 暂无']))
  })

  return lines.join('\n')
}

function formatExportTask(task: Task, index: number, boardDate: string): string[] {
  const checkbox = task.status === 'done' ? 'x' : ' '
  const due = task.due_date
    ? task.due_date < boardDate
      ? `已过期 ${task.due_date}`
      : `截止 ${task.due_date}`
    : '无期限'
  const lines = [
    `${index}. [${checkbox}] ${task.title}`,
    `   - 状态：${STATUS_META[task.status].label}`,
    `   - 范围：${task.important ? '重要' : '不重要'} / ${due}`,
  ]
  if (task.description.trim()) {
    lines.push(`   - 备注：${task.description.trim().replace(/\r?\n/g, '\n     ')}`)
  }
  if (task.images.length > 0) {
    lines.push(`   - 图片：${task.images.length} 张`)
  }
  return lines
}

export function buildBoardExport(
  visibleTasks: Task[],
  allViewCount: number,
  boardDate: string,
  weekday: string,
  view: BoardView,
  searchText: string,
  scopeFilter: ScopeFilter,
): string {
  const scopeLabel = SCOPE_FILTERS.find((item) => item.key === scopeFilter)?.label ?? '全部'
  const lines = [
    `# 每日四象限导出 - ${boardDate}`,
    '',
    `- 日期：${boardDate} 周${weekday}`,
    `- 视图：${BOARD_VIEW_LABEL[view]}`,
    `- 范围：${scopeLabel}`,
    `- 搜索：${searchText.trim() || '无'}`,
    `- 任务：${visibleTasks.length} / ${allViewCount}`,
    '',
    '## 任务列表',
  ]

  if (visibleTasks.length === 0) {
    lines.push('', '暂无匹配任务')
    return lines.join('\n')
  }

  for (const status of SYNC_STATUS_ORDER) {
    const list = visibleTasks.filter((task) => task.status === status)
    if (list.length === 0) continue
    lines.push('', `### ${STATUS_META[status].icon} ${STATUS_META[status].label}`)
    list.forEach((task, index) => lines.push(...formatExportTask(task, index + 1, boardDate)))
  }
  return lines.join('\n')
}

export function downloadTextFile(filename: string, content: string) {
  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 0)
}
