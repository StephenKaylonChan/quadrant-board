---
name: catchup
description: |
  工作上下文重建 + 下一步指引。在 /clear 之后或新会话开始时使用。
  只读 @ 不会自动加载的文件（session-notes、implementing spec、最近源文件），
  支持参数聚焦（如 `/catchup auth` 聚焦 auth 相关），最后用 AskUserQuestion 引导下一步。
  触发关键词：恢复上下文、catchup、接着做、继续昨天、/clear 后
argument-hint: "[可选：关键词如 auth / 功能名 / 或'昨天做到哪了'这类描述]"
allowed-tools: Read, Bash, Glob, Grep
disable-model-invocation: true
---

<task>
重建工作上下文：读 @ 不会自动加载的关键文件 + 按参数聚焦 + 输出恢复摘要 + AskUserQuestion 引导下一步。
**不重复读 CLAUDE.md 已 @ 加载的文件**（roadmap、architecture 等），只读补充的（session-notes、implementing spec、最近源文件）。
</task>

<workflow>

## Step 0: 明确模式

读取 `$ARGUMENTS` 判断：

| $ARGUMENTS | 模式 | 行为 |
|-----------|------|------|
| 空 | **通用恢复** | 读全部关键补充文件 |
| 关键词（如 `auth`、`dashboard`） | **聚焦模式** | 只读与关键词相关的 spec / commit / 文件 |
| 描述（如 `昨天做到哪了`） | **概览模式** | 重点读 session-notes，简要输出 |

## Step 1: 快速扫描当前状态

```bash
echo "=== 当前状态 $(date '+%Y-%m-%d %H:%M') ==="
git log --oneline -5

echo "--- 修改的文件 ---"
git status --short

echo "--- 未推送 commit ---"
if git rev-parse --abbrev-ref @{u} >/dev/null 2>&1; then
  UNPUSHED=$(git log --oneline @{u}.. 2>/dev/null | wc -l | tr -d ' ')
  [ "$UNPUSHED" -gt 0 ] && echo "⚠️ 有 $UNPUSHED 个未推送 commit"
fi
```

> **注意**：SessionStart Hook 可能已经跑过类似命令并输出到会话。/catchup 的重点是**恢复更深的上下文**（session-notes、spec 状态），不是重复跑 git 状态。

## Step 2: 读取 @ 不会自动加载的文件（去重）

**MUST 只读以下补充文件**——CLAUDE.md 里通过 `@` 引用的文件（如 `@docs/roadmap/README.md`、`@docs/architecture/README.md`、当前 Phase 文件）会话启动时已自动加载，**不重复读**。

### 通用恢复（无参数）

按优先级读取：

1. **`.claude/session-notes.md`**（MUST，如存在）—— /handoff 写的交接文档，最高价值
2. **`docs/specs/` 中 `status: implementing` 或 `status: approved` 的 spec**
   ```bash
   grep -rl "status: implementing\|status: approved" docs/specs/ 2>/dev/null
   ```
3. **最近修改的源文件列表**（不读内容，只列名）
   ```bash
   git diff HEAD~3..HEAD --name-only | head -10
   ```

### 聚焦模式（有关键词参数）

```bash
KEYWORD="$ARGUMENTS"

# 1. 匹配 spec
find docs/specs -name "*${KEYWORD}*.md" 2>/dev/null

# 2. 最近涉及该关键词的 commit
git log --oneline --grep="${KEYWORD}" -10
git log --oneline -10 -- "*${KEYWORD}*"

# 3. 相关源文件
find . -name "*${KEYWORD}*" -type f -not -path '*/node_modules/*' -not -path '*/.git/*' 2>/dev/null | head -20
```

只读匹配到的 spec + session-notes（如有），不读其他。

### 概览模式（描述性参数）

- 重点读 `.claude/session-notes.md`
- 输出简要摘要（见 Step 3 的"概览输出"）
- 不读 spec 内容（只列文件名）

## Step 3: 输出恢复摘要

### 通用 / 聚焦模式输出

```
✅ 上下文已重建（[通用 / 聚焦: KEYWORD]）

## 项目状态
**当前 Phase**：Phase N [名称] ([M/K])
**本次变更**：[git status --short 概要]
**未推送**：[X 个 commit / 无]

## 最近工作（git log）
- [hash] [message]
- ...

## 交接笔记（session-notes.md）
[session-notes 里"下次继续"部分的要点，如无则写"无"]

## 设计文档状态
[列出 implementing/approved 的 spec：文件名 + status + active_phase]

## 修改中的文件
[git status --short 输出]
```

### 概览模式输出（参数为描述）

```
📋 会话接续摘要

**上次做到**：[session-notes 摘要]
**未完成**：[session-notes 里的"遗留"部分]
**上次决策**：[key decisions]

---
准备继续。
```

## Step 4: AskUserQuestion 引导下一步

**MUST 用弹窗**（不散文询问），根据 Step 2-3 收集的信息列 3-4 个具体候选：

**候选生成规则**：
1. 如 session-notes 有"下次继续"项 → 候选 1 = 继续该项
2. 如有 `status: implementing` 的 spec → 候选 2 = 继续该 spec 的 active_phase
3. 当前 Phase 有未完成条目 → 候选 3 = 从 Phase 待办里选（列 3 个具体条目）
4. 总有一个 "其他（自由输入）" 兜底

**弹窗示例**：

```
Question: 上下文已重建，下一步做什么？

Header: "下一步"

Options:
1. (Recommended) 继续 /implement auth 功能（session-notes 遗留）
2. 开始 Spec user-profile Phase 2（status: implementing, active_phase: 2）
3. 从 Phase 3 待办里选（3 个条目：支付集成 / 通知系统 / 数据导出）
4. 其他（自由输入）
```

选 1/2/3 → Claude 直接开始；选 "其他" → 用户输入。

**例外**：概览模式（描述性参数）输出摘要即可，**不弹窗**（用户只是想了解现状，不一定要立即开始新任务）。

</workflow>
