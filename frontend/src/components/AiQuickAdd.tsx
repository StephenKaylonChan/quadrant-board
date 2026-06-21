import { useEffect, useState } from 'react'
import { aiParseTasks } from '../api'
import type { TaskDraft } from '../api'

interface Props {
  // 拆解成功后把草稿交给 App,由 App 逐条弹出预填好的编辑窗
  onDrafts: (drafts: TaskDraft[]) => void
  model?: string
  existingTitles?: string[]
  reviewPrompt?: string
  prefillPrompt?: string
}

const AI_RECENT_KEY = 'qb-ai-recent-prompts'
const AI_CUSTOM_TEMPLATE_KEY = 'qb-ai-custom-templates'
const AI_TEMPLATES = [
  '排查线上异常,定位根因并给出修复方案',
  '已合并待真实环境验证,通过后归档',
  '整理今天要做的开发、沟通和复盘事项',
]
const AI_PARSE_TIMEOUT_MS = 35_000

function loadRecentPrompts(): string[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(AI_RECENT_KEY) ?? '[]')
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string').slice(0, 3) : []
  } catch {
    return []
  }
}

function loadCustomTemplates(): string[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(AI_CUSTOM_TEMPLATE_KEY) ?? '[]')
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string').slice(0, 8) : []
  } catch {
    return []
  }
}

// AI 快捷新建:一句话 -> 草稿 -> 预填编辑窗确认后入库
export default function AiQuickAdd({ onDrafts, model, existingTitles = [], reviewPrompt, prefillPrompt }: Props) {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [recentPrompts, setRecentPrompts] = useState<string[]>(loadRecentPrompts)
  const [customTemplates, setCustomTemplates] = useState<string[]>(loadCustomTemplates)

  useEffect(() => {
    if (!prefillPrompt) return
    setText(prefillPrompt)
    setError('')
    setNotice('已填入 AI 提示,可继续编辑后拆解')
  }, [prefillPrompt])

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

  function clearInput() {
    setText('')
    setError('')
    setNotice('')
  }

  function saveTemplate() {
    const prompt = text.trim()
    if (!prompt) return
    const next = [prompt, ...customTemplates.filter((item) => item !== prompt)].slice(0, 8)
    setCustomTemplates(next)
    localStorage.setItem(AI_CUSTOM_TEMPLATE_KEY, JSON.stringify(next))
    setNotice('已保存为 AI 模板')
    setError('')
  }

  function removeTemplate(prompt: string) {
    const next = customTemplates.filter((item) => item !== prompt)
    setCustomTemplates(next)
    localStorage.setItem(AI_CUSTOM_TEMPLATE_KEY, JSON.stringify(next))
  }

  async function parse() {
    const prompt = text.trim()
    if (!prompt || busy) return
    setBusy(true)
    setError('')
    setNotice('')
    rememberPrompt(prompt)
    const controller = new AbortController()
    const timeoutId = window.setTimeout(() => controller.abort(), AI_PARSE_TIMEOUT_MS)
    try {
      const drafts = await aiParseTasks(prompt, existingTitles, controller.signal)
      if (drafts.length === 0) {
        throw new Error('AI 没有拆出草稿,换个说法再试试')
      }
      setText('')
      setNotice(`已拆出 ${drafts.length} 条草稿,请逐条确认后保存`)
      onDrafts(drafts)
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') {
        setError('AI 拆解超过 35 秒,可以重试或把输入拆短一点')
      } else {
        setError(e instanceof Error ? e.message : 'AI 拆解失败')
      }
    } finally {
      window.clearTimeout(timeoutId)
      setBusy(false)
    }
  }

  return (
    <div className="ai-area">
      <div className="ai-bar">
        <span className="ai-tag">AI</span>
        {model && <span className="ai-model">{model}</span>}
        {existingTitles.length > 0 && <span className="ai-context">参考 {existingTitles.length} 条当前任务去重</span>}
        <textarea
          className="ai-input"
          rows={2}
          value={text}
          onChange={(e) => {
            setText(e.target.value)
            if (error) setError('')
            if (notice) setNotice('')
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault()
              void parse()
            }
          }}
          disabled={busy}
          aria-label="AI 拆任务输入"
          placeholder="粘贴一段要拆的事项,Enter 拆解,Shift+Enter 换行…"
        />
        <button
          type="button"
          className="ghost-btn"
          onClick={() => void parse()}
          disabled={busy || !text.trim()}
        >
          {busy ? '拆解中…' : '拆解'}
        </button>
        <button
          type="button"
          className="ghost-btn"
          onClick={saveTemplate}
          disabled={busy || !text.trim()}
        >
          存模板
        </button>
      </div>
      <div className="ai-suggestions" aria-label="AI 输入快捷项">
        {reviewPrompt && (
          <button type="button" onClick={() => usePrompt(reviewPrompt)} disabled={busy}>
            当前筛选复盘
          </button>
        )}
        {AI_TEMPLATES.map((item) => (
          <button key={item} type="button" onClick={() => usePrompt(item)} disabled={busy}>
            {item}
          </button>
        ))}
        {customTemplates.map((item) => (
          <span key={`custom-${item}`} className="ai-template-chip">
            <button type="button" onClick={() => usePrompt(item)} disabled={busy}>
              模板:{item}
            </button>
            <button
              type="button"
              className="ai-template-remove"
              onClick={() => removeTemplate(item)}
              disabled={busy}
              aria-label={`删除模板:${item}`}
            >
              ×
            </button>
          </span>
        ))}
        {recentPrompts.map((item) => (
          <button key={`recent-${item}`} type="button" onClick={() => usePrompt(item)} disabled={busy}>
            最近:{item}
          </button>
        ))}
      </div>
      {error && (
        <div className="ai-error-row" role="alert">
          <p className="error-text ai-error">{error}</p>
          <button type="button" className="ghost-btn" onClick={() => void parse()} disabled={busy || !text.trim()}>
            重试
          </button>
          <button type="button" className="ghost-btn" onClick={clearInput} disabled={busy}>
            清空
          </button>
        </div>
      )}
      {notice && <p className="ai-feedback" aria-live="polite">{notice}</p>}
    </div>
  )
}
