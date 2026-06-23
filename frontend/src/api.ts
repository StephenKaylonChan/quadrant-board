// 所有跟后端打交道的请求都集中在这个文件,组件里只调这里的函数
import type { Task, TaskImage, TaskStatus } from './types'

// 登录态过期(401)时由 App 注册一个回调,统一弹回登录页;避免每个调用点各自处理
let onUnauthorized: (() => void) | null = null
export function setUnauthorizedHandler(handler: (() => void) | null): void {
  onUnauthorized = handler
}

// 通用请求封装:非 2xx 一律抛错,错误信息优先用后端返回的 detail
async function request<T>(url: string, options?: RequestInit): Promise<T> {
  // same-origin:前后端同源(生产同域名、本地走 Vite 代理),浏览器会自动带上会话 cookie
  const res = await fetch(url, { credentials: 'same-origin', ...options })
  if (!res.ok) {
    // 401 = 未登录或登录过期:通知 App 切回登录页,再抛错让调用方停下
    if (res.status === 401) onUnauthorized?.()
    const body = await res.json().catch(() => null)
    const detail = body && typeof body.detail === 'string' ? body.detail : null
    throw new Error(detail ?? `请求失败(HTTP ${res.status})`)
  }
  // 204 = 成功但没有内容(删除接口),不能再去解析 JSON
  return res.status === 204 ? (undefined as T) : res.json()
}

const jsonHeaders = { 'Content-Type': 'application/json' }

// ===== 登录鉴权 =====

// 启动时先问后端:是否开启了鉴权、当前登没登、当前用户名(未开启时 authenticated 恒为 true)
export function authStatus(): Promise<{ auth_enabled: boolean; authenticated: boolean; username: string | null }> {
  return request('/api/auth/status')
}

// 提交用户名 + 密码换登录态;成功后后端会写好会话 cookie,前端不持有任何 token
export function login(username: string, password: string): Promise<{ ok: boolean; auth_enabled: boolean }> {
  return request('/api/auth/login', {
    method: 'POST',
    headers: jsonHeaders,
    body: JSON.stringify({ username, password }),
  })
}

export function logout(): Promise<{ ok: boolean }> {
  return request('/api/auth/logout', { method: 'POST' })
}

// 登录后自助改用户名 / 密码:必须带当前密码,新用户名 / 新密码至少传一个
export function updateAccount(payload: {
  current_password: string
  new_username?: string
  new_password?: string
}): Promise<{ ok: boolean; username: string }> {
  return request('/api/auth/account', {
    method: 'POST',
    headers: jsonHeaders,
    body: JSON.stringify(payload),
  })
}

export interface TaskFields {
  title: string
  description: string
  important: boolean
  due_date: string | null
  status: TaskStatus
}

export function fetchTasks(on: string): Promise<Task[]> {
  return request(`/api/tasks?on=${on}`)
}

export function createTask(data: TaskFields): Promise<Task> {
  return request('/api/tasks', {
    method: 'POST',
    headers: jsonHeaders,
    body: JSON.stringify(data),
  })
}

export function updateTask(
  id: number,
  data: Partial<TaskFields> & { sort_order?: number },
): Promise<Task> {
  return request(`/api/tasks/${id}`, {
    method: 'PATCH',
    headers: jsonHeaders,
    body: JSON.stringify(data),
  })
}

export function deleteTask(id: number): Promise<void> {
  return request(`/api/tasks/${id}`, { method: 'DELETE' })
}

export function uploadImages(taskId: number, files: File[]): Promise<TaskImage[]> {
  // 图片不能用 JSON 传,要用表单(multipart);字段名 files 必须和后端参数名一致
  const form = new FormData()
  for (const file of files) {
    form.append('files', file, file.name || 'pasted.png')
  }
  return request(`/api/tasks/${taskId}/images`, { method: 'POST', body: form })
}

export function deleteImage(id: number): Promise<void> {
  return request(`/api/images/${id}`, { method: 'DELETE' })
}

export function imageUrl(img: TaskImage): string {
  return `/uploads/${img.filename}`
}

// ===== AI 拆任务 =====

// AI 返回的任务草稿,字段刚好就是建任务需要的那几个
export type TaskDraft = TaskFields

export function aiStatus(): Promise<{ enabled: boolean; model: string }> {
  return request('/api/ai/status')
}

export function aiParseTasks(
  text: string,
  existingTitles: string[] = [],
  signal?: AbortSignal,
): Promise<TaskDraft[]> {
  return request('/api/ai/parse-task', {
    method: 'POST',
    headers: jsonHeaders,
    signal,
    body: JSON.stringify({ text, existing_titles: existingTitles.slice(0, 30) }),
  })
}

// ===== 本机数据维护 =====

export interface MaintenanceSummary {
  data_dir: string
  upload_dir: string
  task_total: number
  open_total: number
  done_total: number
  image_total: number
  database_bytes: number
  upload_bytes: number
  orphan_upload_count: number
  orphan_upload_samples: string[]
  missing_upload_count: number
  missing_upload_samples: string[]
}

export function fetchMaintenanceSummary(): Promise<MaintenanceSummary> {
  return request('/api/maintenance/summary')
}
