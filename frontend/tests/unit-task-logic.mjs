import { createServer } from 'vite'

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function makeTask(overrides) {
  return {
    id: overrides.id,
    title: overrides.title ?? `任务 ${overrides.id}`,
    description: overrides.description ?? '',
    important: overrides.important ?? true,
    due_date: overrides.due_date ?? null,
    status: overrides.status ?? 'todo',
    sort_order: overrides.sort_order ?? overrides.id,
    created_date: overrides.created_date ?? '2026-06-20',
    completed_date: overrides.completed_date ?? null,
    images: overrides.images ?? [],
  }
}

const server = await createServer({
  logLevel: 'silent',
  server: { middlewareMode: true },
  appType: 'custom',
})

try {
  const taskViews = await server.ssrLoadModule('/src/taskViews.ts')
  const taskReports = await server.ssrLoadModule('/src/taskReports.ts')
  const today = '2026-06-22'
  const tasks = [
    makeTask({ id: 1, status: 'todo', due_date: today, sort_order: 2 }),
    makeTask({ id: 2, status: 'review', sort_order: 1 }),
    makeTask({ id: 3, status: 'done', completed_date: today }),
    makeTask({ id: 4, status: 'doing', created_date: '2026-06-20' }),
    makeTask({ id: 5, status: 'verify', due_date: '2026-06-21' }),
  ]

  assert(taskViews.tasksForView(tasks, 'current').map((task) => task.id).join(',') === '1,4,5', 'current 视图应排除 review / done')
  assert(taskViews.tasksForView(tasks, 'review').length === 1, 'review 视图数量错误')
  assert(taskViews.tasksForView(tasks, 'archive').length === 1, 'archive 视图数量错误')

  const summary = taskViews.countTodaySummary(tasks, today)
  assert(summary.active === 3, '待处理数量错误')
  assert(summary.overdue === 1, '过期数量错误')
  assert(summary.dueToday === 1, '今日截止数量错误')
  assert(summary.staleDoing === 1, '隔夜进行数量错误')
  assert(summary.doneToday === 1, '今日归档数量错误')

  const focus = taskViews.buildFocusQueue(tasks, today)
  assert(focus[0].task.id === 5, '收口建议应优先过期任务')
  assert(taskViews.matchSearch(tasks[0], '任务 1'), '搜索标题应命中')
  assert(taskViews.matchFocus(tasks[0], 'due-today', today), '今日截止筛选应命中')

  const json = taskReports.buildBoardJsonExport(
    taskViews.tasksForView(tasks, 'current'),
    3,
    today,
    '一',
    'current',
    '',
    'all',
    'all',
    'all',
  )
  const parsed = JSON.parse(json)
  assert(parsed.format === 'quadrant-board.tasks.v1', 'JSON 导出格式版本错误')
  assert(parsed.tasks.length === 3, 'JSON 导出任务数量错误')
  assert(parsed.count.view_total === 3, 'JSON 导出视图总数错误')

  console.log('unit task logic tests passed')
} finally {
  await server.close()
}
