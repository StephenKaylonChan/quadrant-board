---
name: release
description: |
  Phase 里程碑工作流（内部里程碑 + 可选对外发版）。
  默认模式：全量 /docs + ADR 检查 + Roadmap 状态 + 内部 Changelog。
  --publish 模式：加版本号 bump + git tag + 对外 Changelog。
  触发关键词：release、发版、Phase 完成、阶段完成、里程碑
argument-hint: "[--publish | 空=默认模式]"
allowed-tools: Read, Write, Edit, Bash, Glob, Grep, Agent
disable-model-invocation: true
---

<task>
Phase 里程碑工作流。
- 默认模式（A）：Phase 内部里程碑（文档 + ADR + Roadmap + 内部 Changelog）
- --publish 模式（A+B）：A + 对外发版（版本号 + tag + 对外 Changelog）

MUST 原则：
1. Phase 必须全部完成（checkbox 全勾）才能跑 /release
2. 不自动 push（push 必须用户明确要求）
3. 精确 git add（不用 `git add docs/` 宽泛 stage）
4. ADR/版本号/push 都用 AskUserQuestion 询问
</task>

<workflow>

## Step 0: 模式判断 + Phase 完成检查

解析 `$ARGUMENTS`：
- 无参数 → **模式 A**（Phase 内部里程碑）
- `--publish` → **模式 A+B**（加对外发版）

确认 Phase 范围：

```bash
cat docs/roadmap/README.md
ls docs/roadmap/
```

读取当前 Phase 文件，确认所有功能 checkbox 已勾选。

**有未完成条目 → AskUserQuestion**：
```
Question: 当前 Phase 还有 [N] 个未完成条目：
- [条目 A]
- [条目 B]

Options:
1. 停止 /release（先完成这些条目）
2. 忽略并继续（Phase 可能不完整）
3. 从 Phase 中移除这些条目（改为"不做"）
```

## Step 1: 全量文档守护（对接 v3.25 /docs）

执行 `/docs`（**无参数**，全量守护四种操作）：
- 更新（文档描述和代码不一致）
- 新增（代码有了但文档没有）
- 删除（文档还在但代码没了）
- 审计一致性（spec-code、ADR 有效性、Gate 可执行性）

详细流程见文档 03 Section 2.7 /docs（8 步）。

## Step 1b（推荐）: 深度 spec/ADR 审计

执行 `/docs audit` 专注深度审计：
- spec 描述 vs 代码实现一致性
- ADR 决策是否仍生效
- Gate `[command]` 可执行性

Phase 完成是跑深度审计的**最佳时机**——之后再跑要等下一个 Phase。

**AskUserQuestion 询问**：
```
Question: Phase 完成是深度文档审计的好时机。现在跑 /docs audit？

Options:
1. (Recommended) 现在跑（5-10 分钟，确保 spec/ADR 和代码对齐）
2. 跳过（之前刚跑过 / 本 Phase 没动 spec 和 ADR）
```

## Step 2: 收集 Phase 期间变更（为 Changelog 和 ADR 检查准备）

**确定 Phase 开始日期**（三种 fallback）：

```bash
# 1. 优先读 Phase 文件 frontmatter 的 created / started 字段
PHASE_START=$(grep -E "^(created|started):" docs/roadmap/phase-N-*.md | head -1 | cut -d' ' -f2)

# 2. 如无，用上次 /release commit 时间
if [ -z "$PHASE_START" ]; then
  PHASE_START=$(git log --oneline --all --grep="release:" | head -1 | awk '{print $1}' | xargs -I {} git show -s --format=%ci {} 2>/dev/null)
fi

# 3. 如无，用第一个 commit 时间（首个 Phase）
if [ -z "$PHASE_START" ]; then
  PHASE_START=$(git log --reverse --pretty=format:"%ci" | head -1)
fi
```

收集 Phase 期间的所有功能性提交：

```bash
git log --oneline --no-merges --since="$PHASE_START" \
  | grep -E "^[a-f0-9]+ (feat|fix|perf|refactor|chore)"
```

## Step 3: ADR 检查（AskUserQuestion + 四类触发）

扫描 Phase 期间 commit message，按 **v3.19 /implement 四类触发条件**识别可能需要 ADR 的决策：

| 触发条件 | 识别模式 |
|---------|---------|
| 新增跨模块依赖 | `refactor:` 跨模块重构 / commit 涉及跨多个顶层目录 |
| 替换已有实现 | `refactor:` 含 "替换" / "迁移" / "rewrite" / "rework" |
| 引入新第三方库 | `feat:` 或 `chore:` 涉及 package.json / pyproject.toml 新增依赖 |
| 改变数据流向 | `feat:`/`refactor:` 改 API 形状 / state 形状 / DB schema |

