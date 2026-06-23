---
name: loop-engineering
description: |
  目标驱动的有限 Agent 循环工作流。用于用户想把一次性 prompt 升级为可持续推进、可验证、可暂停恢复的 Coding Agent loop：定义目标、预算、停止条件、验证 Gate，必要时使用 subagents/并行审查，持续执行直到达成目标或遇到阻塞。
  触发关键词：Loop Engineering、loop、goal loop、自动迭代、循环推进、持续修复、多 Agent 协作、until done
argument-hint: "[目标描述] [可选: --budget N | --readonly | --plan | --execute]"
allowed-tools: Read, Glob, Grep, Bash
disallowed-tools: Write, Edit
disable-model-invocation: true
---

<task>
把用户的目标转成一个有边界的 Agent 工作循环：先定义 Loop Contract，再按 Observe → Decide → Act → Verify → Reflect 迭代。普通步骤自动推进；重大决策、阻塞、预算耗尽、外部副作用或人工 Gate 必须停下来问用户。
</task>

<workflow>

## Step 0: 解析目标和模式

### 先判断：这真的需要 loop 吗？（前置闸门）

开 loop 前先排除"不该用 loop"的情况，避免 over-engineering：

- **任务稳定、可重复、规则明确** → 用脚本 / cron / 查询 / lint 规则 / 模板，不要套 LLM loop（社区称 "distill and demote"：把可预测行为下沉为确定性代码，减少 LLM 调用）。
- **只是简单的"跑到完成"或"周期触发"** → Claude Code 内置 `/goal`（设完成条件后持续推进直到满足）或 `/loop`（定时 / 自定步调重复）可能就够了。本 Skill 用在你需要**显式 Loop Contract + 验证 Gate + maker/checker 纪律**的场景，**不替代**这两个内置命令。
- **一次性问答 / 单点小改** → 直接回答或 `/implement`，不必开 loop。

确认确实需要有边界的工程化循环，再继续解析：

读取 `$ARGUMENTS`，提取：

- **目标**：本轮要达成什么
- **模式**：`--readonly` / `--plan` / `--execute`
- **预算**：`--budget N`，默认最多 3 轮
- **范围**：允许读/改的文件、模块、文档
- **验收线索**：测试命令、文档一致性检查、人工验证条件

模式推断：

| 信号 | 模式 | 行为 |
|------|------|------|
| "研究 / 看看 / 评估 / 是否适合" | `readonly` | 只读调研，输出结论和 loop 设计 |
| "沉淀 / 设计 / 写方案 / spec" | `plan` | 写 Loop Contract 和实施阶段，不执行 |
| "开始 / 自动推进 / 直到完成" | `execute` | 在明确 scope 和 Gate 内循环推进 |
| "每天 / 每周 / 定期 / 监控" | `maintenance` | 只读巡检；创建后台任务或写入前必须确认 |

如果目标、范围或验收标准不清，必须先问用户，不进入循环。

## Step 1: 快速扫描上下文

先读取项目约束（优先 `CLAUDE.md`）和当前状态，避免在错误上下文中开 loop：

```bash
git status --short
git log --oneline -5
find docs/specs -maxdepth 1 -name "*.md" 2>/dev/null
```

若是 guides 文档项目，额外检查：

```bash
find .claude/skills -maxdepth 2 -name "SKILL.md" | sort
rg -n "^### 2\\.[0-9]+ /|Skills 总数|\\.claude/skills" 03-Skills命令配置.md README.md prompt-*.md
```

## Step 2: 生成 Loop Contract

执行前必须输出并遵守以下契约：

```markdown
## Loop Contract

**Goal**: [本轮目标]
**Scope**: [允许读/改的范围]
**Non-goals**: [明确不做的事]
**Mode**: readonly / plan / execute / maintenance
**Budget**: 最多 [N] 轮；最多 [M] 次自动返工；上下文超过 [X%] 停止或 handoff
**Done condition**:
- [可验证完成条件 1]
- [可验证完成条件 2]
**Stop condition**:
- Gate 全部通过
- 用户要求暂停/停止
- 达到预算上限
- 连续 N 轮无新证据或无进展
- 连续 2 轮陷入同一状态/局部最优（circuit-breaker）：停下换更大胆的改动方向或问用户，别靠重复小修蒙混
**Block condition**:
- 缺少权限/凭证/环境
- 目标或范围不清
- 修改面扩大到未批准范围
- Gate 失败且自动修复次数用完
**Verification gate**:
- [command: 可执行命令]
- [auto: 可观察事实]
- [manual: 需要用户验证的条件]
**Human confirmation points**:
- [必须停下来问用户的节点]
```

默认预算：

- 最多 3 个 iteration
- 最多 1 次自动返工
- 上下文超过 60%-70% 时停止并建议 `/handoff`
- 不默认开启 subagent；仅在高风险或大搜索空间时使用

## Step 3: 选择执行路径

| 判断 | 动作 |
|------|------|
| 涉及新增 Skill / Hook / frontmatter / 版本号 / 跨 00-04 多文档 | 升级 `/spec` 或先写 `docs/specs/` 设计文档 |
| 单点小改动，scope 清楚 | 降解为 `/implement <描述>` |
| 已完成一轮修改，需要全局一致性 | 交给 `/done <描述>` |
| 预算/上下文不足但还没完成 | 执行或建议 `/handoff` |
| 恢复上一轮 loop | 先 `/catchup` |
| 只读调研 | 输出研究结论和 loop 设计，不写文件 |

