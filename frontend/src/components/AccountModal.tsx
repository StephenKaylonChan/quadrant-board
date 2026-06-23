import { useState } from 'react'
import { updateAccount } from '../api'

// 账号弹窗:登录后自助改用户名 / 密码。必须填当前密码;用户名和新密码至少改一项。
export default function AccountModal({
  currentUsername,
  onClose,
  onUpdated,
}: {
  currentUsername: string
  onClose: () => void
  onUpdated: (username: string) => void
}) {
  const [currentPassword, setCurrentPassword] = useState('')
  const [newUsername, setNewUsername] = useState(currentUsername)
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (busy) return

    const trimmedName = newUsername.trim()
    const nameChanged = trimmedName !== '' && trimmedName !== currentUsername
    const passwordChanged = newPassword !== ''

    if (!nameChanged && !passwordChanged) {
      setError('没有要修改的内容')
      return
    }
    if (passwordChanged && newPassword.length < 6) {
      setError('新密码至少 6 位')
      return
    }
    if (passwordChanged && newPassword !== confirmPassword) {
      setError('两次输入的新密码不一致')
      return
    }

    setBusy(true)
    setError('')
    try {
      const res = await updateAccount({
        current_password: currentPassword,
        ...(nameChanged ? { new_username: trimmedName } : {}),
        ...(passwordChanged ? { new_password: newPassword } : {}),
      })
      onUpdated(res.username)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : '修改失败')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="overlay" onClick={onClose}>
      <form
        className="modal account-modal"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
      >
        <h2>账号设置</h2>
        <label className="account-field">
          <span>当前用户名</span>
          <input type="text" value={newUsername} onChange={(e) => setNewUsername(e.target.value)} autoComplete="username" />
        </label>
        <label className="account-field">
          <span>当前密码（必填，用于验证身份）</span>
          <input
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            autoComplete="current-password"
            autoFocus
          />
        </label>
        <label className="account-field">
          <span>新密码（不改就留空，至少 6 位）</span>
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            autoComplete="new-password"
          />
        </label>
        <label className="account-field">
          <span>确认新密码</span>
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            autoComplete="new-password"
          />
        </label>
        {error && <p className="login-error">{error}</p>}
        <div className="modal-foot">
          <button type="submit" className="primary-btn" disabled={busy || !currentPassword}>
            {busy ? '保存中' : '保存'}
          </button>
          <button type="button" className="ghost-btn" onClick={onClose}>
            取消
          </button>
        </div>
      </form>
    </div>
  )
}
