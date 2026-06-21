# 项目路线图

## 当前阶段：Phase 4

| Phase | 状态 | 进度 |
|-------|------|------|
| Phase 1 — 基础任务面板 | ✅ 完成 | 5/5 |
| Phase 2 — 日常可用增强 | ✅ 完成 | 6/6 |
| Phase 3 — 规划与回顾能力 | ✅ 完成 | 8/8 |
| Phase 4 — 稳定性与维护 | 🏗️ 进行中 | 2/8 |

## 阶段说明

- Phase 1 和 Phase 2 已由现有代码完成，保留为项目历史基线。
- Phase 3 聚焦规划、回顾、检索、备份和文档事实同步。
- Phase 4 聚焦测试、迁移、数据维护和交互回归清单。

## 当前事实

- 任务不属于某一天；每日面板由 `created_date <= D` 且 `(completed_date 为空 或 >= D)` 查询得到。
- 当前四象限主模型是 `important + due_date`，旧 `urgency / importance` 只作为数据库兼容列保留，新代码 MUST NOT 读写旧打分字段。
- 有期限象限排序 MUST 先按 `due_date` 近远，同一天内再按状态和 `sort_order`;无期限象限先按状态再按 `sort_order`。
- 状态为 `todo / doing / review / verify / done`；只有 `done` 写入 `completed_date`。UI 用 `当前 / 待 Review / 归档` 三段视图切换,`verify` 留在当前视图。
- AI 拆任务只产草稿，不直接入库；保存仍走普通任务创建接口。