Loop Engineering 只负责编排循环，不复制 `/spec`、`/implement`、`/done` 的职责。

## Step 4: 迭代执行

每轮只推进一个最小交付单元：

1. **Observe**：读取当前状态和证据
2. **Decide**：选择一个最小下一步，并说明为什么
3. **Act**：在批准 scope 内执行
4. **Verify**：运行本轮 Gate
5. **Reflect**：记录通过/失败/下一轮计划

> 这套 Observe → Decide → Act → Verify → Reflect 是社区 "Plan-Act-Observe" 循环的超集（多了显式 Verify Gate 和 Reflect 复盘）。
> **停滞处理**：若 Verify 连续两轮结果相同或只在小范围抖动，判定为局部最优——MUST 停下，要么换**幅度更大**的改动方向，要么停下问用户，不要靠重复小调试图蒙混。

进入下一轮前必须检查：

- 是否达到 Done condition
- 是否触发 Stop condition
- 是否触发 Block condition
- 是否触发 Human confirmation point
- 是否仍在预算内

## Step 5: 自动推进与人工停顿边界

### SHOULD 自动执行

- 读取项目文档、spec、roadmap、session-notes、git 状态
- `rg` / `grep` / `find` / `git status` / `git diff` / `git log` 等只读检查
- 生成 Loop Contract
- 拆分 iteration
- 执行只读验证
- 低风险失败后最多自动返工 1 次
- 在 scope 内继续下一轮普通执行

### MUST 停下来问用户

- 目标、范围、验收标准不清
- 要新增 Skill、改 frontmatter、改 Hook、改权限策略
- 涉及 guides 版本号 bump、README 版本记录、Skills 总数、prompt 模板同步
- 要修改多个 00-04 文档或大段结构
- 要创建后台 routine / automation / cron / schedule
- 要联网、安装依赖、调用外部服务、访问生产系统、写入数据库
- 要 push、发布、部署、删除文件、迁移数据
- Gate 需要人工视觉/业务验证
- 连续失败或预算即将耗尽
- 当前发现与用户原始目标冲突，需要改变方向

## Step 6: 独立审查

**完成判定（Done）MUST 独立**：判断"是否达成目标"的依据是 Verification Gate（command / auto）或独立 reviewer agent，MUST NOT 由推进 loop 的同一上下文自评"我觉得做完了"（社区共识：写代码的模型给自己打分太宽容）。

以下情况 SHOULD 使用 subagent 或独立 review：

- 改动跨多个模块或多个文档源头
- 实现者容易自我确认完成
- 验证面包括安全、并发、权限、数据一致性、长期维护性
- 搜索空间很大，主 Agent 串行探索成本高

规则：

- 任务必须具体、自包含
- 不把预期答案泄露给 reviewer
- 实现 agent 与 review agent 职责分离
- 不默认每轮都开 subagent，避免成本失控

## Step 7: 停止与输出

停止时输出：

```markdown
## Loop Result

**Status**: done / blocked / stopped / handoff-needed
**Iterations**: [实际轮数] / [预算]
**Evidence**:
- [证据 1]
- [证据 2]
**Files changed**:
- [文件，如有]
**Verification run**:
- [命令或检查结果]
**Remaining risks**:
- [风险，如有]
**Recommended next command**:
- [/done / /handoff / /catchup / /spec / 无]
```

</workflow>

<notes>

## 自治分级（L1 → L3）

按风险逐级放权，不要一上来就无人值守：

- **L1 仅报告**：只读分析，输出结论 / 建议，不改任何东西（默认 `readonly`）。
- **L2 协助修复**：在明确 scope + Gate 内推进，每个写入走 `/implement`，关键节点人工确认（`execute` 但保留人工 Gate）。
- **L3 无人值守**：仅当 Gate 完全确定性、回滚成本低、用户显式授权时才考虑；本 Skill 第一版**不鼓励**直接跳到 L3。

## 与 /diagnose D11 联动（distill and demote）

loop 多轮后若发现**反复犯同一类错 / 反复手工修同一种问题**，SHOULD 把它下沉为确定性规则（ESLint / `.claude/rules/` / 脚本 / Hook），对应 `/diagnose` D11 一致性维度"重复犯错升级为 lint 规则"的理念——让下次不再需要 loop。

## 失败反例

- "一直做直到完成"但没有预算和停止条件
- 实现 Agent 自己宣布完成，没有 Gate
- 默认允许写文件，后台循环直接改仓库
- 自动创建 routine/cron，但用户只是要一次性研究
- 复制 `/done` 逻辑，形成第二套收尾体系
- 绕过 `/spec` 直接新增 Skill 或跨文档同步
- 每轮都开 subagent，token 成本和合并成本失控
- 该用脚本 / cron 的稳定任务硬套 LLM loop（应 distill and demote）
- 和内置 `/goal` / `/loop` 职责重叠，重复造轮子
- 卡在局部最优靠重复小修蒙混，不触发 circuit-breaker
- "loopmaxxing"：以为多跑几轮 / 多烧 token 就能解决，实则放大坏 rubric
- comprehension debt：代码产出速度超过人能理解的速度，无人真正 review

</notes>
