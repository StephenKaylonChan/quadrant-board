---
name: done
description: |
  功能交付检查清单。commit 后逐项验证交付完整性（测试覆盖、Roadmap、Spec、文档、simplify）。
  用户描述完成了什么，自动匹配 Roadmap/Spec 并用 AskUserQuestion 询问决策点。
  触发关键词：功能完成、收尾检查、done、wrap up、Phase 完成、交付验证
argument-hint: "<完成了什么功能的描述>"
allowed-tools: Read, Write, Edit, Bash, Glob, Grep
disable-model-invocation: true
---

<task>
对刚完成的功能执行交付检查清单：测试覆盖扫描 + Roadmap 更新 + Spec 进度推进 + 文档影响判断 + simplify 补跑询问 + Phase 完成检测。
**不重跑**已做过的验证（commit 存在 = PreToolUse Hook 通过），只**检查 + 询问**决策点。
</task>

<workflow>

## Step 0: 解析完成描述 + 匹配

读取 `$ARGUMENTS` 确定刚完成了什么：

```bash
git log --oneline -5
git diff --stat HEAD~5..HEAD
```

**匹配流程**：
1. 从描述提取关键词（功能名、模块名）
2. 扫描 `docs/roadmap/` 匹配条目
3. 扫描 `docs/specs/` 匹配文件（优先 `status: implementing` 的 spec）

**匹配不明确时 MUST 用 AskUserQuestion 询问**（不散文追问、不猜测跳过）：

```
Question: 根据描述"[用户输入]"，匹配到以下候选，请确认：

Options:
1. Roadmap: phase-2.md - [条目 A]
2. Spec: user-auth.md (implementing, Phase 2)
3. 两个都关联
4. 都不对（跳过 Roadmap/Spec 更新，仅做工作区检查）
```

## Step 1: 工作区状态检查

**MUST 第一步检查**，确保 checklist 基于稳定的 commit 状态：

```bash
git status --short
```

- **有未提交变更** → 停止 `/done`，输出：
  > ⚠️ 检测到未提交变更：[文件列表]
  > `/done` 应在 commit 之后运行。请先 commit 再重试。

- **工作区干净** → commit 存在代表 PreToolUse Hook 验证通过，**不重跑测试**，继续下一步。

## Step 2: 测试覆盖快速扫描

识别本次功能涉及的新代码文件，扫描对应测试文件是否存在：

```bash
# 最近 commit 涉及的源文件（排除测试文件本身）
git diff --name-only HEAD~5..HEAD -- '*.ts' '*.tsx' '*.js' '*.py' '*.java' \
  | grep -vE '\.(test|spec)\.' | grep -v '__tests__'
```

对每个源文件推断预期测试路径（按项目惯例）：
- `src/utils/date.ts` → `src/utils/date.test.ts` 或 `tests/utils/date.test.ts`
- `apps/api/routers/users.py` → `tests/api/routers/test_users.py`

**缺失 → AskUserQuestion 询问**：

```
Question: 检测到以下文件缺少对应测试：
- src/utils/date.ts
- apps/api/routers/users.py

是否补测试？

Options:
1. (Recommended) 补测试（按项目 Testing Trophy 策略写集成测试）
2. 跳过（已在其他地方覆盖或不需要测试）
3. 自定义（说明原因）
```

选 1 → Claude 按 Testing Trophy（文档 04 Section 1）补测试，完成后另起 commit。
选 2/3 → 记录跳过原因，继续下一步。

## Step 3: Roadmap 更新（含"部分完成"检测）

如果 Step 0 匹配到 Roadmap 条目：

1. 读取条目上下文，检查是否是**父条目**（下面有子条目）：
   ```markdown
   - [ ] 用户认证模块                    ← 父条目
     - [x] ✅ 登录 UI
     - [x] ✅ 登录 API
     - [ ] 持久化 Session                ← 未完成子项
   ```

2. **父条目有未完成子项 → AskUserQuestion**：
   ```
   Question: "[条目]" 下还有未完成子项：
   - 持久化 Session
   是否仍标记父条目为完成？

   Options:
   1. (Recommended) 否，只勾已完成的子项
   2. 是，强制标记父条目完成（所有子项一并勾选）
   ```

3. 更新 checkbox：`- [ ]` → `- [x] ✅ YYYY/MM/DD`
4. 更新 `docs/roadmap/README.md` 进度统计（如 `2/5` → `3/5`）

