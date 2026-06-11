---
name: handoff
description: |
  会话状态快照 + 下次 /catchup 恢复桥梁。/clear 前或结束开发时使用。
  默认完整模式写 6 段 session-notes；`/handoff quick` 精简模式只填 2 段（适合短时间中断）。
  触发关键词：生成交接文档、我要关闭了、记录进度、handoff、/clear 前
argument-hint: "[quick | 空=完整]"
allowed-tools: Read, Write, Edit, Bash, Glob, Grep
disable-model-invocation: true
---

<task>
会话中断前的状态快照：commit 未提交变更 + 勾 Roadmap checkbox + 写 session-notes。
**不碰 Spec frontmatter**（归 /done），**不绕 Hook**（--no-verify 要用户授权）。
</task>

<workflow>

## Step 0: 明确模式 + 收集状态

读取 `$ARGUMENTS`：
- `quick` → 精简模式（仅填 session-notes 的 2 段必填字段）
- 空 → 完整模式（填 6 段 + 关联指针）

收集会话状态供后续使用（不展示给用户，仅内部参考）：

```bash
date '+%Y-%m-%d %H:%M'
git branch --show-current
git log --oneline -10
git status --short
git diff --stat HEAD 2>/dev/null | tail -5
```

## Step 1: 处理未提交变更

### 1a. 工作区干净 → 跳过到 Step 2

### 1b. 有未提交变更

**已修改文件**（`git status --short` 里 ` M` 开头）：Claude 读取并自动 stage（排除 `.env`、`*.log`、`node_modules/`、构建产物）。

**新增文件**（`??` 开头，unstaged）：**MUST 用 AskUserQuestion multiSelect 询问**，避免误 stage 临时文件：

```
Question: 发现未跟踪的新增文件，选择要提交的（多选）：

multiSelect: true

Options:
1. src/components/LoginForm.tsx
2. src/hooks/useAuth.ts
3. test.md   ← 看起来是临时文件？
4. notes.txt ← 看起来是临时文件？
```

用户勾选后 stage。

### 1c. 生成 commit message

**简单改动**（≤3 文件，单一主题）→ Claude 直接生成 Conventional Commits message。

**复杂改动**（≥4 文件 / 跨模块 / 多个主题）→ **AskUserQuestion 询问**：

```
Question: 本次变更跨多个模块/主题，commit message 建议：

Options:
1. (Recommended) feat(auth): 实现 JWT 刷新机制
2. feat: 添加认证相关代码（auth + api + frontend）
3. 拆成多个 commit（Tidy First）
4. 自定义（自由输入）
```

选 3 → Claude 按 Tidy First 拆 commit（结构先、行为后，详见 /implement Step 5）。

### 1d. 执行 commit

```bash
git commit -m "<message>"
```

**失败处理**（Hook 拦下，exit code 2）→ **MUST 用 AskUserQuestion 询问**（不自动 --no-verify）：

```
Question: commit 被 Hook 拦下（测试/lint 未通过）。如何处理？

Options:
1. (Recommended) 返回编辑修复（取消本次 /handoff）
2. 只写 session-notes 记录未提交状态（不 commit）
3. 强制跳过 Hook（--no-verify，会留下未验证的 commit 在历史中）
4. 自定义
```

选 1 → 停止 /handoff，用户去修复。
选 2 → 跳过 commit，继续 Step 2-3（session-notes 里标注"工作区有未提交变更"）。
选 3 → 仅在用户明确选择时才 `--no-verify`，message 前缀 `wip:`。

## Step 2: Roadmap 更新（副业）

**只更新 checkbox，不碰 Spec frontmatter**（那是 /done 的主业）。

如果 `docs/roadmap/` 存在：
1. 读取 `docs/roadmap/README.md` 确定当前 Phase
2. 读取当前 Phase 文件
3. 根据本次会话已完成的工作，**仅**更新 checkbox：
   - 已完成：`- [ ]` → `- [x] ✅ YYYY/MM/DD`
   - 进行中：`- [ ]` → `- [-] 🏗️ YYYY/MM/DD`
4. 更新 README.md 进度统计（如 `2/5` → `3/5`）
5. 当前 Phase 全部完成 → 状态改为 `✅ 完成`

**MUST NOT**：
- 不添加新条目（新功能需用户明确要求）
- 不碰 `docs/specs/` 的 frontmatter（active_phase / status / Gate）

