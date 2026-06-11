---
paths:
  - "frontend/src/**/*.ts"
  - "frontend/src/**/*.tsx"
  - "frontend/src/**/*.css"
  - "frontend/vite.config.ts"
---

## 前端红线

- MUST NOT 使用 `toISOString()` 生成业务日期，MUST 使用 `dates.ts` 的本地日期工具。
- MUST NOT 写死主题颜色，新增颜色 MUST 走 CSS 变量，并在 `[data-theme='dark']` 同步覆盖。
- MUST NOT 引入 UI 库，除非先更新架构文档并说明必要性。
- MUST NOT 用 `window.confirm` 做删除或关闭确认，MUST 使用现有 `confirm-layer` 模式。
- MUST NOT 读写 `urgency / importance` 旧打分字段，前端类型 MUST 使用 `important / due_date`。

## 前端规范

- MUST 保持界面文案为中文。
- MUST 把后端请求集中在 `frontend/src/api.ts`。
- MUST 保持图片复制语义：卡片缩略图点击复制，灯箱右键复制。
- 涉及关键交互时，MUST 手动回归拖拽、弹窗关闭确认、图片粘贴和历史日期。
- 当前没有 ESLint/Prettier 项目配置；格式化 Hook 只在本机可用工具存在时执行。
