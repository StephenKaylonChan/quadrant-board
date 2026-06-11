---
name: implement
description: |
  有纪律地实施一个单个代码改动（业务小需求、Bug 修复、功能微调、技术改进）。
  不需要 Spec 但需保证与现有代码一致、不引入面条代码。
  支持批量模式：`/implement` 无参数时进入批量模式，每个改动独立走完整流程。
  触发关键词：实施、加个功能、改一下、修复、小需求、快速修复
argument-hint: "<改动描述> 或留空进入批量模式"
allowed-tools: Read, Write, Edit, Bash, Glob, Grep
disable-model-invocation: true
---

<task>
有纪律地实施一个代码改动——MUST 先扫描现有模式再动手，MUST 在 commit 前做架构边界自检，避免面条代码累积。
</task>

<workflow>

## Step 0: 接收任务

**单任务模式**（有参数）：`/implement 列表页加排序功能` → 进入 Step 1

**批量模式**（无参数）：
- 询问用户要处理哪些改动
- 用户列出编号清单
- **每个改动独立走完整 Step 1-7 流程**（批量 ≠ 简化）

## Step 1: 复杂度评估（硬阈值）

**任一触发 → 建议升级到 /spec 或 Plan Mode**：

| 硬阈值 | 为什么 |
|--------|--------|
| 涉及 ≥3 文件（无法用一句话描述 diff） | 需要先规划影响面 |
| 跨模块/跨层 import（如 controller 直接调 repo） | 触碰架构边界 |
| 新增第三方依赖 | 决策影响长期维护 |
| 改变数据流向（API 形状、state 形状、DB schema） | 影响其他模块 |
| 需要多轮讨论才能明确需求 | 应该先 /spec |

触发时输出：
> 这个改动涉及 [具体触发项]，建议用 `/spec` 先讨论设计再实施。要继续还是切换？

用户坚持继续 → 尊重判断，继续执行。

## Step 2: 模式扫描（MUST，Code 前）

**核心原则**：在写任何新代码之前，MUST 确认"项目里是否已有同类实现"。防止 5 个 sort 实现、3 种命名风格的面条代码累积。

### 扫描步骤

1. **识别动词/名词关键词**：从改动描述提取（sort / filter / format / validate / parse / fetch...）
2. **用 rg 搜索现有实现**：
   ```bash
   rg -i "sort|orderBy|order_by" --type ts
   rg "format.*date|dateFormat" --type ts
   ```
3. **列出所有匹配位置**（给用户看一眼，透明决策）
4. **判断**：
   - **找到相似实现** → MUST 说明"为什么不复用"或"怎么复用"——不能装作没看见
   - **未找到** → 明确记录"项目无同类实现，新增为 X"
   - **发现 3+ 种风格并存** → 提醒"这里已有风格分裂，本次改动要统一到哪种？"

### 架构敏感区识别

扫描中同步检查：
- 新增的代码属于哪一层（router/service/repo/util/component）？放对了吗？
- 是否与项目现有的目录/命名约定一致？
- 是否触碰了 `.claude/rules/` 中声明的红线？

## Step 3: 按复杂度执行

| 复杂度 | 流程 |
|--------|------|
| **简单**（1-2 文件） | Code → Verify → Commit |
| **中等**（3-5 文件，已通过 Step 1 阈值） | Explore → Code → Verify → Simplify（建议）→ Commit |
| **Bug 修复** | Explore（复现+定位）→ Code（先写**集成测试**重现 Bug → 修复 → 测试变绿）→ Verify → Commit |

遵循项目 CLAUDE.md 的完成标准和 `.claude/rules/` 的编码红线。

> **Bug 修复的集成测试要求**：MUST 从用户视角重现问题（详见文档 04 Section 1 Testing Trophy）。只测内部函数通过但用户仍然报 Bug —— 这是典型的"测试类型错了"。

## Step 4: Verify（验证）

- 运行相关测试，全部通过
- 运行 lint / 类型检查
- 检查边界条件（空值、异常输入、权限不足）
- 回归验证（确认不影响现有功能）
- 项目无测试 → 跳过测试，但 lint 和类型检查仍 MUST 执行

## Step 5: Commit 前自检（MUST，防面条关键关卡）