### Step 2b: Gate 满足但未 /done 检测

扫描 `docs/specs/` 中 `status: implementing` 的 spec：
- 检查当前 `active_phase` 的 Tasks 是否全勾 `[x]`
- Gate 条件是否全部满足

**检测到 Gate 已满足但 active_phase 未推进** → 提示（不阻塞）：

```
⚠️ 检测到 docs/specs/user-auth.md 的 Phase 2 Gate 已满足，但未推进到 Phase 3。
建议先执行 `/done <描述>` 再 /handoff，以正确推进 Spec 进度。

是否继续 /handoff？
```

AskUserQuestion：
```
Options:
1. 先跑 /done 再 handoff（推荐）
2. 继续 handoff（稍后手动跑 /done）
```

### Step 2c: 提交文档变更

```bash
git add docs/roadmap/
git commit -m "docs: 勾选 Phase N [条目名] 完成"
```

## Step 3: 写 session-notes.md

### 完整模式（默认）

写 6 段 + 关联指针到 `.claude/session-notes.md`：

```markdown
# 会话交接文档

**生成时间**: YYYY-MM-DD HH:MM
**分支**: [branch-name]
**模式**: 完整 / quick

## 🔗 关联指针（/catchup 可快速定位）
- Spec: docs/specs/user-auth.md (Phase 2, status: implementing)
- Roadmap: phase-2.md - "用户认证模块" (3/5)
- 最近 commits:
  - abc1234 feat(auth): 实现 JWT 刷新端点
  - def5678 feat(web): 集成 axios 拦截器
  - ...（最多 5 个）

## 📝 本次会话做了什么（叙事摘要）
[一段话概括，让 /catchup 无需读 5 个 commit message 推理]
今天完成了 JWT 刷新 Token 机制：实现了 /auth/refresh 端点
（apps/api/auth/refresh.py）、集成了前端 axios 拦截器
（apps/web/src/lib/api.ts）、补了集成测试（tests/auth/...）。

## 🎯 下一步具体动作（MUST 有，供 /catchup 弹窗候选）
- 优先级 1：实现 refreshToken revoke 机制（apps/api/auth/revoke.py）
- 优先级 2：前端 401 自动刷新拦截器（apps/web/src/lib/api.ts:L120）
- 优先级 3：...

## 🧠 关键决策（git log 不写的软信息）
- 选 refresh token 方案而非 session — 支持移动端
- Token 有效期 7 天，refresh 30 天 — 平衡安全与体验

## 🕳️ 踩过的坑（避免重犯）
- 中间件顺序要在路由之前注册，否则不生效
- CORS 要加 X-Refresh-Token 响应头，前端才能读到

## ⚠️ 注意事项 / 临时 TODO
- refresh token revoke 还没实现（非本 Spec 范围）
- 可能需要前端 401 自动刷新拦截器
```

### 精简模式（`quick`）

只填 2 段必填：

```markdown
# 会话交接文档（quick）

**生成时间**: YYYY-MM-DD HH:MM
**分支**: [branch-name]
**模式**: quick

## 🔗 关联指针
- [spec/roadmap 如有，Claude 自动填]
- 最近 commits: [最多 3 个]

## 📝 本次会话做了什么
[一句话]

## 🎯 下一步具体动作
- [1-3 条]

---
*其他字段（决策/坑/注意事项）quick 模式不强制，如有就写*
```

## Step 4: 输出确认

```
✅ 交接完成（模式：完整 / quick）

━━━━━━━━━━━━━━━━━━━━━━━━
提交状态：
  ✅ 正常 commit: feat(auth): ...
  / ⚠️ 只记录未提交状态（Hook 拦下，用户选择不 --no-verify）
  / 🏷️ WIP commit（--no-verify，用户明确授权）
  / ⏭️ 无变更

Roadmap：
  ✅ 勾选 Phase N "[条目]" / ⏭️ 无关联

Spec Gate 检测：
  ⚠️ 检测到 Gate 满足但未 /done，建议跑 /done 再关闭
  / ✅ 无待推进的 Spec

交接文档：
  .claude/session-notes.md (6 段 / 2 段 quick)
━━━━━━━━━━━━━━━━━━━━━━━━

下次会话运行 /catchup 可快速恢复上下文。
```

</workflow>
