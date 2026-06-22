# 文档生态守护报告 — 2026-06-22（阅读模式 + 拖拽修复）

范围：全量。锚定基准 `cef8a74`（上次架构文档同步）以来的本批未提交改动。

## 触发改动（代码，本报告不含其提交）

- 新增阅读模式（`App.tsx` `readingMode` + `toggleReadingMode`、`styles.css` `.reading-mode`）。
- 修复拖去无期限象限丢截止日期：后端新增 `last_due_date` 列 + `update_task` 不变式 + 迁移；前端 `dropAt` 按 `due_date ?? last_due_date ?? 今天` 还原，`moveTask` / `changeTaskDue` 乐观更新同步 `dueClearPatch`。
- 修复跨象限拖拽卡片半透明卡住：`dropAt` / `dropOnCard` 在放下路径即清 `draggingId`，不再只靠 `dragend`。
- 评审修复：阅读模式进入时清空筛选；`dropOnCard` 自落兜底。

## 四种操作统计

- 更新 8 处：README App 职责、frontend 拖拽日期还原段 / 键盘 / 样式、backend 迁移列表 / 验证方式、database-migrations 迁移列表、regression 拖拽项。
- 新增 12 处：README 核心模型 `last_due_date` + 3 条非直觉决策、frontend `readingMode` 状态 / 拖拽收尾段 / 回归 3 项、backend `last_due_date` 字段 + `update_task` 不变式段、regression 阅读模式项、changelog Added 2 + Fixed 3、CLAUDE.md 2 条约束、roadmap backlog（`sort_order` 精度，单独文件）。
- 删除 0 处。
- 审计 0 处：`docs/specs/` 为空，`adr/` 仅占位，无 spec-code / ADR / Gate 问题。

## 涉及文档

- `CLAUDE.md`：+2 约束（`last_due_date` 后端托管、阅读模式纯 CSS）。
- `docs/architecture/README.md`：App 职责、核心状态模型、非直觉决策。
- `docs/architecture/frontend.md`：状态、拖拽日期还原与收尾、键盘、样式、手动回归。
- `docs/architecture/backend.md`：数据模型 + `update_task` 不变式、迁移列表、验证方式。
- `docs/development/regression-checklist.md`：拖拽往返还原 / 不卡住、阅读模式。
- `docs/development/database-migrations.md`：`last_due_date` 迁移。
- `docs/development/changelog.md`：Added 2 + Fixed 3。
- `docs/roadmap/`：backlog.md（`sort_order` 浮点精度技术债）+ README 指针。

## 需用户关注（代码侧，/docs 未修）

- `sort_order` 浮点中点精度坍塌：已记入 `docs/roadmap/backlog.md`，未排期。

## 待办

- 代码改动（9 文件）尚未提交；按「代码先于文档」约定，应在用户确认拖拽手动回归后，先提 `feat`/`fix` 代码，再提本批 `docs`。
