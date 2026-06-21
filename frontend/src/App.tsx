import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { aiStatus, deleteTask, fetchTasks, updateTask } from './api'
import type { TaskDraft } from './api'
import AiQuickAdd from './components/AiQuickAdd'
import QuadrantBoard, { type MovePatch } from './components/QuadrantBoard'
import TaskEditor from './components/TaskEditor'
import { addDays, todayStr } from './dates'
import { useDocumentEvent } from './hooks/useDocumentEvent'
import { STATUS_META } from './statusMeta'
import { buildBoardExport, buildDailySync, downloadTextFile } from './taskReports'
import { buildWeekReview, buildWeekReviewText, type WeekReview } from './taskReview'
import {
  BOARD_VIEW_LABEL,
  BOARD_VIEW_ORDER,
  SCOPE_FILTERS,
  STATUS_FILTERS,
  countByView,
  countTodaySummary,
  matchScope,
  matchSearch,
  matchStatus,
  tasksForView,
  type BoardView,
  type ScopeFilter,
  type StatusFilter,
} from './taskViews'
import type { Task } from './types'

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六']

type ThemeMode = 'light' | 'dark' | 'system'
const THEME_LABEL: Record<ThemeMode, string> = { light: '浅色', dark: '深色', system: '系统' }
const THEME_KEY = 'qb-theme'

function loadTheme(): ThemeMode {
  const saved = localStorage.getItem(THEME_KEY)
  return saved === 'light' || saved === 'dark' || saved === 'system' ? saved : 'system'
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
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [exported, setExported] = useState(false)
  const [weekReview, setWeekReview] = useState<WeekReview | null>(null)
  const [weekBusy, setWeekBusy] = useState(false)
  const [weekCopied, setWeekCopied] = useState(false)
  const searchInputRef = useRef<HTMLInputElement>(null)

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
    }
  }, deleting !== null || syncDraft !== '' || weekReview !== null)

  useDocumentEvent('keydown', (e) => {
    const target = e.target instanceof HTMLElement ? e.target : null
    const isTyping = target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA'

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
      searchInputRef.current?.blur()
    }
  }, editor === null && draftQueue.length === 0 && deleting === null && syncDraft === '' && weekReview === null)

  const isToday = boardDate === today
  const weekday = WEEKDAYS[new Date(`${boardDate}T00:00:00`).getDay()]
  const normalizedSearch = searchText.trim().toLowerCase()
  const filterActive = normalizedSearch !== '' || scopeFilter !== 'all' || statusFilter !== 'all'
  const filteredTasks = useMemo(
    () => tasks.filter(
      (task) => matchScope(task, scopeFilter)
        && matchStatus(task, statusFilter)
        && matchSearch(task, normalizedSearch),
    ),
    [normalizedSearch, scopeFilter, statusFilter, tasks],
  )
  const boardViewCounts = useMemo(() => countByView(tasks), [tasks])
  const filteredBoardViewCounts = useMemo(() => countByView(filteredTasks), [filteredTasks])
  const tabCounts = filterActive ? filteredBoardViewCounts : boardViewCounts
  const visibleViewTasks = useMemo(() => tasksForView(filteredTasks, boardView), [boardView, filteredTasks])
  const todaySummary = useMemo(() => countTodaySummary(tasks, boardDate), [boardDate, tasks])

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
          {BOARD_VIEW_ORDER.map((view) => (
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
            onClick={() => {
              setSearchText('')
              setScopeFilter('all')
              setStatusFilter('all')
            }}
          >
            清空筛选
          </button>
        )}
      </section>
      {filterActive && boardView === 'current' && (
        <div className="hint-bar">筛选中暂不支持拖拽排序,清空筛选后再调整顺序</div>
      )}
      <section className="summary-strip" aria-label="当日概览">
        <span><b>{todaySummary.active}</b>待处理</span>
        <span><b>{todaySummary.overdue}</b>过期</span>
        <span><b>{todaySummary.dueToday}</b>今日截止</span>
        <span><b>{todaySummary.verify}</b>待验证</span>
        <span><b>{todaySummary.review}</b>待 Review</span>
        <span><b>{todaySummary.doneToday}</b>今日归档</span>
      </section>

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
            </div>

            <section className="review-section">
              <h3>每日节奏</h3>
              <div className="review-days">
                {weekReview.days.map((day) => (
                  <span key={day.date}>
                    <b>{day.date.slice(5)}</b>
                    <em>+{day.created}</em>
                    <em>✓{day.completed}</em>
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
