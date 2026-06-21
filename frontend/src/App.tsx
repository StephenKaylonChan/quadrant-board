import { useCallback, useEffect, useMemo, useState } from 'react'
import { aiStatus, deleteTask, fetchTasks, updateTask } from './api'
import type { TaskDraft } from './api'
import AiQuickAdd from './components/AiQuickAdd'
import QuadrantBoard, { type BoardView, type MovePatch } from './components/QuadrantBoard'
import TaskEditor from './components/TaskEditor'
import { addDays, todayStr } from './dates'
import { useDocumentEvent } from './hooks/useDocumentEvent'
import { STATUS_META, SYNC_STATUS_ORDER } from './statusMeta'
import type { Task, TaskStatus } from './types'

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六']

type ThemeMode = 'light' | 'dark' | 'system'
const THEME_LABEL: Record<ThemeMode, string> = { light: '浅色', dark: '深色', system: '系统' }
const THEME_KEY = 'qb-theme'
const BOARD_VIEW_LABEL: Record<BoardView, string> = {
  current: '当前',
  review: '待 Review',
  archive: '归档',
}
type ScopeFilter = 'all' | 'important' | 'normal' | 'dated' | 'undated'
const SCOPE_FILTERS: { key: ScopeFilter; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'important', label: '重要' },
  { key: 'normal', label: '不重要' },
  { key: 'dated', label: '有期限' },
  { key: 'undated', label: '无期限' },
]

function loadTheme(): ThemeMode {
  const saved = localStorage.getItem(THEME_KEY)
  return saved === 'light' || saved === 'dark' || saved === 'system' ? saved : 'system'
}

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

