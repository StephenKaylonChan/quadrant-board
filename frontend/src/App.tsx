import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { aiStatus, deleteTask, fetchMaintenanceSummary, fetchTasks, updateTask } from './api'
import type { MaintenanceSummary, TaskDraft } from './api'
import AiQuickAdd from './components/AiQuickAdd'
import QuadrantBoard, { type MovePatch } from './components/QuadrantBoard'
import TaskScatter from './components/TaskScatter'
import TaskEditor from './components/TaskEditor'
import { addDays, todayStr } from './dates'
import { useDocumentEvent } from './hooks/useDocumentEvent'
import { STATUS_META } from './statusMeta'
import { buildBoardExport, buildBoardJsonExport, buildDailySync, downloadJsonFile, downloadTextFile } from './taskReports'
import { buildWeekReview, buildWeekReviewText, type WeekReview } from './taskReview'
import {
  BOARD_VIEW_LABEL,
  BOARD_VIEW_ORDER,
  FOCUS_FILTER_LABEL,
  SCOPE_FILTERS,
  STATUS_FILTERS,
  buildFocusQueue,
  countByView,
  countTodaySummary,
  matchFocus,
  matchScope,
  matchSearch,
  matchStatus,
  tasksForView,
  type BoardView,
  type FocusFilter,
  type ScopeFilter,
  type StatusFilter,
} from './taskViews'
import type { Task, TaskStatus } from './types'

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六']

type ThemeMode = 'light' | 'dark' | 'system'
type BoardLayout = 'quadrant' | 'scatter'
const THEME_LABEL: Record<ThemeMode, string> = { light: '浅色', dark: '深色', system: '系统' }
const BOARD_LAYOUT_LABEL: Record<BoardLayout, string> = { quadrant: '象限', scatter: '坐标' }
const THEME_KEY = 'qb-theme'
const BOARD_VIEW_KEY = 'qb-board-view'
const BOARD_LAYOUT_KEY = 'qb-board-layout'

function loadTheme(): ThemeMode {
  const saved = localStorage.getItem(THEME_KEY)
  return saved === 'light' || saved === 'dark' || saved === 'system' ? saved : 'system'
}

function loadBoardView(): BoardView {
  const saved = localStorage.getItem(BOARD_VIEW_KEY)
  return saved === 'current' || saved === 'review' || saved === 'archive' ? saved : 'current'
}

