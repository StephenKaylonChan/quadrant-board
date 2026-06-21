import { useState } from 'react'
import { aiParseTasks } from '../api'
import type { TaskDraft } from '../api'

interface Props {
  // 拆解成功后把草稿交给 App,由 App 逐条弹出预填好的编辑窗
  onDrafts: (drafts: TaskDraft[]) => void
}

// AI 快捷新建:一句话 -> 草稿 -> 预填编辑窗确认后入库
export default function AiQuickAdd({ onDrafts }: Props) {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  async function parse() {
    if (!text.trim() || busy) return
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const drafts = await aiParseTasks(text.trim())
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
      {error && <p className="error-text ai-error">{error}</p>}
      {notice && <p className="ai-feedback" aria-live="polite">{notice}</p>}
    </div>
  )
}
