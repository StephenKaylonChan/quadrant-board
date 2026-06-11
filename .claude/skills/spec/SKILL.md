---
name: spec
description: |
  将讨论成果整理为结构化执行契约（Spec），写入 docs/specs/ 目录。
  支持增量更新（跨多次对话持续完善）。
  Spec 定位：执行契约（不是 PRD/RFC/ADR），含可机器判定的 Gate 条件。
  触发关键词：整理讨论、写 spec、保存设计、记录方案
argument-hint: "[功能名称] [可选：确认 → status 改为 approved]"
allowed-tools: Read, Write, Edit, Bash, Glob, Grep
disable-model-invocation: true
---

<task>
将当前对话的讨论成果整理为 Spec（执行契约）。
- 新建时：写入 docs/specs/<name>.md（status: draft）
- 已存在时：增量合并新讨论
- 用户说"确认"时：status → approved

MUST 原则：
1. 每个 Gate 条件带类型标注（[auto: 表达式] / [command: shell] / [manual]）
2. [auto] 必须映射到可观察事实，Claude 只读不判断
3. [manual] 用 EARS 句式（减少含糊）
4. 不合并 ADR 内容（引用即可）
</task>

<workflow>

## Step 0: 确定文件名和模式

读取 `$ARGUMENTS`：
- `/spec user-auth` → 文件名 `user-auth.md`，新建或增量
- `/spec user-auth 确认` → 已存在的 spec，status 切换为 approved（进入 Step 5b）
- 无参数 → 根据讨论主题自动命名（kebab-case）

判断模式：
- 文件不存在 → **新建模式**（Step 3a）
- 文件已存在 → **增量更新模式**（Step 3b）

```bash
mkdir -p docs/specs
```

## Step 1: 收敛讨论成果

### 1a. 共识与分歧梳理

先输出总结：

```
📋 讨论收敛：
✅ 共识：[2-5 条核心决定]
⚠️ 待定：[尚未敲定的点，如有]
```

**有待定项 → AskUserQuestion**：

```
Question: 讨论中有 [N] 项待确认：
- [分歧 A]
- [分歧 B]

Options:
1. 现在逐一确认（你回答后 Claude 继续整理）
2. 标记为 draft，这些点后续讨论（Spec 里用 TODO 标出）
3. 按 Claude 建议方案写入（自担风险）
```

### 1b. 提取讨论内容

按需提取（**没有的不写**）：

- 功能背景与目标
- 需求要点和验收标准
- 讨论过的方案及取舍理由
- 最终确定的设计方案
- UI/交互设计
- API 设计
- 数据模型
- 业务逻辑
- 调研发现
- 约束条件

## Step 2: 规划 Implementation Phases

拆分为 **2-5 个 Phase**，每个 Phase 必须：

- **独立可交付**：完成后有可验证产出
- **独立可验证**：有**可机器判定**的 Gate 条件
- **规模合理**（对齐 /implement 硬阈值）：
  - 控制在 3-5 文件改动范围
  - 避免单 Phase 同时跨模块 + 新依赖 + 改数据流
  - 超出 → 拆两个 Phase

拆分策略：
- **纵向**：数据层 → API 层 → UI 层（后端优先）
- **横向**：独立模块并行（各模块无强依赖时）
- **简单功能**（预估 < 30 分钟）：1 个 Phase 即可

## Step 3: 写入 Spec 文件

### Step 3a: 新建模式

写入 `docs/specs/<name>.md`：

```markdown
---
title: [功能名称]
status: draft
created: YYYY-MM-DD
updated: YYYY-MM-DD
total_phases: 3
active_phase: 1
---

# [功能名称] — 执行契约（Spec）

> 这是 **Spec（执行契约）**，不是 PRD / RFC / ADR。
> ADR 链接（如有）：[docs/architecture/adr/XXXX-xxx.md]

## 背景与目标

[为什么做，解决什么问题]

## 需求概要

[核心功能点 + 验收标准]

## 设计方案

### 讨论过的方案

[方案 A vs B vs C，各自优缺点，最终选择理由]

### 最终方案

[确定的技术/设计方案]

## 详细设计

（以下模块按需包含，没有的不写）

### UI/交互设计
[页面布局、组件、交互流程]

### API 设计
[端点列表、请求/响应格式]

### 数据模型
[表结构、字段、关系]

### 业务逻辑
[核心处理流程、边界情况]

## 调研记录
[联网搜索、技术选型依据]

## 约束与注意事项
[性能、安全、兼容性、已知限制]

## Implementation Phases

### Phase 1: [名称，如"数据模型与迁移"]

**Tasks**:
- [ ] 定义 User/Token 模型（apps/api/models/auth.py）
- [ ] 创建迁移脚本
- [ ] 补单元测试

**Gate（全部满足才算完成，/done 验证）**:
- [ ] Tasks 全部勾选                              [auto: phase.tasks.unchecked == 0]
- [ ] 单元测试通过                                [command: pnpm test apps/api/models/auth]
- [ ] 无 lint error                              [command: pnpm lint apps/api/models]
- [ ] While 数据库已迁移, when 查询 User, the 系统 shall 返回正确 schema    [manual]

**On Complete**: active_phase → 2，建议 /done

### Phase 2: [名称，如"API 端点实现"]

**Tasks**:
- [ ] /auth/login 端点
- [ ] /auth/refresh 端点
- [ ] 集成测试

**Gate**:
- [ ] Tasks 全部勾选                              [auto: phase.tasks.unchecked == 0]
- [ ] 集成测试通过                                [command: pnpm test tests/auth/]
- [ ] While 用户已注册, when POST /auth/login 正确凭据, the API shall 返回 200 + token  [manual]

**On Complete**: active_phase → 3，建议 /done

### Phase 3: [名称，如"前端 UI 集成"]

**Tasks**:
- [ ] 登录页面
- [ ] axios 拦截器
- [ ] E2E 测试

**Gate**:
- [ ] Tasks 全部勾选                              [auto: phase.tasks.unchecked == 0]
- [ ] E2E 测试通过                                [command: pnpm test:e2e auth]
- [ ] While 未登录, when 访问受保护页面, the 系统 shall 重定向到 /login  [manual]

**On Complete**: 所有 Phase 完成，建议 /done + /release（如 Roadmap Phase 也完成）
```