**检测到候选 → AskUserQuestion**：
```
Question: Phase 期间检测到 [N] 项可能需要记 ADR 的决策：
1. [commit hash] 引入 date-fns 替换 moment（模式：替换已有实现 + 新依赖）
2. [commit hash] 订单 status state 重构为状态机（模式：改变数据流向）

Options:
1. 全部生成 ADR 草稿（我 review 后提交）
2. 只为部分生成（自由输入编号）
3. 跳过（本 Phase 无需记录）
```

选 1/2 → Claude 按 ADR 模板在 `docs/architecture/adr/NNNN-<名称>.md` 生成草稿（含 Context/Decision/Alternatives/Consequences）。

## Step 4: 生成内部 Changelog

更新 `docs/development/changelog.md`（如不存在则新建），按 [Keep a Changelog](https://keepachangelog.com/) 格式：

```markdown
## [Phase N - Phase 名称] - YYYY-MM-DD

### Added
- [feat 类型的提交，一句话描述]

### Fixed
- [fix 类型的提交]

### Changed
- [refactor/perf 类型的提交]

### Removed
- [删除的功能]
```

这是**内部 Changelog**（项目团队可见）。模式 B 会额外生成**对外 Changelog**（Step 6）。

## Step 5: 更新 Roadmap Phase 状态

- 当前 Phase 文件：`status: completed`，添加完成日期
- `docs/roadmap/README.md`：Phase 状态改为 `✅ 完成`
- 进度统计更新

## Step 6: 模式 B（--publish）额外步骤

**仅 `--publish` 模式执行**；默认模式跳过到 Step 7。

### 6a. 版本号升级

检测项目版本文件（`package.json` / `pyproject.toml` / `Cargo.toml`），读当前版本。

**AskUserQuestion**：
```
Question: 当前版本 X.Y.Z。本次发版如何升级？

Options:
1. patch (X.Y.Z+1) — 仅 bug 修复
2. minor (X.Y+1.0) — 新增功能但向后兼容 ⭐ Phase 通常选这个
3. major (X+1.0.0) — 有破坏性变更
4. 自定义版本号（自由输入）
5. 跳过版本号升级（只打 tag）
```

更新版本号到项目配置文件。

### 6b. 生成对外 Changelog

**对外 Changelog**（用户可见，不同于内部的）：
- 提炼 Step 4 内部 Changelog 的**用户可见变化**
- 隐藏内部重构/测试/工具类改动
- 加迁移指南（如有破坏性变更）

写入 `CHANGELOG.md`（根目录，和内部的 `docs/development/changelog.md` 分开）。

### 6c. git tag

**AskUserQuestion**：
```
Question: 生成 git tag vX.Y.Z？

Options:
1. (Recommended) 生成 annotated tag（含 tag message）
2. 生成 lightweight tag
3. 跳过（仅升版本号不打 tag）
```

```bash
git tag -a v$VERSION -m "Release $VERSION - Phase N [Phase 名称]"
```

## Step 7: 精确 git add + commit

精确 add（**不用** `git add docs/` 宽泛 stage）：

```bash
git add docs/architecture/ docs/development/ docs/roadmap/ docs/architecture/adr/ docs/reports/

# 模式 B 还要加
# git add package.json pyproject.toml CHANGELOG.md
```

**动态 commit message**：
- 模式 A：`docs: Phase N [Phase 名称] 里程碑 — 文档刷新 + ADR [M] 条 + Roadmap`
- 模式 B：`release: v[版本号] — Phase N [Phase 名称] 对外发版`

## Step 8: AskUserQuestion 引导下一步

**MUST 用弹窗**（不散文建议）：

```
Question: Phase N 里程碑完成！下一步？

Options:
1. git push（推送所有 commit / 模式 B 含 --tags）
2. /diagnose（Phase N+1 前架构量化评估，定期体检推荐）
3. 开始规划 Phase N+1（读取或创建 phase-N+1-*.md）
4. 其他（自由输入）
```

选 1 → 询问是否 `git push` / `git push --tags`（模式 B 时）。**MUST NOT 自动 push**。

## Step 9: 输出确认

```
🎉 Phase N [Phase 名称] 里程碑完成（模式：[默认 / --publish]）

━━━━━━━━━━━━━━━━━━━━━━━━
文档刷新：✅ /docs 全量 / ✅ /docs audit（用户选了 / 跳过）
ADR：✅ 新增 [N] 条 / ⏭️ 无需新增
Roadmap：✅ Phase N 标记为完成
内部 Changelog：✅ 新增 [版本号] 条目

[模式 B 额外]
版本号：[X.Y.Z → A.B.C] / 跳过
git tag：[v版本号] / 跳过
对外 Changelog：[用户可见变更 M 条]

━━━━━━━━━━━━━━━━━━━━━━━━

push 状态：✅ 已 push / ⏭️ 用户选择稍后
下一步：[按 Step 8 选择输出]
```

</workflow>
