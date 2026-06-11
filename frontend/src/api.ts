// 所有跟后端打交道的请求都集中在这个文件,组件里只调这里的函数
import type { Task, TaskImage, TaskStatus } from './types'

// 通用请求封装:非 2xx 一律抛错,错误信息优先用后端返回的 detail
async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, options)
  if (!res.ok) {
    const body = await res.json().catch(() => null)
    const detail = body && typeof body.detail === 'string' ? body.detail : null
    throw new Error(detail ?? `请求失败(HTTP ${res.status})`)
  }
  // 204 = 成功但没有内容(删除接口),不能再去解析 JSON
  return res.status === 204 ? (undefined as T) : res.json()
}

const jsonHeaders = { 'Content-Type': 'application/json' }

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

export function aiStatus(): Promise<{ enabled: boolean }> {
  return request('/api/ai/status')
}

export function aiParseTasks(text: string): Promise<TaskDraft[]> {
  return request('/api/ai/parse-task', {
    method: 'POST',
    headers: jsonHeaders,
    body: JSON.stringify({ text }),
  })
}