#### Gate 条件的 3 种类型

| 类型 | 语法 | 说明 | 示例 |
|------|------|------|------|
| **`[auto: <表达式>]`** | 可观察事实的表达式 | /done 读取文件/spec 验证，**Claude 只读不判断** | `[auto: phase.tasks.unchecked == 0]` |
| **`[command: <shell>]`** | shell 命令 | /done 执行，exit code 0 = 通过 | `[command: pnpm test tests/auth/]` |
| **`[manual]`** + EARS 句式 | While X, when Y, the Z shall W | /done 弹窗询问用户验证 | `[manual] While 用户已登录, when 点击登出, the 系统 shall 清除 token` |

**为什么三类型**：
- `[auto]` 避免"AI 自证清白"（Martin Fowler 对纯 AI 判断的质疑）
- `[command]` 是相对 Kiro/spec-kit 的**独特增量**——Gherkin 纯文本仍是"AI 解释"，shell 命令是真正的机器判定
- `[manual]` 用 EARS 句式（Rolls-Royce 2009）减少"怎么算验证通过"的含糊

**EARS 五种模式**（`[manual]` 可用）：
- **Ubiquitous**: `The <system> shall <response>`
- **Event-Driven**: `When <trigger>, the <system> shall <response>`
- **State-Driven**: `While <precondition>, the <system> shall <response>`
- **Unwanted**: `If <unwanted condition>, then the <system> shall <mitigation>`
- **Optional**: `Where <feature>, the <system> shall <response>`

### Step 3b: 增量更新模式

已存在的 spec 追加新讨论成果：
- 保留已有内容不删除
- 新讨论融入对应章节
- 更新 frontmatter 的 `updated` 日期
- 推翻之前的结论 → 更新内容 + 在"讨论过的方案"记录变更原因
- Phases 已完成 `[x]` 的状态**不动**
- Gate 条件如果有升级（如从自由格式升级为类型标注） → 同步补充类型标注

## Step 4: Roadmap 关联（AskUserQuestion）

检查 `docs/roadmap/` 是否有对应条目：

**找到** → 在 spec 头部标注：`关联 Roadmap: phase-2.md - "用户认证模块"`
**未找到** → AskUserQuestion：

```
Question: 未在 Roadmap 找到对应条目，是否添加？

Options:
1. (Recommended) 添加到当前 Phase
2. 添加到下一个 Phase
3. 不添加（spec 独立存在）
```

## Step 5: 状态判断

### 5a. 默认首次生成 → status: draft

不主动推断用户意图。

### 5b. 用户明确"确认" → AskUserQuestion 确认

当 `$ARGUMENTS` 包含"确认"或生成后用户表示要确认：

```
Question: 当前 status: draft，是否切换为 approved？

Options:
1. (Recommended) approved（方案已定，可以开始实施）
2. 保持 draft（还想继续讨论某部分）
3. 保持 draft + 补充某个模块（自由输入要补的部分）
```

选 1 → frontmatter status: draft → approved + 更新 updated 日期

### 状态生命周期

```
draft → approved → implementing → implemented
                                      ↓
                              [deprecated | superseded]
```

| status | 含义 | 触发时机 |
|--------|------|---------|
| `draft` | 讨论中 | /spec 首次生成 |
| `approved` | 方案已确认，可实施 | 用户明确确认 |
| `implementing` | 实施中 | Claude 基于 spec 开始编码时自动切换 |
| `implemented` | 已完成 | /done 推进所有 Phase 后 |
| `deprecated` | 已弃用 | 手动（技术/业务变化，不再实施） |
| `superseded` | 被替代 | 手动（新 spec 取代，frontmatter 注明替代文件） |

## Step 6: 输出确认

```
✅ Spec 已生成/更新

文件：docs/specs/<name>.md
状态：draft / approved / implementing / implemented
Phases：[N] 个（active_phase: [M]）
Gate 类型分布：[auto] X 条 / [command] Y 条 / [manual] Z 条
关联 Roadmap：[有 phase-X.md "[条目]" / 无]

建议下一步（按状态）：
- draft → 继续讨论 → 再次 /spec <name> 增量更新
- draft → 确认方案 → /spec <name> 确认（切换到 approved）
- approved → /clear 后 "读取 docs/specs/<name>.md，开始实施 Phase 1"
  （每次只实施一个 Phase，完成 Gate 后 /done 推进）
```

</workflow>
