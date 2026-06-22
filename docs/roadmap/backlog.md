# Backlog（未排期技术债）

> 已识别、但暂不属于任何 Phase 的改进项。记录原因和建议修法，避免被遗忘，也避免塞进无关改动里。

## 待处理

- [ ] **`sort_order` 浮点中点插队的精度坍塌**
  - 现象：拖拽插队用 `(before.sort_order + after.sort_order) / 2` 取中点（`QuadrantBoard.tsx` 的 `dropAt`）。反复往同两张相邻卡之间插入约 50 次后，间距小于 double 精度，中点会等于某一端点，导致两条 `sort_order` 相等，排序退化为不稳定（`sortActive` 比较返回 0，落到原数组/id 顺序）。
  - 影响：单人本机使用几乎不可能触发；非阻断。
  - 来源：2026-06-22 Codex + Claude 子 Agent 双路评审一致标记为 Low，确认是既有设计问题、非当批改动引入，故单独立项而非塞进拖拽修复。
  - 建议修法：检测到中点等于任一端点（或间距小于阈值）时，对当前象限触发一次 `sort_order` 整列重排（rebalance / renumber），可前端重排后批量 PATCH，或后端提供轻量 renumber 接口。修时补一条针对性测试。
