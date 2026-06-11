import { useCallback, useEffect, useState } from 'react'
import { aiStatus, deleteTask, fetchTasks, updateTask } from './api'
import type { TaskDraft } from './api'
import AiQuickAdd from './components/AiQuickAdd'
import QuadrantBoard, { type MovePatch } from './components/QuadrantBoard'
import TaskEditor from './components/TaskEditor'
import { addDays, todayStr } from './dates'
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

  const isToday = boardDate === today
  const weekday = WEEKDAYS[new Date(`${boardDate}T00:00:00`).getDay()]

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

        <button
          className="primary-btn"
          onClick={() => setEditor('create')}
          disabled={!isToday}
          title={isToday ? '' : '历史面板只能查看,回到今天再新建'}
        >
          + 新任务
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

      <QuadrantBoard
        tasks={tasks}
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
