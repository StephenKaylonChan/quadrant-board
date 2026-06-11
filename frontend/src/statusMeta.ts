import type { TaskStatus } from './types'

export const STATUS_META: Record<
  TaskStatus,
  {
    label: string
    icon: string
    activeRank: number
    syncTitle: string
    syncSummary: string
  }
> = {
  todo: {
    label: '待办',
    icon: '○',
    activeRank: 3,
    syncTitle: '待办 / 待确认',
    syncSummary: '待办/待确认',
  },
  doing: {
    label: '进行中',
    icon: '▶',
    activeRank: 1,
    syncTitle: '今日处理中',
    syncSummary: '今日处理中',
  },
  review: {
    label: '待 Review',
    icon: '↗',
    activeRank: 4,
    syncTitle: '待 Review',
    syncSummary: '待 Review',
  },
  verify: {
    label: '待验证',
    icon: '◇',
    activeRank: 2,
    syncTitle: '待验证 / 测试闭环',
    syncSummary: '待验证',
  },
  done: {
    label: '已完成',
    icon: '✓',
    activeRank: 5,
    syncTitle: '今日已归档',
    syncSummary: '今日已归档',
  },
}

export const EDITOR_STATUS_ORDER: TaskStatus[] = ['todo', 'doing', 'review', 'verify', 'done']
export const SYNC_STATUS_ORDER: TaskStatus[] = ['review', 'verify', 'doing', 'todo', 'done']
