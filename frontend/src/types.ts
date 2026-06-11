// 和后端 schemas.py 里的 TaskOut / ImageOut 一一对应
// review = 已提交 PR 待审核:不用动手但没完事,留在面板上
export type TaskStatus = 'todo' | 'doing' | 'review' | 'done'

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
