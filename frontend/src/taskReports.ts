import { STATUS_META, SYNC_STATUS_ORDER } from './statusMeta'
import {
  BOARD_VIEW_LABEL,
  FOCUS_FILTER_LABEL,
  SCOPE_FILTERS,
  STATUS_FILTERS,
  buildFocusQueue,
  tasksForView,
  type BoardView,
  type FocusFilter,
  type ScopeFilter,
  type StatusFilter,
} from './taskViews'
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
  const focusQueue = buildFocusQueue(tasks, today, 5)
  const active = tasksForView(tasks, 'current')
  const overdue = active.filter((task) => task.due_date !== null && task.due_date < today).length
  const dueToday = active.filter((task) => task.due_date === today).length

  for (const status of SYNC_STATUS_ORDER) {
    const meta = STATUS_META[status]
    lines.push(`- ${meta.icon} ${meta.syncSummary}：${byStatus(status).length} 个`)
  }
  lines.push(`- 风险：过期 ${overdue} 个，今日截止 ${dueToday} 个`)

  lines.push('', '收口建议：')
  lines.push(...(focusQueue.length > 0
    ? focusQueue.map(({ task, reason }) => `- ${reason}：${task.title}`)
    : ['- 暂无']))

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
    `   - 创建：${task.created_date}${task.completed_date ? ` / 完成：${task.completed_date}` : ''}`,
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
  statusFilter: StatusFilter,
  focusFilter: FocusFilter,
): string {
  const scopeLabel = SCOPE_FILTERS.find((item) => item.key === scopeFilter)?.label ?? '全部'
  const statusLabel = STATUS_FILTERS.find((item) => item.key === statusFilter)?.label ?? '全部状态'
  const focusQueue = buildFocusQueue(visibleTasks, boardDate, 5)
  const lines = [
    `# 每日四象限导出 - ${boardDate}`,
    '',
    `- 日期：${boardDate} 周${weekday}`,
    `- 视图：${BOARD_VIEW_LABEL[view]}`,
    `- 范围：${scopeLabel}`,
    `- 状态：${statusLabel}`,
    `- 重点：${FOCUS_FILTER_LABEL[focusFilter]}`,
    `- 搜索：${searchText.trim() || '无'}`,
    `- 任务：${visibleTasks.length} / ${allViewCount}`,
    '',
    '## 收口建议',
  ]

  lines.push(...(focusQueue.length > 0
    ? focusQueue.map(({ task, reason }) => `- ${reason}：${task.title}`)
    : ['- 暂无']))

  lines.push(
    '',
    '## 任务列表',
  )

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

export function buildBoardJsonExport(
  visibleTasks: Task[],
  allViewCount: number,
  boardDate: string,
  weekday: string,
  view: BoardView,
  searchText: string,
  scopeFilter: ScopeFilter,
  statusFilter: StatusFilter,
  focusFilter: FocusFilter,
): string {
  const scopeLabel = SCOPE_FILTERS.find((item) => item.key === scopeFilter)?.label ?? '全部'
  const statusLabel = STATUS_FILTERS.find((item) => item.key === statusFilter)?.label ?? '全部状态'
  return JSON.stringify(
    {
      format: 'quadrant-board.tasks.v1',
      exported_at: new Date().toISOString(),
      board_date: boardDate,
      weekday,
      view,
      view_label: BOARD_VIEW_LABEL[view],
      filters: {
        search: searchText.trim(),
        scope: scopeFilter,
        scope_label: scopeLabel,
        status: statusFilter,
        status_label: statusLabel,
        focus: focusFilter,
        focus_label: FOCUS_FILTER_LABEL[focusFilter],
      },
      count: {
        exported: visibleTasks.length,
        view_total: allViewCount,
      },
      tasks: visibleTasks.map((task) => ({
        id: task.id,
        title: task.title,
        description: task.description,
        important: task.important,
        due_date: task.due_date,
        status: task.status,
        sort_order: task.sort_order,
        created_date: task.created_date,
        completed_date: task.completed_date,
        images: task.images.map((image) => ({
          id: image.id,
          filename: image.filename,
          original_name: image.original_name,
          url: `/uploads/${image.filename}`,
        })),
      })),
    },
    null,
    2,
  )
}

export function buildAiReviewPrompt(
  visibleTasks: Task[],
  boardDate: string,
  view: BoardView,
  searchText: string,
  scopeFilter: ScopeFilter,
  statusFilter: StatusFilter,
  focusFilter: FocusFilter,
): string {
  const scopeLabel = SCOPE_FILTERS.find((item) => item.key === scopeFilter)?.label ?? '全部'
  const statusLabel = STATUS_FILTERS.find((item) => item.key === statusFilter)?.label ?? '全部状态'
  const lines = [
    `请基于下面这些任务,帮我做一次 ${boardDate} 的${BOARD_VIEW_LABEL[view]}复盘。`,
    '',
    '要求:',
    '- 总结当前主要压力来源和最应该先收口的事项',
    '- 找出可以合并、延后或拆小的任务',
    '- 最后输出 3 条明天/下一步行动建议',
    '',
    `筛选条件:范围=${scopeLabel},状态=${statusLabel},重点=${FOCUS_FILTER_LABEL[focusFilter]},搜索=${searchText.trim() || '无'}`,
    '',
    '任务:',
  ]

  visibleTasks.slice(0, 20).forEach((task, index) => {
    const due = task.due_date ? `截止 ${task.due_date}` : '无期限'
    const desc = firstDescLine(task)
    lines.push(
      `${index + 1}. [${STATUS_META[task.status].label}] ${task.title}(${task.important ? '重要' : '不重要'},${due})`,
    )
    if (desc) lines.push(`   备注:${desc}`)
  })

  if (visibleTasks.length > 20) {
    lines.push(`...另有 ${visibleTasks.length - 20} 条未列出,请按已列任务先总结主要模式。`)
  }

  return lines.join('\n')
}

function downloadFile(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 0)
}

export function downloadTextFile(filename: string, content: string) {
  downloadFile(filename, content, 'text/markdown;charset=utf-8')
}

export function downloadJsonFile(filename: string, content: string) {
  downloadFile(filename, content, 'application/json;charset=utf-8')
}
