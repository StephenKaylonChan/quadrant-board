import { useState } from 'react'
import { aiParseTasks } from '../api'
import type { TaskDraft } from '../api'

interface Props {
  // 拆解成功后把草稿交给 App,由 App 逐条弹出预填好的编辑窗
  onDrafts: (drafts: TaskDraft[]) => void
  model?: string
}

const AI_RECENT_KEY = 'qb-ai-recent-prompts'
const AI_TEMPLATES = [
  '排查线上异常,定位根因并给出修复方案',
  '已合并待真实环境验证,通过后归档',
  '整理今天要做的开发、沟通和复盘事项',
]

function loadRecentPrompts(): string[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(AI_RECENT_KEY) ?? '[]')
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string').slice(0, 3) : []
  } catch {
    return []
  }
}

// AI 快捷新建:一句话 -> 草稿 -> 预填编辑窗确认后入库
export default function AiQuickAdd({ onDrafts, model }: Props) {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [recentPrompts, setRecentPrompts] = useState<string[]>(loadRecentPrompts)

  function rememberPrompt(prompt: string) {
    const next = [prompt, ...recentPrompts.filter((item) => item !== prompt)].slice(0, 3)
    setRecentPrompts(next)
    localStorage.setItem(AI_RECENT_KEY, JSON.stringify(next))
  }

  function usePrompt(prompt: string) {
    setText(prompt)
    setError('')
    setNotice('')
  }

  async function parse() {
    const prompt = text.trim()
    if (!prompt || busy) return
    setBusy(true)
    setError('')
    setNotice('')
    rememberPrompt(prompt)
    try {
      const drafts = await aiParseTasks(prompt)
      if (drafts.length === 0) {
        throw new Error('AI 没有拆出草稿,换个说法再试试')
      }
      setText('')
      setNotice(`已拆出 ${drafts.length} 条草稿,请逐条确认后保存`)
      onDrafts(drafts)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'AI 拆解失败')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="ai-area">
      <div className="ai-bar">
        <span className="ai-tag">AI</span>
        {model && <span className="ai-model">{model}</span>}
        <input
          type="text"
          className="ai-input"
          value={text}
          onChange={(e) => {
            setText(e.target.value)
            if (error) setError('')
            if (notice) setNotice('')
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.nativeEvent.isComposing) void parse()
          }}
          disabled={busy}
          aria-label="AI 拆任务输入"
          placeholder="一句话描述要做的事(可以一次说好几件),回车让 AI 拆好并弹出确认窗…"
        />
        <button
          type="button"
          className="ghost-btn"
          onClick={() => void parse()}
          disabled={busy || !text.trim()}
        >
          {busy ? '拆解中…' : '拆解'}
        </button>
      </div>
      <div className="ai-suggestions" aria-label="AI 输入快捷项">
        {AI_TEMPLATES.map((item) => (
          <button key={item} type="button" onClick={() => usePrompt(item)} disabled={busy}>
            {item}
          </button>
        ))}
        {recentPrompts.map((item) => (
          <button key={`recent-${item}`} type="button" onClick={() => usePrompt(item)} disabled={busy}>
            最近:{item}
          </button>
        ))}
      </div>
      {error && <p className="error-text ai-error">{error}</p>}
      {notice && <p className="ai-feedback" aria-live="polite">{notice}</p>}
    </div>
  )
}