function buildDailySync(tasks: Task[], today: string, weekday: string): string {
  const byStatus = (status: TaskStatus) => tasks.filter((t) => t.status === status)
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

function countByView(source: Task[]): Record<BoardView, number> {
  return {
    current: tasksForView(source, 'current').length,
    review: tasksForView(source, 'review').length,
    archive: tasksForView(source, 'archive').length,
  }
}

function tasksForView(source: Task[], view: BoardView): Task[] {
  if (view === 'review') return source.filter((t) => t.status === 'review')
  if (view === 'archive') return source.filter((t) => t.status === 'done')
  return source.filter((t) => t.status !== 'done' && t.status !== 'review')
}

function matchScope(task: Task, scope: ScopeFilter): boolean {
  if (scope === 'important') return task.important
  if (scope === 'normal') return !task.important
  if (scope === 'dated') return task.due_date !== null
  if (scope === 'undated') return task.due_date === null
  return true
}

function matchSearch(task: Task, keyword: string): boolean {
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

function buildBoardExport(
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

function downloadTextFile(filename: string, content: string) {
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

export default function App() {
  const today = todayStr()
  const [boardDate, setBoardDate] = useState(today)
  const [tasks, setTasks] = useState<Task[]>([])
  const [error, setError] = useState('')
  // editor 三种状态:null = 关闭,'create' = 新建,Task 对象 = 编辑该任务
  const [editor, setEditor] = useState<Task | 'create' | null>(null)
  const [theme, setTheme] = useState<ThemeMode>(loadTheme)
  const [aiEnabled, setAiEnabled] = useState(false)
  // AI 拆出来的草稿队列:逐条弹预填编辑窗,保存或放弃一条就轮到下一条
  const [draftQueue, setDraftQueue] = useState<TaskDraft[]>([])
  const [draftTotal, setDraftTotal] = useState(0)
  // 待删除的任务(点了卡片上的 ×,等用户二次确认)
  const [deleting, setDeleting] = useState<Task | null>(null)
  const [syncDraft, setSyncDraft] = useState('')
  const [syncCopied, setSyncCopied] = useState(false)
  const [boardView, setBoardView] = useState<BoardView>('current')
  const [searchText, setSearchText] = useState('')
  const [scopeFilter, setScopeFilter] = useState<ScopeFilter>('all')
  const [exported, setExported] = useState(false)

  // 后端配了大模型密钥才显示 AI 输入框
  useEffect(() => {
    aiStatus()
      .then((s) => setAiEnabled(s.enabled))
      .catch(() => setAiEnabled(false))
  }, [])

  // 主题:'system' 跟随系统设置,并监听系统切换实时跟着变
  useEffect(() => {
    localStorage.setItem(THEME_KEY, theme)
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = () => {
      const dark = theme === 'dark' || (theme === 'system' && media.matches)
      document.documentElement.dataset.theme = dark ? 'dark' : 'light'
    }
    apply()
    media.addEventListener('change', apply)
    return () => media.removeEventListener('change', apply)
  }, [theme])

  const load = useCallback(async () => {
    try {
      setError('')
      setTasks(await fetchTasks(boardDate))
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载失败')
    }
  }, [boardDate])

  // boardDate 一变就重新拉当天的任务
  useEffect(() => {
    void load()
  }, [load])

  // 拖拽落点:先在本地把任务挪过去(避免松手后闪回原位),再请求后端、最后以后端为准
  const moveTask = useCallback(
    async (task: Task, patch: MovePatch) => {
      setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, ...patch } : t)))
      try {
        await updateTask(task.id, patch)
      } catch (e) {
        setError(e instanceof Error ? e.message : '移动失败')
      } finally {
        void load()
      }
    },
    [load],
  )

  async function confirmDelete() {
    if (!deleting) return
    try {
      await deleteTask(deleting.id)
    } catch (e) {
      setError(e instanceof Error ? e.message : '删除失败')
    } finally {
      setDeleting(null)
      void load()
    }
  }

  async function copySyncDraft() {
    try {
      await navigator.clipboard.writeText(syncDraft)
      setSyncCopied(true)
      window.setTimeout(() => setSyncCopied(false), 1200)
    } catch (e) {
      setError(e instanceof Error ? e.message : '复制失败')
    }
  }

  function downloadBoardExport() {
    try {
      const content = buildBoardExport(
        visibleViewTasks,
        boardViewCounts[boardView],
        boardDate,
        weekday,
        boardView,
        searchText,
        scopeFilter,
      )
      downloadTextFile(`quadrant-board-${boardDate}-${boardView}.md`, content)
      setExported(true)
      window.setTimeout(() => setExported(false), 1200)
    } catch (e) {
      setError(e instanceof Error ? e.message : '导出失败')
    }
  }

  useDocumentEvent('keydown', (e) => {
    if (deleting) {
      if (e.key === 'Escape') {
        e.preventDefault()
        setDeleting(null)
      }
      if (e.key === 'Enter') {
        e.preventDefault()
        void confirmDelete()
      }
      return
    }
    if (syncDraft) {
      if (e.key === 'Escape') {
        e.preventDefault()
        setSyncDraft('')
      }
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        void copySyncDraft()
      }
    }
  }, deleting !== null || syncDraft !== '')

  const isToday = boardDate === today
  const weekday = WEEKDAYS[new Date(`${boardDate}T00:00:00`).getDay()]
  const normalizedSearch = searchText.trim().toLowerCase()
  const filterActive = normalizedSearch !== '' || scopeFilter !== 'all'
  const filteredTasks = useMemo(
    () => tasks.filter((task) => matchScope(task, scopeFilter) && matchSearch(task, normalizedSearch)),
    [normalizedSearch, scopeFilter, tasks],
  )
  const boardViewCounts = useMemo(() => countByView(tasks), [tasks])
  const filteredBoardViewCounts = useMemo(() => countByView(filteredTasks), [filteredTasks])
  const tabCounts = filterActive ? filteredBoardViewCounts : boardViewCounts
  const visibleViewTasks = useMemo(() => tasksForView(filteredTasks, boardView), [boardView, filteredTasks])

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <h1>每日四象限</h1>
          <span className="brand-sub">先分清轻重缓急,再开始干活</span>
        </div>

        <div className="date-nav">
          <button className="icon-btn" onClick={() => setBoardDate(addDays(boardDate, -1))} aria-label="前一天">
            ‹
          </button>
          <div className="date-label">
            <span className="date-main">{boardDate}</span>
            <span className="date-week">周{weekday}{isToday ? ' · 今天' : ''}</span>
          </div>
          <button className="icon-btn" onClick={() => setBoardDate(addDays(boardDate, 1))} aria-label="后一天">
            ›
          </button>
          {!isToday && (
            <button className="ghost-btn" onClick={() => setBoardDate(today)}>
              回到今天
            </button>
          )}
        </div>

        <div className="seg seg-sm" role="group" aria-label="主题切换">
          {(['light', 'dark', 'system'] as const).map((m) => (
            <button key={m} type="button" className={theme === m ? 'on' : ''} onClick={() => setTheme(m)}>
              {THEME_LABEL[m]}
            </button>
          ))}
        </div>

        <div className="seg seg-sm board-view-switch" role="group" aria-label="任务视图切换">
          {(['current', 'review', 'archive'] as const).map((view) => (
            <button
              key={view}
              type="button"
              className={boardView === view ? 'on' : ''}
              onClick={() => setBoardView(view)}
            >
              {BOARD_VIEW_LABEL[view]} {tabCounts[view]}
            </button>
          ))}
        </div>

        <button
          className="primary-btn"
          onClick={() => setEditor('create')}
          disabled={!isToday}
          title={isToday ? '' : '历史面板只能查看,回到今天再新建'}
        >
          <span className="btn-icon" aria-hidden="true">＋</span>
          新任务
        </button>
        <button
          className="ghost-btn"
          onClick={() => setSyncDraft(buildDailySync(tasks, today, weekday))}
          disabled={!isToday}
          title={isToday ? '' : '历史面板不生成今日同步'}
        >
          <span className="btn-icon" aria-hidden="true">↗</span>
          今日同步
        </button>
        <button
          className="ghost-btn"
          onClick={downloadBoardExport}
          title="导出当前视图和筛选结果为 Markdown"
        >
          <span className="btn-icon" aria-hidden="true">↓</span>
          {exported ? '已导出' : '导出'}
        </button>
      </header>

      {!isToday && <div className="hint-bar">正在回顾 {boardDate} 的面板(新任务只能建在今天)</div>}
      {error && (
        <div className="error-bar">
          {error}
          <button className="ghost-btn" onClick={() => void load()}>
            重试
          </button>
        </div>
      )}

      {aiEnabled && isToday && (
        <AiQuickAdd
          onDrafts={(drafts) => {
            setDraftQueue(drafts)
            setDraftTotal(drafts.length)
          }}
        />
      )}

      <section className="filter-bar" aria-label="任务筛选">
        <div className="filter-search">
          <span className="filter-icon" aria-hidden="true">⌕</span>
          <input
            type="text"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            placeholder="搜索标题、备注、状态或日期"
            aria-label="搜索任务"
          />
        </div>
        <div className="seg seg-sm filter-scope" role="group" aria-label="范围筛选">
          {SCOPE_FILTERS.map((filter) => (
            <button
              key={filter.key}
              type="button"
              className={scopeFilter === filter.key ? 'on' : ''}
              onClick={() => setScopeFilter(filter.key)}
            >
              {filter.label}
            </button>
          ))}
        </div>
        <span className="filter-count">
          显示 {filteredBoardViewCounts[boardView]} / {boardViewCounts[boardView]}
        </span>
        {filterActive && (
          <button
            type="button"
            className="ghost-btn filter-clear"
            onClick={() => {
              setSearchText('')
              setScopeFilter('all')
            }}
          >
            清空筛选
          </button>
        )}
      </section>
      {filterActive && boardView === 'current' && (
        <div className="hint-bar">筛选中暂不支持拖拽排序,清空筛选后再调整顺序</div>
      )}

      <QuadrantBoard
        tasks={filteredTasks}
        viewMode={boardView}
        isFiltered={filterActive}
        onSelect={(t) => setEditor(t)}
        onDelete={(t) => setDeleting(t)}
        onMove={moveTask}
      />

      {deleting && (
        <div className="confirm-layer" onClick={() => setDeleting(null)}>
          <div className="confirm-box" onClick={(e) => e.stopPropagation()}>
            <p>确定删除「{deleting.title}」?附带的图片也会一起删除。</p>
            <div className="confirm-actions">
              <button type="button" className="danger-btn" onClick={() => void confirmDelete()}>
                删除
              </button>
              <button type="button" className="ghost-btn" onClick={() => setDeleting(null)}>
                取消
              </button>
            </div>
          </div>
        </div>
      )}

      {syncDraft && (
        <div className="overlay" onClick={() => setSyncDraft('')}>
          <div
            className="modal sync-modal"
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            <h2>今日同步</h2>
            <textarea
              className="sync-textarea"
              value={syncDraft}
              onChange={(e) => setSyncDraft(e.target.value)}
              aria-label="今日同步内容"
            />
            <div className="modal-foot">
              <button
                type="button"
                className="primary-btn"
                onClick={() => void copySyncDraft()}
                title="Ctrl / Cmd + Enter"
              >
                {syncCopied ? '已复制' : '复制'}
              </button>
              <button type="button" className="ghost-btn" onClick={() => setSyncDraft('')}>
                关闭
              </button>
            </div>
          </div>
        </div>
      )}

      {/* AI 草稿优先弹;key 用序号,保证每条草稿都是一个全新的弹窗(状态不残留) */}
      {draftQueue.length > 0 ? (
        <TaskEditor
          key={`ai-draft-${draftTotal - draftQueue.length}`}
          task={null}
          draft={draftQueue[0]}
          heading={
            draftTotal > 1
              ? `AI 草稿 ${draftTotal - draftQueue.length + 1} / ${draftTotal}`
              : 'AI 草稿'
          }
          onClose={() => setDraftQueue((prev) => prev.slice(1))}
          onChanged={load}
        />
      ) : (
        editor !== null && (
          <TaskEditor
            task={editor === 'create' ? null : editor}
            onClose={() => setEditor(null)}
            onChanged={load}
          />
        )
      )}
    </div>
  )
}