### Kent Beck 三红灯（任一触发 → 暂停，向用户汇报）

- 我是否写了循环/重试逻辑**来掩盖失败**（而非处理真实错误）？
- 我是否加了**用户没要求的功能**（顺手优化、未经确认的扩展）？
- 我是否**禁用或删除了任何测试**（包括 `.skip` / `.only` / xdescribe）？

**为什么重要**：Kent Beck 在 [Augmented Coding](https://tidyfirst.substack.com/p/augmented-coding-beyond-the-vibes) 中明确观察到 AI 会在阻力前"自作主张"——这三个信号是 AI 偷懒的典型标志。

### Tidy First 分 commit（显式卡顺序）

检查本次 diff 是否**同时**包含：
- **结构变动**（提取函数、重命名、拆分文件、移动代码）
- **行为变动**（新功能、修复、逻辑改变）

**任一同时存在 → MUST 拆成两个 commit**：

1. 先提交结构变动（纯重构，行为不变）：`refactor: 提取 xxx 到 utils/`
2. 再提交行为变动：`feat: ...` / `fix: ...`

> **为什么**：Beck 观察到"AI 不会自觉 safe-sequencing"。结构和行为混在一起的 commit 后续难以 review、难以回滚，是架构腐化的主要路径。

## Step 6: Commit

- 使用 Conventional Commits（`feat:` / `fix:` / `refactor:` / `chore:` / `perf:` / `test:`）
- message 包含足够上下文（改了什么、为什么）
- 若本次改动和已有 Roadmap 条目关联 → 在输出末尾提示"如需更新 Roadmap，执行 `/done <描述>`"

## Step 7: ADR 触发检查（条件触发弹窗）

**四类触发条件**（任一满足）：
- 新增跨模块依赖
- 替换已有实现（如旧 dateUtil → 新 dateFormatter）
- 引入新第三方库
- 改变数据流向（API / state / DB schema）

满足任一 → 调用 AskUserQuestion 弹窗：

```
Question: 本次改动涉及 [具体决策，如"新增 date-fns 依赖替换 moment"]，
          是否记录为 ADR？

Header: "ADR 决策"

Options:
1. (Recommended) 生成 ADR 草稿
   description: Claude 生成含 Context/Decision/Alternatives/Consequences 的草稿到 docs/architecture/adr/
2. 跳过
   description: 本次不记录
```

**不触发就不问**——避免疲劳。

> 为什么用 AskUserQuestion 而非对话询问：频率低（月均 2-5 次）+ 一键选择 + 沉淀率高。散文标记 90% 会被忽略。

## Step 8: /docs 联动提示

改动涉及架构敏感区（新增模块 / 改路由组织 / 新增跨层依赖 / 改变数据流） → 在输出末尾提示：
> 本次改动涉及架构敏感区，建议执行 `/docs architecture` 刷新架构文档。

不自动执行（避免打断），由用户决定时机。

## 批量模式处理

| 情况 | 动作 |
|------|------|
| 单个改动测试失败 | **停止批量**，汇报失败原因 + 已完成数，等用户决定 |
| 用户说"暂停"/"停一下" | 立即报告当前进度，等待指令 |
| 上下文 > 60% | 提醒剩余改动数，建议 /handoff 后分批处理 |
| ADR 弹窗 | 每次独立询问（不累积批量问） |

**批量 ≠ 简化**：每个改动都走完整 Step 1-8，包括模式扫描和 Commit 前自检。

## 输出格式

**单任务完成**：
```
✓ [hash] fix(list): 修复日期格式显示不正确
  改动: src/utils/date.ts, src/components/List.tsx
  模式扫描: 已复用现有 formatDate（src/utils/date.ts:15）
  [可选] ⚠️ 涉及架构敏感区，建议 /docs architecture 刷新
```

**批量完成汇总**：
```
✅ 完成 3/4 个改动：
1. ✓ [hash] feat(list): 添加列表排序功能
2. ✓ [hash] fix(date): 修复日期格式显示
3. ✓ [hash] chore: 默认分页数从 10 改为 20（Tidy First 拆为 refactor + chore 两个 commit）
4. ⏭️ 跳过 — 涉及 4 文件 + 跨模块依赖，建议 /spec
```

</workflow>
