---
name: docs
description: |
  文档生态守护者：对照代码实际状态，对所有文档做更新 / 新增 / 删除 / 审计一致性。
  覆盖 CLAUDE.md、架构文档、开发文档、spec、ADR 等所有文档。
  Gate 可执行性检查、spec 描述 vs 代码对齐、历史趋势对比。
  触发关键词：更新文档、梳理文档、docs、架构梳理、文档同步、文档审计、spec 一致性
argument-hint: "[架构范围 | audit | 空=全量]"
allowed-tools: Read, Write, Edit, Bash, Glob, Grep, Agent
disable-model-invocation: true
---

<task>
对项目所有文档执行"文档生态守护"：
1. 扫描代码实际状态 + 对比所有文档（architecture / development / specs / ADR / CLAUDE.md）
2. 识别四种操作：更新（不一致）/ 新增（代码有文档缺）/ 删除（文档有代码缺）/ 审计（spec-code、ADR 有效性、Gate 可执行性）
3. 改动 >10 处 → AskUserQuestion 审核；≤10 处直接修
4. 只改文档，**不改代码**（代码问题输出到报告让 /implement 修）
5. **不自动 push**
</task>

<workflow>

## Step 0: 确定范围

解析 `$ARGUMENTS`：

| 参数 | 执行范围 |
|------|---------|
| 无参数 | **全量守护**：所有四种操作 × 所有文档（architecture + development + specs + ADR + CLAUDE.md） |
| `architecture` | `docs/architecture/` 全部（README + frontend + backend） |
| `frontend` | `docs/architecture/frontend.md` |
| `backend` | `docs/architecture/backend.md` |
| `getting-started` | `docs/development/getting-started.md` |
| `deployment` | `docs/development/deployment.md` |
| `audit` | **深度审计模式**：专注 spec-code 一致性、ADR 有效性、Gate 可执行性（不改架构文档） |

```bash
mkdir -p docs/architecture docs/development docs/reports
```

## Step 1: 变更锚定（增量检测基准）

确定"上次文档更新以来改了什么"，为后续探索提供方向：

```bash
# 找到最近一次文档更新的 commit
LAST_DOC_COMMIT=$(git log --oneline -- 'docs/architecture/' 'docs/development/' | head -1 | cut -d' ' -f1)

# 自那以后变更的源文件（按目录分组）
echo "=== 变更文件 ==="
git diff --name-only $LAST_DOC_COMMIT..HEAD -- '*.py' '*.ts' '*.tsx' '*.js' '*.jsx' '*.java' 2>/dev/null | sort

# 新增的文件（上次文档更新时不存在的）
echo "=== 新增文件 ==="
git diff --diff-filter=A --name-only $LAST_DOC_COMMIT..HEAD 2>/dev/null

# 最近 commit 摘要（理解变更意图）
echo "=== 变更摘要 ==="
git log --oneline $LAST_DOC_COMMIT..HEAD | head -30
```

将变更文件按模块分组，标记每个模块的变更密度（文件数）。
**Step 2 的探索 MUST 覆盖所有有变更的模块**，不能只泛泛扫描。

如果 `LAST_DOC_COMMIT` 找不到（首次运行 `/docs` 或文档目录不存在），则跳过锚定，Step 2 做全量探索。

## Step 2: 深度探索代码

**优先探索 Step 1 标记的变更模块**，然后按范围补充探索：

根据范围，使用 Explore subagent 或直接读取关键文件：

**架构相关**（architecture / frontend / backend）：
- 扫描顶层目录结构和模块划分
- 读取路由/控制器，梳理请求完整链路
- 读取中间件/拦截器，梳理横切关注点
- 读取 service/repository 层，梳理业务逻辑链路
- 识别状态机、异步任务、定时任务等复杂流程
- 读取组件目录结构，梳理分层和复用模式
- 特别关注跨多文件才能串起来的逻辑链路

**上手指南相关**（getting-started）：
- 读取 package.json / pyproject.toml（依赖和脚本）
- 读取 .env.example（环境变量）
- 读取 Docker 配置（如有）
- 验证启动步骤是否仍然有效

