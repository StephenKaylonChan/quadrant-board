# 文档生态守护报告 — 2026-06-22（视觉布局优化）

## 范围与锚定

- 范围:全量守护
- 锚定:上次文档 commit `9f76424`（即上次 /docs 运行）。自那以来**无已提交源码变更**。
- 本次驱动来源:**工作区未提交的视觉布局改动**（用户明确要求「这个也记录下来」）——`frontend/src/styles.css`、`frontend/src/App.tsx`、`.gitignore`。

## 代码事实（被记录的改动）

1. 四象限主视图改为**整页滚动**:`.app` 用 `min-height`、`.board`/`.q-list` 去掉固定高度与 `overflow`，象限内部不再独立滚动，整页一个滚动条。
2. `.topbar` 改为**吸顶**（`position: sticky`）。
3. 卡片备注 `.card-desc` **去掉两行截断**（`-webkit-line-clamp:2` → `white-space:pre-wrap`），完整展开。
4. **AI 输入区可一键收起**:App.tsx 加 `aiCollapsed` 状态 + `qb-ai-collapsed` 持久化；`.ai-zone`/`.ai-toggle` 样式；`aiPrefillPrompt` 非空时自动展开。
5. 工具流程:Playwright MCP 自主截图调试，按真实 CSS 宽度（4K Retina = 1920）复现。

## 四种操作统计

- 更新:7 处
  - `frontend.md` 样式规则「单屏工作台」→ 整页滚动模型（核心过时修正）
  - `frontend.md` 状态清单补 `aiCollapsed`
  - `frontend.md` 性能边界「一屏扫视」→「整页扫视」
  - `frontend.md` 手动回归重点补整页滚动 + AI 收起
  - `architecture/README.md` App.tsx「单屏应用」→「单页应用」+ AI 收起职责
  - `getting-started.md` 项目结构「单屏应用」→「单页应用」
  - `regression-checklist.md` 任务面板 + AI 草稿段补整页滚动 / 卡片展开 / AI 收起核查项
- 新增:3 处
  - `getting-started.md` 新增「视觉调试（可选）」节,记录 Playwright MCP 工作流与分辨率坑
  - `changelog.md` Added 补 AI 收起 + Playwright 工作流
  - `changelog.md` Changed 补整页滚动
- 删除:0 处（无指向已删代码的过时引用）
- 审计:0 处（无 spec / ADR / Gate）

## 需用户关注（代码问题，/docs 未修）

- 无代码不一致问题。代码改动本身正确且已 `npm run build` 通过。
- ⚠️ **代码改动仍未提交**,且拖拽手动回归未做。文档现在描述的是工作区行为,建议**代码 + 文档一并提交**（而非文档单独提交），以免 git 历史里文档先于代码。

## 历史趋势

- 上次（2026-06-22 docs-2026-06-22.md）:14 新增 + 7 更新,审计 N/A
- 本次:3 新增 + 7 更新 + 0 删除,审计 N/A（→ 持平,均为文档跟随已实现代码）