function loadBoardLayout(): BoardLayout {
  const requested = new URLSearchParams(window.location.search).get('layout')
  if (requested === 'scatter' || requested === 'quadrant') return requested
  const saved = localStorage.getItem(BOARD_LAYOUT_KEY)
  return saved === 'scatter' ? 'scatter' : 'quadrant'
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function uploadHealthOk(summary: MaintenanceSummary): boolean {
  return summary.orphan_upload_count === 0 && summary.missing_upload_count === 0
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
  const [aiModel, setAiModel] = useState('')
  // AI 拆出来的草稿队列:逐条弹预填编辑窗,保存或放弃一条就轮到下一条
  const [draftQueue, setDraftQueue] = useState<TaskDraft[]>([])
  const [draftHistory, setDraftHistory] = useState<TaskDraft[]>([])
  const [draftTotal, setDraftTotal] = useState(0)
  // 待删除的任务(点了卡片上的 ×,等用户二次确认)
  const [deleting, setDeleting] = useState<Task | null>(null)
  const [syncDraft, setSyncDraft] = useState('')
  const [syncCopied, setSyncCopied] = useState(false)
  const [boardView, setBoardView] = useState<BoardView>(loadBoardView)
  const [boardLayout, setBoardLayout] = useState<BoardLayout>(loadBoardLayout)
  const [searchText, setSearchText] = useState('')
  const [scopeFilter, setScopeFilter] = useState<ScopeFilter>('all')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [focusFilter, setFocusFilter] = useState<FocusFilter>('all')
  const [exported, setExported] = useState(false)
  const [jsonExported, setJsonExported] = useState(false)
  const [weekReview, setWeekReview] = useState<WeekReview | null>(null)
  const [weekBusy, setWeekBusy] = useState(false)
  const [weekCopied, setWeekCopied] = useState(false)
  const [backupOpen, setBackupOpen] = useState(false)
  const [backupSummary, setBackupSummary] = useState<MaintenanceSummary | null>(null)
  const [backupBusy, setBackupBusy] = useState(false)
  const [backupError, setBackupError] = useState('')
  const searchInputRef = useRef<HTMLInputElement>(null)
  const draftSavedRef = useRef(false)

  // 后端配了大模型密钥才显示 AI 输入框
  useEffect(() => {
    aiStatus()
      .then((s) => {
        setAiEnabled(s.enabled)
        setAiModel(s.model)
      })
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

  useEffect(() => {
    localStorage.setItem(BOARD_VIEW_KEY, boardView)
  }, [boardView])

  useEffect(() => {
    localStorage.setItem(BOARD_LAYOUT_KEY, boardLayout)
  }, [boardLayout])

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

  const changeTaskStatus = useCallback(
    async (task: Task, status: TaskStatus) => {
      setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, status } : t)))
      try {
        await updateTask(task.id, { status })
      } catch (e) {
        setError(e instanceof Error ? e.message : '状态更新失败')
      } finally {
        void load()
      }
    },
    [load],
  )

  const changeTaskDue = useCallback(
    async (task: Task, dueDate: string | null) => {
      setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, due_date: dueDate } : t)))
      try {
        await updateTask(task.id, { due_date: dueDate })
      } catch (e) {
        setError(e instanceof Error ? e.message : '截止日期更新失败')
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

  async function openWeekReview() {
    if (weekBusy) return
    const dates = Array.from({ length: 7 }, (_, index) => addDays(boardDate, index - 6))
    setWeekBusy(true)
    setError('')
    try {
      const days = await Promise.all(
        dates.map(async (date) => ({
          date,
          tasks: await fetchTasks(date),
        })),
      )
      setWeekReview(buildWeekReview(days))
    } catch (e) {
      setError(e instanceof Error ? e.message : '生成周回顾失败')
    } finally {
      setWeekBusy(false)
    }
  }

  async function copyWeekReview() {
    if (!weekReview) return
    try {
      await navigator.clipboard.writeText(buildWeekReviewText(weekReview))
      setWeekCopied(true)
      window.setTimeout(() => setWeekCopied(false), 1200)
    } catch (e) {
      setError(e instanceof Error ? e.message : '复制周回顾失败')
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
        statusFilter,
        focusFilter,
      )
      downloadTextFile(`quadrant-board-${boardDate}-${boardView}.md`, content)
      setExported(true)
      window.setTimeout(() => setExported(false), 1200)
    } catch (e) {
      setError(e instanceof Error ? e.message : '导出失败')
    }
  }

  function downloadBoardJsonExport() {
    try {
      const content = buildBoardJsonExport(
        visibleViewTasks,
        boardViewCounts[boardView],
        boardDate,
        weekday,
        boardView,
        searchText,
        scopeFilter,
        statusFilter,
        focusFilter,
      )
      downloadJsonFile(`quadrant-board-${boardDate}-${boardView}.json`, content)
      setJsonExported(true)
      window.setTimeout(() => setJsonExported(false), 1200)
    } catch (e) {
      setError(e instanceof Error ? e.message : '导出 JSON 失败')
    }
  }

  async function openBackup() {
    setBackupOpen(true)
    setBackupBusy(true)
    setBackupError('')
    setBackupSummary(null)
    try {
      setBackupSummary(await fetchMaintenanceSummary())
    } catch (e) {
      setBackupError(e instanceof Error ? e.message : '读取数据概览失败')
    } finally {
      setBackupBusy(false)
    }
  }

  function showSummarySlice(
    view: BoardView,
    nextScope: ScopeFilter,
    nextStatus: StatusFilter,
    nextFocus: FocusFilter = 'all',
  ) {
    setBoardView(view)
    setScopeFilter(nextScope)
    setStatusFilter(nextStatus)
    setFocusFilter(nextFocus)
    setSearchText('')
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
      return
    }
    if (weekReview) {
      if (e.key === 'Escape') {
        e.preventDefault()
        setWeekReview(null)
      }
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        void copyWeekReview()
      }
      return
    }
    if (backupOpen && e.key === 'Escape') {
      e.preventDefault()
      setBackupOpen(false)
    }
  }, deleting !== null || syncDraft !== '' || weekReview !== null || backupOpen)

  useDocumentEvent('keydown', (e) => {
    const target = e.target instanceof HTMLElement ? e.target : null
    const isTyping = target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA'

    if (!isTyping && !e.metaKey && !e.ctrlKey && !e.altKey) {
      if (e.key.toLowerCase() === 'n' && isToday) {
        e.preventDefault()
        setEditor('create')
        return
      }
      if (e.key === '[') {
        e.preventDefault()
        setBoardDate((date) => addDays(date, -1))
        return
      }
      if (e.key === ']') {
        e.preventDefault()
        setBoardDate((date) => addDays(date, 1))
        return
      }
      if (e.key.toLowerCase() === 't') {
        e.preventDefault()
        setBoardDate(today)
        return
      }
      if (e.key.toLowerCase() === 'f' && focusQueue.length > 0) {
        e.preventDefault()
        setEditor(focusQueue[0].task)
        return
      }
      if (e.key === '1' || e.key === '2' || e.key === '3') {
        e.preventDefault()
        setBoardView(BOARD_VIEW_ORDER[Number(e.key) - 1])
        return
      }
      if (e.key === '4') {
        e.preventDefault()
        setBoardLayout((layout) => (layout === 'quadrant' ? 'scatter' : 'quadrant'))
        return
      }
    }

    if (e.key === '/' && !isTyping) {
      e.preventDefault()
      searchInputRef.current?.focus()
      return
    }

    if (e.key === 'Escape' && document.activeElement === searchInputRef.current && filterActive) {
      e.preventDefault()
      setSearchText('')
      setScopeFilter('all')
      setStatusFilter('all')
      setFocusFilter('all')
      searchInputRef.current?.blur()
    }
  }, editor === null && draftQueue.length === 0 && deleting === null && syncDraft === '' && weekReview === null && !backupOpen)

  const isToday = boardDate === today
  const weekday = WEEKDAYS[new Date(`${boardDate}T00:00:00`).getDay()]
  const normalizedSearch = searchText.trim().toLowerCase()
  const filterActive = normalizedSearch !== '' || scopeFilter !== 'all' || statusFilter !== 'all' || focusFilter !== 'all'
  const filteredTasks = useMemo(
    () => tasks.filter(
      (task) => matchScope(task, scopeFilter)
        && matchStatus(task, statusFilter)
        && matchFocus(task, focusFilter, boardDate)
        && matchSearch(task, normalizedSearch),
    ),
    [boardDate, focusFilter, normalizedSearch, scopeFilter, statusFilter, tasks],
  )
  const boardViewCounts = useMemo(() => countByView(tasks), [tasks])
  const filteredBoardViewCounts = useMemo(() => countByView(filteredTasks), [filteredTasks])
  const tabCounts = filterActive ? filteredBoardViewCounts : boardViewCounts
  const visibleViewTasks = useMemo(() => tasksForView(filteredTasks, boardView), [boardView, filteredTasks])
  const todaySummary = useMemo(() => countTodaySummary(tasks, boardDate), [boardDate, tasks])
  const focusQueue = useMemo(() => buildFocusQueue(tasks, boardDate), [boardDate, tasks])
  const aiExistingTitles = useMemo(
    () => tasks.filter((task) => task.status !== 'done').map((task) => task.title).slice(0, 30),
    [tasks],
  )
  const scopeLabel = SCOPE_FILTERS.find((item) => item.key === scopeFilter)?.label ?? '全部'
  const statusLabel = STATUS_FILTERS.find((item) => item.key === statusFilter)?.label ?? '全部状态'
  const clearFilters = useCallback(() => {
    setSearchText('')
    setScopeFilter('all')
    setStatusFilter('all')
    setFocusFilter('all')
  }, [])
  const currentDraftNumber = draftTotal - draftQueue.length + 1
  const closeCurrentDraft = useCallback(() => {
    setDraftQueue((prev) => {
      if (prev.length === 0) return prev
      const current = prev[0]
      const rest = prev.slice(1)
      if (!draftSavedRef.current) {
        setDraftHistory((history) => [...history, current])
      }
      if (rest.length === 0) {
        setDraftHistory([])
        setDraftTotal(0)
      }
      return rest
    })
    draftSavedRef.current = false
  }, [])
  const restorePreviousDraft = useCallback(() => {
    setDraftHistory((prev) => {
      const previous = prev[prev.length - 1]
      if (!previous) return prev
      setDraftQueue((queue) => [previous, ...queue])
      return prev.slice(0, -1)
    })
  }, [])
  const loadAfterDraftSaved = useCallback(async () => {
    draftSavedRef.current = true
    await load()
  }, [load])
  const skipAllDrafts = useCallback(() => {
    setDraftQueue([])
    setDraftHistory([])
    setDraftTotal(0)
  }, [])

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <h1>每日四象限</h1>
          <span className="brand-sub">先分清轻重缓急,再开始干活</span>
        </div>

        <div className="date-nav">
          <button className="icon-btn" onClick={() => setBoardDate(addDays(boardDate, -1))} aria-label="前一天" title="[">
            ‹
          </button>
          <div className="date-label">
            <span className="date-main">{boardDate}</span>
            <span className="date-week">周{weekday}{isToday ? ' · 今天' : ''}</span>
          </div>
          <button className="icon-btn" onClick={() => setBoardDate(addDays(boardDate, 1))} aria-label="后一天" title="]">
            ›
          </button>
          {!isToday && (
            <button className="ghost-btn" onClick={() => setBoardDate(today)} title="T">
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
          {BOARD_VIEW_ORDER.map((view, index) => (
            <button
              key={view}
              type="button"
              className={boardView === view ? 'on' : ''}
              onClick={() => setBoardView(view)}
              title={String(index + 1)}
            >
              {BOARD_VIEW_LABEL[view]} {tabCounts[view]}
            </button>
          ))}
        </div>

        <div className="seg seg-sm layout-switch" role="group" aria-label="面板布局切换">
          {(['quadrant', 'scatter'] as const).map((layout) => (
            <button
              key={layout}
              type="button"
              className={boardLayout === layout ? 'on' : ''}
              onClick={() => setBoardLayout(layout)}
              title={layout === 'scatter' ? '4' : undefined}
            >
              {BOARD_LAYOUT_LABEL[layout]}
            </button>
          ))}
        </div>

        <div className="topbar-actions" aria-label="常用操作">
          <button
            className="primary-btn"
            onClick={() => setEditor('create')}
            disabled={!isToday}
            title={isToday ? 'N' : '历史面板只能查看,回到今天再新建'}
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
            onClick={() => void openWeekReview()}
            disabled={weekBusy}
            title="查看截至当前日期的最近 7 天回顾"
          >
            <span className="btn-icon" aria-hidden="true">▦</span>
            {weekBusy ? '生成中' : '周回顾'}
          </button>
          <button
            className="ghost-btn"
            onClick={downloadBoardExport}
            title="导出当前视图和筛选结果为 Markdown"
          >
            <span className="btn-icon" aria-hidden="true">↓</span>
            {exported ? '已导出' : '导出'}
          </button>
          <button
            className="ghost-btn"
            onClick={downloadBoardJsonExport}
            title="导出当前视图和筛选结果为 JSON 数据包"
          >
            <span className="btn-icon" aria-hidden="true">⇩</span>
            {jsonExported ? '已导出' : 'JSON'}
          </button>
          <button
            className="ghost-btn"
            onClick={() => void openBackup()}
            title="查看本机数据备份说明"
          >
            <span className="btn-icon" aria-hidden="true">◎</span>
            备份
          </button>
        </div>
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
          model={aiModel}
          existingTitles={aiExistingTitles}
          onDrafts={(drafts) => {
            setDraftQueue(drafts)
            setDraftHistory([])
            setDraftTotal(drafts.length)
          }}
        />
      )}

      <section className="filter-bar" aria-label="任务筛选">
        <div className="filter-search">
          <span className="filter-icon" aria-hidden="true">⌕</span>
          <input
            ref={searchInputRef}
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
        <div className="seg seg-sm filter-status" role="group" aria-label="状态筛选">
          {STATUS_FILTERS.map((filter) => (
            <button
              key={filter.key}
              type="button"
              className={statusFilter === filter.key ? 'on' : ''}
              onClick={() => setStatusFilter(filter.key)}
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
            onClick={clearFilters}
          >
            清空筛选
          </button>
        )}
      </section>
      {filterActive && boardView === 'current' && (
        <div className="hint-bar">筛选中暂不支持拖拽排序,清空筛选后再调整顺序</div>
      )}
      {filterActive && filteredBoardViewCounts[boardView] === 0 && (
        <div className="empty-filter">
          <b>没有匹配任务</b>
          <button type="button" className="ghost-btn" onClick={clearFilters}>清空筛选</button>
        </div>
      )}
      {filterActive && (
        <section className="filter-chips" aria-label="当前筛选条件">
          {searchText.trim() && (
            <button type="button" onClick={() => setSearchText('')}>
              搜索:{searchText.trim()} <span aria-hidden="true">×</span>
            </button>
          )}
          {scopeFilter !== 'all' && (
            <button type="button" onClick={() => setScopeFilter('all')}>
              范围:{scopeLabel} <span aria-hidden="true">×</span>
            </button>
          )}
          {statusFilter !== 'all' && (
            <button type="button" onClick={() => setStatusFilter('all')}>
              状态:{statusLabel} <span aria-hidden="true">×</span>
            </button>
          )}
          {focusFilter !== 'all' && (
            <button type="button" onClick={() => setFocusFilter('all')}>
              重点:{FOCUS_FILTER_LABEL[focusFilter]} <span aria-hidden="true">×</span>
            </button>
          )}
        </section>
      )}
      <section className="summary-strip" aria-label="当日概览">
        <button type="button" className={boardView === 'current' && !filterActive ? 'on' : ''} onClick={() => showSummarySlice('current', 'all', 'all')}>
          <b>{todaySummary.active}</b>待处理
        </button>
        <button type="button" className={focusFilter === 'overdue' ? 'on' : ''} onClick={() => showSummarySlice('current', 'all', 'all', 'overdue')}>
          <b>{todaySummary.overdue}</b>过期
        </button>
        <button type="button" className={focusFilter === 'due-today' ? 'on' : ''} onClick={() => showSummarySlice('current', 'all', 'all', 'due-today')}>
          <b>{todaySummary.dueToday}</b>今日截止
        </button>
        <button type="button" className={focusFilter === 'due-tomorrow' ? 'on' : ''} onClick={() => showSummarySlice('current', 'all', 'all', 'due-tomorrow')}>
          <b>{todaySummary.dueTomorrow}</b>明日截止
        </button>
        <button type="button" className={focusFilter === 'stale-doing' ? 'on' : ''} onClick={() => showSummarySlice('current', 'all', 'all', 'stale-doing')}>
          <b>{todaySummary.staleDoing}</b>隔夜进行
        </button>
        <button type="button" className={statusFilter === 'verify' ? 'on' : ''} onClick={() => showSummarySlice('current', 'all', 'verify')}>
          <b>{todaySummary.verify}</b>待验证
        </button>
        <button type="button" className={boardView === 'review' ? 'on' : ''} onClick={() => showSummarySlice('review', 'all', 'all')}>
          <b>{todaySummary.review}</b>待 Review
        </button>
        <button type="button" className={boardView === 'archive' && statusFilter === 'done' ? 'on' : ''} onClick={() => showSummarySlice('archive', 'all', 'done')}>
          <b>{todaySummary.doneToday}</b>今日归档
        </button>
      </section>
      {focusQueue.length > 0 && (
        <section className="focus-strip" aria-label="收口建议">
          <b>收口建议</b>
          <button
            type="button"
            className="focus-primary"
            onClick={() => setEditor(focusQueue[0].task)}
            title="F"
          >
            打开第一项
          </button>
          {focusQueue.map(({ task, reason }) => (
            <button key={task.id} type="button" onClick={() => setEditor(task)}>
              <span>{reason}</span>
              {task.title}
            </button>
          ))}
        </section>
      )}

      {boardLayout === 'scatter' ? (
        <TaskScatter
          tasks={visibleViewTasks}
          boardDate={boardDate}
          onSelect={(t) => setEditor(t)}
        />
      ) : (
        <QuadrantBoard
          tasks={filteredTasks}
          viewMode={boardView}
          isFiltered={filterActive}
          onSelect={(t) => setEditor(t)}
          onDelete={(t) => setDeleting(t)}
          onMove={moveTask}
          onStatusChange={changeTaskStatus}
          onDueChange={changeTaskDue}
        />
      )}

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

      {weekReview && (
        <div className="overlay" onClick={() => setWeekReview(null)}>
          <div
            className="modal review-modal"
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-title-row">
              <div>
                <h2>周回顾</h2>
                <p>{weekReview.startDate} ~ {weekReview.endDate}</p>
              </div>
              <span className="review-total">涉及 {weekReview.total} 个任务</span>
            </div>

            <div className="review-grid">
              <div className="review-stat"><b>{weekReview.created.length}</b><span>本周新增</span></div>
              <div className="review-stat"><b>{weekReview.completed.length}</b><span>本周完成</span></div>
              <div className="review-stat"><b>{weekReview.active.length}</b><span>当前待处理</span></div>
              <div className="review-stat"><b>{weekReview.review.length}</b><span>待 Review</span></div>
              <div className="review-stat"><b>{weekReview.verify.length}</b><span>待验证</span></div>
              <div className="review-stat"><b>{weekReview.overdue.length}</b><span>已过期</span></div>
              <div className="review-stat"><b>{weekReview.netChange >= 0 ? '+' : ''}{weekReview.netChange}</b><span>净变化</span></div>
            </div>

            <section className="review-section">
              <h3>每日节奏</h3>
              <div className="review-days">
                {weekReview.days.map((day) => (
                  <span key={day.date}>
                    <b>{day.date.slice(5)}</b>
                    <em>+{day.created}</em>
                    <em>✓{day.completed}</em>
                    <em>待{day.active}</em>
                  </span>
                ))}
              </div>
            </section>

            <section className="review-section">
              <h3>收口重点</h3>
              {weekReview.focus.length === 0 ? (
                <p className="review-empty">暂无</p>
              ) : (
                <ul>
                  {weekReview.focus.map((task) => (
                    <li key={task.id}>
                      <b>{task.title}</b>
                      <span>{STATUS_META[task.status].label}{task.due_date ? ` / ${task.due_date}` : ''}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="review-section review-columns">
              <div>
                <h3>本周完成</h3>
                {weekReview.completed.length === 0 ? (
                  <p className="review-empty">暂无</p>
                ) : (
                  <ul>
                    {weekReview.completed.slice(0, 6).map((task) => <li key={task.id}><b>{task.title}</b></li>)}
                  </ul>
                )}
              </div>
              <div>
                <h3>待 Review</h3>
                {weekReview.review.length === 0 ? (
                  <p className="review-empty">暂无</p>
                ) : (
                  <ul>
                    {weekReview.review.slice(0, 6).map((task) => <li key={task.id}><b>{task.title}</b></li>)}
                  </ul>
                )}
              </div>
            </section>

            <div className="modal-foot">
              <button
                type="button"
                className="primary-btn"
                onClick={() => void copyWeekReview()}
                title="Ctrl / Cmd + Enter"
              >
                {weekCopied ? '已复制' : '复制回顾'}
              </button>
              <button type="button" className="ghost-btn" onClick={() => setWeekReview(null)}>
                关闭
              </button>
            </div>
          </div>
        </div>
      )}

      {backupOpen && (
        <div className="overlay" onClick={() => setBackupOpen(false)}>
          <div
            className="modal backup-modal"
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            <h2>备份说明</h2>
            <div className="backup-grid">
              <section>
                <h3>本机数据</h3>
                <p>SQLite 数据库和上传图片都在项目的 <b>data/</b> 目录。</p>
              </section>
              <section>
                <h3>数据概览</h3>
                {backupBusy ? (
                  <p>读取中</p>
                ) : backupSummary ? (
                  <p>
                    <b>{backupSummary.task_total}</b> 个任务,
                    <b>{backupSummary.image_total}</b> 张图片,
                    数据约 <b>{formatBytes(backupSummary.database_bytes + backupSummary.upload_bytes)}</b>
                  </p>
                ) : (
                  <p>{backupError || '暂无数据'}</p>
                )}
              </section>
              <section>
                <h3>图片健康</h3>
                {backupBusy ? (
                  <p>检查中</p>
                ) : backupSummary ? (
                  <div className={`backup-health ${uploadHealthOk(backupSummary) ? 'backup-health-ok' : 'backup-health-warn'}`}>
                    <b>{uploadHealthOk(backupSummary) ? '文件一致' : '需要处理'}</b>
                    <span>孤儿 {backupSummary.orphan_upload_count} / 缺失 {backupSummary.missing_upload_count}</span>
                    {backupSummary.orphan_upload_samples.length > 0 && (
                      <em>孤儿:{backupSummary.orphan_upload_samples.join(', ')}</em>
                    )}
                    {backupSummary.missing_upload_samples.length > 0 && (
                      <em>缺失:{backupSummary.missing_upload_samples.join(', ')}</em>
                    )}
                  </div>
                ) : (
                  <p>{backupError || '暂无数据'}</p>
                )}
              </section>
              <section>
                <h3>轻量导出</h3>
                <p>顶部「导出」保存 Markdown,「JSON」保存可导入预检的数据包。</p>
              </section>
              <section>
                <h3>完整备份</h3>
                <p>关闭服务后复制整个 <b>data/</b> 目录,能同时保留任务和图片。</p>
              </section>
              <section>
                <h3>建议节奏</h3>
                <p>日常用 Markdown 留档,每周或大改前复制一次 <b>data/</b>。</p>
              </section>
            </div>
            <div className="modal-foot">
              <button type="button" className="primary-btn" onClick={downloadBoardExport}>
                导出当前视图
              </button>
              <button type="button" className="ghost-btn" onClick={downloadBoardJsonExport}>
                导出 JSON
              </button>
              <button type="button" className="ghost-btn" onClick={() => setBackupOpen(false)}>
                关闭
              </button>
            </div>
          </div>
        </div>
      )}

      {/* AI 草稿优先弹;key 用序号,保证每条草稿都是一个全新的弹窗(状态不残留) */}
      {draftQueue.length > 0 ? (
        <>
          <div className="draft-queue-bar" role="status" aria-live="polite">
            <span>AI 草稿 {currentDraftNumber} / {draftTotal}</span>
            <b>剩余 {draftQueue.length} 条</b>
            <button
              type="button"
              className="ghost-btn"
              onClick={restorePreviousDraft}
              disabled={draftHistory.length === 0}
            >
              上一条
            </button>
            <button type="button" className="ghost-btn" onClick={skipAllDrafts}>
              跳过全部
            </button>
          </div>
          <TaskEditor
            key={`ai-draft-${draftTotal - draftQueue.length}`}
            task={null}
            draft={draftQueue[0]}
            heading={draftTotal > 1 ? `AI 草稿 ${currentDraftNumber} / ${draftTotal}` : 'AI 草稿'}
            onClose={closeCurrentDraft}
            onChanged={loadAfterDraftSaved}
          />
        </>
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