**部署相关**（deployment）：
- 读取 CI/CD 配置
- 读取 Dockerfile / docker-compose
- 读取环境变量使用情况（grep 所有 process.env / os.environ）
- 检查部署脚本

## Step 3: 读取现有文档 + 变更覆盖检查

读取对应的现有文档文件（如存在），标记**四种操作**：
- ✅ 仍然准确的内容（**保持**）
- ⚠️ 需要**更新**的内容（代码已变但文档未同步）
- ❌ 需要**删除**的内容（文档还在但代码已删除 / 过时引用）
- 🆕 需要**新增**的内容（代码中有但文档中缺失）

**变更覆盖检查**（基于 Step 1 锚定结果）：
逐一检查 Step 1 中每个变更模块，确认文档是否覆盖：
- 新增的文件/模块 → 文档是否提及？（如缺 → 🆕 新增）
- 新增的机制/流程（从 commit message 的 `feat:` / `refactor:` 识别）→ 文档是否描述？
- 删除/重构的功能 → 文档是否还在引用已不存在的内容？（如是 → ❌ 删除）

未覆盖的变更 MUST 在 Step 5 中补充到对应文档。

## Step 4: Spec / ADR / Gate 审计（全量模式或 `audit` 模式）

**仅在无参数（全量）或 `audit` 参数时执行**。架构/frontend/backend/getting-started/deployment 单独参数时跳过。

### 4a. Spec 描述 vs 代码实现一致性

扫描 `docs/specs/` 所有 `status: implementing` 或 `status: implemented` 的 spec：

对每个 spec：
- **spec 里提到的模块/文件/函数是否仍存在**？
  ```bash
  # 提取 spec 里引用的路径（如 apps/api/auth/login.py）
  grep -oE '[a-zA-Z_/]+\.(ts|tsx|py|java)' docs/specs/<name>.md | sort -u
  # 逐一验证文件是否存在
  ```
- **spec 里的设计方案是否和代码实现一致**？（读 spec 的"最终方案"段，对比实际代码）
- **spec 里描述的数据流/状态机是否仍然有效**？

**不一致 → 询问用户**：
- spec 过时 → 更新 spec 描述对齐代码
- 代码偏离 spec → 输出到报告，建议用户用 /implement 修代码（不在本命令修）

### 4b. ADR 有效性检查

扫描 `docs/architecture/adr/` 所有 ADR：

- **ADR 里的决策是否仍在代码中生效**？（如 "MUST 使用 Zustand 而非 Redux" → grep `redux` 看有无违反）
- **ADR 提到的技术/库是否仍在项目中**？（package.json / pyproject.toml）
- **有没有代码违反 ADR 约定**？

**发现违反 → 询问**：
- ADR 已不再适用 → 标记为 `deprecated` 或 `superseded`（不直接删，保留历史）
- 代码违反 ADR → 输出报告让 /implement 修复

### 4c. Gate `[command]` 可执行性检查（v3.23 对接）

扫描 `docs/specs/` 中的 Gate 条件，提取 `[command: <shell>]` 类型：

```bash
# 提取所有 [command: xxx] 条件
grep -oE '\[command: [^]]+\]' docs/specs/*.md
```

对每个 `[command]` 条件：
- 试跑一次（`--dry-run` 模式或加 `echo` 前缀）看命令是否仍存在、参数是否仍有效
- 如命令已失效（如引用的测试文件路径不存在）→ 标记为 stale，提示用户更新 spec

**不自动修**——输出到报告，在 Step 5 询问用户。

## Step 5: 增量更新

按以下规范写入/更新文档：

### `docs/architecture/README.md` — 架构总览（30-50 行）
- 顶层模块职责和边界
- 模块间依赖关系
- 前后端通信方式
- 关键技术选型一句话理由
- 非直觉的全局设计决策

### `docs/architecture/frontend.md` — 前端架构（50-100 行）
- 路由结构（哪些页面用模板布局、哪些独立）
- 组件分层规则（ui / business / page）
- 全局状态流转（store → component → API 调用）
- 表单/列表/弹窗等通用交互模式
- 样式约定（全局 vs 组件级 vs 共享）

