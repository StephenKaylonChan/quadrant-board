// 和后端 schemas.py 里的 TaskOut / ImageOut 一一对应
// review = 已提交 PR 待审核:轮到别人处理;verify = 已合并待真实环境验证:轮到自己收口
export type TaskStatus = 'todo' | 'doing' | 'review' | 'verify' | 'done'

export interface TaskImage {
  id: number
  filename: string
  original_name: string
}

export interface Task {
  id: number
  title: string
  description: string
  important: boolean // 上下行:重要 / 不重要
  due_date: string | null // 左右列:有截止日期 / 无期限;紧急度由它推导
  status: TaskStatus
  sort_order: number
  created_date: string
  completed_date: string | null
  images: TaskImage[]
}
