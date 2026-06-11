// 日期工具:全部基于本地时区的 "YYYY-MM-DD" 字符串
// (不能用 toISOString,那是 UTC,会差 8 小时)

export function toDateStr(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function todayStr(): string {
  return toDateStr(new Date())
}

export function addDays(dateStr: string, delta: number): string {
  const d = new Date(`${dateStr}T00:00:00`)
  d.setDate(d.getDate() + delta)
  return toDateStr(d)
}

// 把截止日期变成卡片徽章文案:已过期(标红)/ 今天 / 明天 / 06-15;无期限不显示
export function dueLabel(due: string | null): { text: string; overdue: boolean } | null {
  if (!due) return null
  const today = todayStr()
  if (due < today) return { text: `已过期 ${due.slice(5)}`, overdue: true }
  if (due === today) return { text: '今天', overdue: false }
  if (due === addDays(today, 1)) return { text: '明天', overdue: false }
  return { text: due.slice(5), overdue: false }
}
