import { useRef, useState } from 'react'
import { login } from '../api'

// 登录闸门:开启鉴权且未登录时挡在面板前。只做一件事——拿密码换登录态,成功后回调放行。
export default function LoginGate({ onSuccess }: { onSuccess: () => void }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const passwordRef = useRef<HTMLInputElement>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (busy || !username || !password) return
    setBusy(true)
    setError('')
    try {
      await login(username, password)
      onSuccess()
    } catch (err) {
      setError(err instanceof Error ? err.message : '登录失败')
      setPassword('')
      passwordRef.current?.focus()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="login-gate">
      <form className="login-card" onSubmit={submit}>
        <h1>每日四象限</h1>
        <p className="login-sub">请输入账号密码</p>
        <input
          type="text"
          className="login-input"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="用户名"
          aria-label="用户名"
          autoComplete="username"
          autoFocus
        />
        <input
          ref={passwordRef}
          type="password"
          className="login-input"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="密码"
          aria-label="密码"
          autoComplete="current-password"
        />
        {error && <p className="login-error">{error}</p>}
        <button type="submit" className="primary-btn login-submit" disabled={busy || !username || !password}>
          {busy ? '登录中' : '进入'}
        </button>
      </form>
    </div>
  )
}