## Step 4: Spec 状态推进（Phase 进度引擎）

如果 Step 0 匹配到 Spec 文件，读取 spec 并按当前 `active_phase` 检查进度：

### 4a. Phase Gate 验证（支持三类型标注，v3.23）

读取当前 `active_phase` 的 Gate 条件。**解析每个 Gate 条件的类型标注**（详见文档 03 Section 2.5 的 Gate 三类型），按类型分别验证：

#### 类型 1：`[auto: <表达式>]` — 读取可观察事实

Claude **只读取不判断**，映射到具体可观察事实。

常见表达式：
| 表达式 | 验证方式 |
|--------|---------|
| `phase.tasks.unchecked == 0` | 读 spec 文件，当前 Phase 的 `- [ ]` 数量是否为 0 |
| `grep -q 'TODO' spec.md && exit 1` | spec 里无 TODO 标记 |
| `file.exists: apps/api/auth/login.py` | 指定文件存在 |

#### 类型 2：`[command: <shell>]` — 执行命令

```bash
# 直接执行 shell，exit code 0 = 通过
<shell 命令>
echo "exit: $?"
```

通过条件：exit code == 0。
示例：
- `[command: pnpm test tests/auth/]` → 跑 `pnpm test tests/auth/`
- `[command: pnpm lint apps/api/auth/]` → 跑 lint

#### 类型 3：`[manual]` + EARS 句式 — 弹窗询问

用户视觉验证类条件（如"While 用户已登录, when 点击登出, the 系统 shall 清除 token"），/done **MUST 用 AskUserQuestion** 询问：

```
Question: 请验证 Manual Gate 条件：

[EARS 句式，如 "While 用户已登录, when 点击登出, the 系统 shall 清除 token 并跳转首页"]

Options:
1. ✅ 已验证通过
2. ❌ 未通过（说明原因）
3. ⏭️ 跳过（暂不验证，记为"未验证"）
```

#### 汇总判定

所有 Gate 条件全部通过 → **Gate 通过**：
1. 更新 frontmatter `active_phase` → 下一个 Phase
2. 更新 `updated` 日期
3. 检查 `active_phase > total_phases`？
   - **否** → 记录"Phase N 完成，进入 Phase N+1"
   - **是（所有 Phase 完成）** → 进入 4b

**Gate 未通过** → 输出未满足的条件列表（分类型），AskUserQuestion 询问：
```
Options:
1. 返回修复未通过的条件（取消 /done 推进）
2. 强制推进（自担风险，未通过条件记录到 spec 的"遗留"段）
```

#### 兼容旧格式（无类型标注）

遇到旧 spec 的 Gate 条件没有类型标注（如 `- [ ] 相关测试通过`）：
- 视为 `[manual]` 类型
- 弹窗询问用户
- 建议用户下次运行 /spec 时补类型标注（/spec 增量更新会识别并升级）

### 4b. Spec 全部完成

1. frontmatter `status`：`implementing` → `implemented`
2. 更新 `updated` 日期
3. 记录"Spec 全部完成"（后续 Step 5 会询问是否刷新文档）

## Step 5: 文档影响智能判断

基于本次 commit 的 diff 范围 + 完成粒度，智能判断是否建议刷新文档：

### 5a. 触发条件分析

扫描 `git diff HEAD~5..HEAD` 检测：

| 信号 | 建议的 /docs 范围 |
|------|-----------------|
| 新增模块 / 目录 | `/docs architecture` |
| 改路由组织 / 新增 API | `/docs backend`（如有） |
| 新增页面 / 路由 | `/docs frontend`（如有） |
| 新增跨层依赖 | `/docs architecture` |
| 改变数据流向（API / schema / state 形状） | `/docs architecture` |
| 新增环境依赖 / 配置 | `/docs getting-started` 或 `deployment` |
| 仅组件内部逻辑改动 | **不建议**（跳过询问） |

### 5b. 按粒度 + 触发条件组合询问

| 完成粒度 | 触发条件 | 询问方式 |
|---------|---------|---------|
| 单改动 / Spec 单 Phase | 触碰敏感区 | AskUserQuestion 询问是否 /docs |
| 单改动 / Spec 单 Phase | 未触碰敏感区 | **不询问**（跳过） |
| Spec 全部完成 | 任何 | AskUserQuestion **强烈推荐** /docs |
| Roadmap Phase 全部完成 | 任何 | 由 Step 7 的 /release 统一处理（/release 含 /docs 全量，此步不重复询问） |

