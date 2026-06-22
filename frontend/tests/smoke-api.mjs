const API_BASE = process.env.API_BASE ?? 'http://backend:8000/api'

function todayInShanghai() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

async function request(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers,
    },
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`${options.method ?? 'GET'} ${path} 失败: ${res.status} ${body}`)
  }
  return res.status === 204 ? undefined : res.json()
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

const marker = `__smoke_api_${Date.now()}__`
let taskId = null

try {
  const health = await request('/health')
  assert(health.status === 'ok', '健康检查没有返回 ok')

  const created = await request('/tasks', {
    method: 'POST',
    body: JSON.stringify({
      title: marker,
      description: '自动回归检查创建的临时任务',
      important: true,
      due_date: null,
      status: 'todo',
    }),
  })
  taskId = created.id
  assert(created.title === marker, '创建任务返回的标题不正确')
  assert(created.completed_date === null, '新建未完成任务不应有完成日期')

  const boardDate = todayInShanghai()
  const listed = await request(`/tasks?on=${boardDate}`)
  assert(listed.some((task) => task.id === taskId), '今天面板没有查到新建任务')

  const done = await request(`/tasks/${taskId}`, {
    method: 'PATCH',
    body: JSON.stringify({ status: 'done' }),
  })
  assert(done.status === 'done', '任务没有切到已完成')
  assert(done.completed_date === boardDate, '完成日期没有写成今天')

  const restored = await request(`/tasks/${taskId}`, {
    method: 'PATCH',
    body: JSON.stringify({ status: 'todo' }),
  })
  assert(restored.completed_date === null, '从已完成恢复时没有清空完成日期')

  // 截止日期被清空时,后端要把原值记到 last_due_date,供拖回有期限象限时还原
  const withDue = await request(`/tasks/${taskId}`, {
    method: 'PATCH',
    body: JSON.stringify({ due_date: boardDate }),
  })
  assert(withDue.due_date === boardDate, '设置截止日期没有生效')
  const cleared = await request(`/tasks/${taskId}`, {
    method: 'PATCH',
    body: JSON.stringify({ due_date: null }),
  })
  assert(cleared.due_date === null, '清空截止日期没有生效')
  assert(cleared.last_due_date === boardDate, '清空截止日期时没有记住原日期到 last_due_date')

  await request(`/tasks/${taskId}`, { method: 'DELETE' })
  taskId = null

  console.log('smoke:api 通过')
} finally {
  if (taskId !== null) {
    await request(`/tasks/${taskId}`, { method: 'DELETE' }).catch((err) => {
      console.error(`清理临时任务失败: ${err.message}`)
    })
  }
}