### `docs/architecture/backend.md` — 后端架构（50-100 行）
- 请求完整链路：Router → Middleware → Service → Repository → DB
- 认证/鉴权链路（token 解析 → 权限判断 → 端点保护）
- 业务逻辑中的状态机流转（如订单、审批流程）
- 异步任务/定时任务的触发条件和执行路径
- 错误处理和统一响应格式
- 数据处理约定（Converter/Transformer 位置、事务管理）

### `docs/development/getting-started.md` — 上手指南
- 环境要求（语言/包管理器/数据库版本）
- 从 clone 到跑通的完整步骤
- 关键 URL（本地服务地址、API 文档地址）
- 项目结构概览

### `docs/development/deployment.md` — 部署文档
- 环境变量表（名称、必填、说明、示例）
- 部署流程步骤
- 回滚方案

**写入原则**：
- 写代码里看不出来的：模块为什么这样划分、数据为什么这样流转
- 写跨多文件才能串起来的逻辑链路（请求链路、认证流程、状态机等）
- 不写具体函数签名、props 列表（看代码）
- 不写 API 端点列表（看自动生成的 API 文档）
- 不写数据库表结构（看 ORM 模型）
- 已有内容只增量更新，不全量重写

## Step 6: AskUserQuestion 审核（改动 >10 处时）

统计 Step 3-5 识别的总改动数（更新 + 新增 + 删除）。

**改动 ≤10 处** → 直接执行修改（Step 7）。

**改动 >10 处** → **MUST 用 AskUserQuestion 让用户审核**：

```
Question: 检测到 [X] 处文档需要修改：
- 更新 [Y] 处（文档对不上代码）
- 新增 [Z] 处（代码有文档缺）
- 删除 [W] 处（文档引用已删除的代码）
- spec/ADR/Gate 审计问题 [V] 处

如何处理？

Options:
1. (Recommended) 全部修（我已 review 报告）
2. 只修 P0（只改明显过时 + 代码已删除引用）
3. 只生成报告（完全手动处理）
4. 自定义范围（自由输入）
```

报告路径：`docs/reports/docs-YYYY-MM-DD.md`（含完整改动清单，供用户 review）。

## Step 7: 执行修改 + 提交

根据用户选择执行修改。精确 `git add` 相关目录：

```bash
git add docs/architecture/ docs/development/ docs/specs/ docs/architecture/adr/ CLAUDE.md
git commit -m "docs: [实际变更描述]"
```

**commit message 按实际变更动态生成**：
- 主要是架构文档更新 → `docs: 同步架构文档（[模块] 新增 / 更新 [N] 处）`
- 主要是 spec/ADR 审计 → `docs: spec-code 一致性审计修复（[N] 处）`
- 混合 → `docs: 文档生态守护 — [N] 处更新 + [M] 处新增 + [W] 处删除`

**MUST NOT `git push`**——push 必须用户显式要求。

## Step 8: 输出报告

```
✅ 文档生态守护完成（范围：[全量 / architecture / audit / ...]）

━━━━━━━━━━━━━━━━━━━━━━━━
变更锚定：基于 [hash] 以来 [N] 个 commit / 首次运行（全量探索）

四种操作统计：
- 更新 [Y] 处 ✅
- 新增 [Z] 处 ✅
- 删除 [W] 处 ✅
- 审计问题 [V] 处（spec-code / ADR / Gate）
━━━━━━━━━━━━━━━━━━━━━━━━

文档改动清单：
- CLAUDE.md: [新建 / 更新 N 处 / 无变更]
- docs/architecture/README.md: [新建 / 更新 N 处 / 无变更]
- docs/architecture/frontend.md: ...
- docs/architecture/backend.md: ...
- docs/development/getting-started.md: ...
- docs/development/deployment.md: ...
- docs/specs/: [审计 N 个 spec，修复 M 处]
- docs/architecture/adr/: [审计 N 个 ADR，标记 M 个 deprecated]

历史趋势：
- 上次审计 [日期]：X 处问题
- 本次：Y 处问题（↑恶化 / →持平 / ↓改善）

需用户关注（代码问题，/docs 未修）：
- [列出需要用 /implement 修的代码不一致项]

报告：docs/reports/docs-YYYY-MM-DD.md
下一步：git push（如需）/ /implement 修复代码不一致项
```

</workflow>