**弹窗示例**：

```
Question: 本次改动涉及[新增模块 apps/api/notifications/]，建议刷新架构文档。现在执行吗？

Options:
1. (Recommended) 现在执行 /docs architecture
2. 稍后手动执行
3. 跳过（本次不需要）
```

选 1 → Claude 继续执行 `/docs architecture` 流程；选 2/3 → 记录，继续。

## Step 6: 代码审查检查（/simplify）

检测本次 commit 前是否跑过 /simplify：
- `/implement` 中等复杂度任务会提示用户跑 /simplify（用户可能选了或跳过）
- 独立开发者可能忘记跑

**启发式判断**：
- 本次 commit 涉及文件 ≤ 2 且是简单修复 → 跳过询问（通常不需要）
- 涉及 ≥ 3 文件 / 新功能 / 重构 → AskUserQuestion

```
Question: 未检测到本次改动的 /simplify 审查。是否补跑？

Options:
1. (Recommended) 跑 /simplify（三维并行审查：复用 / 质量 / 效率）
2. 跳过（已手动审查过 / 不需要）
```

选 1 → Claude 调用 /simplify；选 2 → 继续。

## Step 7: Roadmap Phase 完成检测

检查当前 Roadmap Phase 所有 checkbox 是否都已勾选：

- **否** → 记录"Phase N 还剩 [M] 个功能"
- **是 → AskUserQuestion**：

```
Question: Roadmap Phase [N] 全部完成！现在执行 /release 进行系统性文档刷新吗？

Options:
1. (Recommended) 现在执行 /release（含 /docs 全量 + Changelog + ADR 检查）
2. 稍后手动执行
3. 跳过（此 Phase 暂不发版）
```

选 1 → Claude 调用 /release；选 2/3 → 记录建议，继续。

## Step 8: 提交文档变更

如果 Step 3-4 产生了文档更新，精确 add 相关目录：

```bash
git add docs/roadmap/ docs/specs/
```

**commit message 根据实际变更动态生成**：

| 变更内容 | commit message |
|---------|---------------|
| 仅勾 Roadmap checkbox | `docs: 勾选 Phase N "[条目]" 完成` |
| Spec Phase 推进 | `docs: Spec [名] Phase N→N+1` |
| Spec 全部完成 | `docs: Spec [名] → implemented` |
| Roadmap + Spec 同时更新 | `docs: Phase N 勾选 + Spec [名] Phase N→N+1` |

## Step 9: 输出汇总

按完成粒度输出不同格式：

**单功能 / Spec 单 Phase 完成**：
```
✅ 交付检查完成

功能：[用户描述]
━━━━━━━━━━━━━━━━━━━━━━━━
Step 1 工作区       ✅ 干净（commit 存在）
Step 2 测试覆盖     ✅ 完整 / ⚠️ 缺失 [N] 文件（已补 / 已跳过）
Step 3 Roadmap     ✅ Phase N "[条目]" 已勾 / ⏭️ 无关联
Step 4 Spec        ✅ Phase M→M+1 / ⏭️ 无关联
Step 5 文档         ⏭️ 未触碰敏感区 / 📝 已启动 /docs [范围]
Step 6 Simplify    ⏭️ 已手动跑过 / ✅ 已补跑
Step 7 Phase 完成   ⏳ 还剩 [M] 个功能
━━━━━━━━━━━━━━━━━━━━━━━━
下一步：继续实施 Spec Phase [M+1] / 继续下一个功能
```

**Spec 全部完成**：
```
🎉 Spec 全部完成：[spec名].md → implemented

（Step 1-8 详情同上）

Spec 状态     ✅ implementing → implemented
Phase 进度    [M/M] 全部 Gate 通过
Roadmap      ✅ Phase N "[条目]" 已勾
文档刷新      📝 已启动 /docs / ⏭️ 已手动执行 / ⏭️ 已跳过

Roadmap Phase 状态：还剩 [M] 个功能 / 🎯 本 Phase 全部完成，已弹窗询问 /release
```

**Roadmap Phase 全部完成**：
```
🎉 Roadmap Phase [N] 全部完成！

所有功能已交付，所有 Spec 已 implemented。
/release 执行状态：✅ 已启动 / ⏭️ 用户选择稍后
```

</workflow>
