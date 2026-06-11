---
name: diagnose
description: |
  全维度代码健康诊断。系统性扫描代码结构、耦合度、可维护性等 13 个维度，输出诊断报告和重构计划。
  独立于功能开发，专门用于发现和规划代码优化。
  触发关键词：代码诊断、代码健康、重构评估、全面审查、code health、技术债
argument-hint: "[frontend | backend | <模块名> | 空=全项目]"
allowed-tools: Read, Bash, Glob, Grep, Agent
disable-model-invocation: true
---

<task>
对项目进行全维度代码健康诊断（13 个维度），输出量化评分、完整问题清单和分批重构计划。
**只诊断不改代码**——改代码在后续用 `/implement` 批量模式按计划执行。
</task>

<dimensions>

## 诊断维度（四层 13 维度）

### 结构层（影响面大，优先级高）

**D1 耦合度** — 改 A 会不会崩 B？
- 检查组件/模块间的导入依赖数量和深度
- 查找跨模块直接引用内部状态或私有方法
- 前端：组件是否依赖过多不相关 store；CSS 样式是否穿透到其他组件
- 后端：Service 之间是否有非接口级的直接调用

**D2 职责划分** — 每个单元是否只做一件事？
- 查找"万能文件"（> 300 行的组件 / > 500 行的 Service）
- 前端：组件内是否直接调 API、处理数据转换、包含业务逻辑
- 后端：Controller/Router 内是否有业务逻辑；Service 是否混合了多个业务域

**D3 模块边界** — 模块之间是通过接口通信还是深入内部？
- 查找被 > 10 个文件导入的"上帝模块"
- 检查模块是否暴露了内部实现（应只暴露公共接口/index）
- 前后端 API 契约是否清晰（请求/响应类型定义）

**D4 依赖方向** — 依赖关系是否合理？
- 检查循环依赖（A→B→C→A）
- 检查是否有下层依赖上层（data 层引用 UI 层）
- 检查共享代码是否独立（不依赖任何业务模块）

### 实现层（局部优化，逐步改进）

**D5 代码重复** — 近似逻辑是否散落多处？
- grep 相似的函数签名和代码块
- 重点关注 80% 相似但略有不同的代码（比完全相同更危险）
- 应该抽成公共 hook/util/service 但没有的

**D6 错误处理** — 是否一致且完整？
- 检查 try-catch 使用是否一致
- 查找静默失败（catch 了但空处理 / 仅 console.log）
- 检查错误响应格式是否统一

**D7 类型安全** — 类型系统是否被正确使用？
- 前端：grep `any`、`@ts-ignore`、`@ts-expect-error`、类型断言 `as`
- 后端（Python）：关键函数是否有类型注解；Pydantic model 是否覆盖 API 边界
- 后端（Java）：是否用 Map 代替 DTO；泛型是否正确使用

**D8 性能隐患** — 是否有明显的性能反模式？
- 前端：组件内创建对象/函数导致不必要 re-render；缺少 key 或 key 使用 index
- 后端：循环内 DB 查询（N+1）；同步阻塞调用；缺少分页
- 通用：未清理的定时器/订阅（内存泄漏风险）

**D9 测试覆盖** — 关键操作链路是否有集成测试？
- 关键用户交互（分页/搜索/表单/CRUD）是否有集成测试（测完整操作链路，不只是独立函数）
- 是否存在"假覆盖"：只有单元测试，每个函数单独通过，但串起来的链路没人测
- 后端 API 是否有请求级集成测试（走完整 路由→service→DB 链路，不只是测 service 函数）
- 测试是否在测实现细节而非用户行为（如直接检查 state 值而非检查页面显示内容）
- 紧耦合导致无法测试的模块
- **Spec Gate 对齐**（v3.23 对接）：扫 `docs/specs/` 中 `status: implementing` / `implemented` 的 spec，检查 `[command: xxx]` Gate 条件对应的测试命令是否存在、是否仍可执行（如 `pnpm test tests/auth/` → 对应测试目录是否有文件）；Gate 引用了测试但实际不存在 → 标记为"假 Gate"

### 卫生层（认知负担）

**D10 死代码** — 是否有不再使用的代码？
- 未使用的函数、组件、导入、变量
- 注释掉的代码块（应删除，git 有历史）
- 已废弃但未清理的功能

**D11 一致性** — 同一件事是否用同一种方式做？
- 同一功能多种实现（如 HTTP 客户端既用 fetch 又用 axios）
- 命名风格不统一（camelCase 和 snake_case 混用）
- 错误处理/日志格式不统一
- **重复模式 → lint 建议**（Addy Osmani "重复犯错升级为 lint 规则"理念）：
  - 发现 2+ 次重复的反模式（如多处 `style={{}}`、多处裸 SQL、多处 `@ts-ignore`）→ 标记为"建议升级为 lint 规则或 `.claude/rules/` 红线"
  - 输出具体 lint 配置建议（如 ESLint `no-restricted-syntax` 规则 / `.claude/rules/*.md` MUST NOT 条款）
  - 该类问题单独列为"lint 建议"维度，不和 P0-P3 混淆

### 战略层（投入产出比）

**D12 代码热点** — 哪些代码改动最频繁且质量最差？
- 分析 git log 找改动频率最高的文件
- 交叉对比代码质量（文件大小、复杂度、问题密度）
- 热点 = 改动频繁 × 质量差 = 最值得重构的地方

**D13 知识孤岛** — 是否有只有一个人碰过的关键模块？
- 分析 git blame/log 的作者分布
- 标记 bus factor = 1 的模块（只有一个贡献者）
- 单人项目跳过此维度

</dimensions>

<workflow>

## Step 0: 读取项目上下文

```bash
echo "=== 代码健康诊断 $(date '+%Y-%m-%d %H:%M') ==="
```

读取（如存在）：
1. `CLAUDE.md`（技术栈、约束、完成标准）
2. `docs/architecture/`（设计意图基准，对比实际代码偏差）
3. 上一次诊断报告 `docs/reports/diagnose-*.md`（用于对比改善）

## Step 1: 探索项目结构 → 决定扫描策略

**自适应文件类型识别**（不硬编码，从项目上下文推断）：

1. **读 CLAUDE.md "技术栈"段**：识别主要语言（如 "TypeScript + Python"）
2. **读 package.json / pyproject.toml / pom.xml / Cargo.toml**：补充识别
3. **基于识别结果决定扫描的文件扩展名**：
   - TypeScript / JavaScript → `*.ts`, `*.tsx`, `*.js`, `*.jsx`
   - Python → `*.py`
   - Java → `*.java`
   - Go → `*.go`
   - Rust → `*.rs`
   - （根据实际情况扩展）

```bash
# 示例：识别出 TS + Python 后动态构造 find 命令
find . -type f \( -name "*.ts" -o -name "*.tsx" -o -name "*.py" \) \
  -not -path "*/node_modules/*" -not -path "*/.next/*" -not -path "*/dist/*" -not -path "*/__pycache__/*" -not -path "*/.venv/*" | wc -l

# 顶层目录结构
ls -d */ 2>/dev/null
```

- 识别模块边界（目录划分方式：monorepo `apps/` / 单包 `src/` / 自定义）
- 检查 `$ARGUMENTS`，限定扫描范围

**扫描策略**：

| 条件 | 策略 |
|------|------|
| < 50 源文件 或 scope 指定了具体模块 | 主 Agent 直接扫全维度 |
| ≥ 50 源文件，前后端分离 | SubAgent: 前端 + 后端 + 跨模块 |
| ≥ 50 源文件，按业务域划分 | SubAgent: 每个业务域 + 跨域 |

SubAgent 指令要点：
> 扫描 [范围] 下的所有源文件，按 13 个维度逐一检查。
> 每个问题输出：维度编号、文件路径:行号、严重性(P0-P3)、置信度(高/中/低)、问题描述、判断依据。
> **D9 补充**：如 `docs/specs/` 存在 implementing/implemented 的 spec，扫其 `[command: xxx]` Gate 条件对应的测试命令是否存在/可执行（假 Gate 问题列为 P1）。
> **D11 补充**：发现 2+ 次重复的反模式 → 输出到独立的"lint 建议"清单（含具体 lint 配置建议），不和 P0-P3 混淆。
> **不改代码，只输出发现。**

## Step 2: 热点分析（可选）

**前置条件**：git 历史 ≥ 1 个月且 commit ≥ 30 个。不满足则跳过，标记"热点分析: 跳过（历史不足）"。

```bash
# 最近 3 个月文件改动频率 Top 20
git log --since="3 months ago" --name-only --pretty=format: | sort | uniq -c | sort -rn | head -20

# 文件行数排序（大文件 = 复杂度信号）
find . -type f \( -name "*.ts" -o -name "*.tsx" -o -name "*.py" -o -name "*.java" \) \
  -not -path "*/node_modules/*" -exec wc -l {} \; | sort -rn | head -20
```

改动频率高 × 文件大 = 热点候选，在最终报告中标记。

## Step 3: 全维度扫描

按 D1-D13 逐维度扫描。对每个维度：

1. 用 Grep/Glob 做模式匹配（快速发现明显问题）
2. 读取关键文件做语义分析（发现需要理解上下文的问题）
3. 每个问题记录：`[维度] [文件:行号] [P0-P3] [置信度] 描述 | 依据`

**技术栈专项**（根据 Step 1 识别结果自动追加）：

| 技术栈 | 追加检查 |
|--------|---------|
| React/Next.js | 组件 > 200 行、`style={{}}`、props drilling > 3 层、Server/Client 分界 |
| FastAPI | 路由函数 > 30 行、async/sync 混用、缺少 Pydantic 校验 |
| Spring Boot | Controller 业务逻辑、字段注入 `@Autowired`、Entity 直接作响应 |

## Step 4: 汇总评分

每维度评分 0-10（10 = 完美）：

| 评分 | 含义 |
|------|------|
| 8-10 | 优秀，无需处理 |
| 5-7 | 可接受，有改进空间 |
| 3-4 | 需要关注，建议本月处理 |
| 0-2 | 严重，建议立即处理 |

综合健康度 = 13 维度加权平均（结构层权重 ×1.5，其余 ×1.0）。
如有上次诊断报告，输出对比变化。

## Step 5: 生成重构计划

将 P0-P2 问题**分三类**处理：

### 5a. 进入 Batch 重构（主体）

1. **同一模块的问题合并到同一 Batch**（减少上下文切换）
2. **有依赖关系的 Batch 标注前置条件**
3. **每个 Batch 预估不超过 1 个会话**
4. **每个 Batch 有明确验收标准**

### 5b. 标记为"不做"（投入产出比低）

满足任一条件 → 明确标记"**不做**"并说明理由（不浪费精力）：
- 修改面大但收益小（如修 1 个 any 要动 20 个文件）
- 即将被废弃的模块（和 Roadmap 对照）
- 成本收益未明（需要更多信息才能决策）

**不是所有问题都值得修**——明确标记反而减少决策负担。

### 5c. lint 建议（D11 产出的独立清单）

不进入 Batch 重构，而是输出到报告的**"lint 建议"章节**，让用户自己评估是否加到 ESLint / `.claude/rules/` 配置。

P3 观察项单独列出，不进入重构计划。

## Step 6: 输出报告

```bash
mkdir -p docs/reports
```

写入 `docs/reports/diagnose-YYYY-MM-DD.md`：

```markdown
---
date: YYYY-MM-DD
scope: [full | frontend | backend | 模块名]
tech_stack: [识别到的技术栈]
files_scanned: [数量]
issues_found: [数量]
health_score: [0-10]
previous_score: [上次得分，如有]
---

# 代码健康诊断报告

## 健康度评分

| 维度 | 得分 | 说明 |
|------|------|------|
| D1 耦合度 | X/10 | ... |
| D2 职责划分 | X/10 | ... |
| ... | | |
| **综合** | **X.X/10** | [与上次对比] |

## 热点文件
[Top 10 热点文件表，或"跳过（历史不足）"]

## 问题清单

### 🔴 P0 — 结构性问题
[编号]. [D维度] [文件:行号] [置信度:高/中/低]
  描述: ...
  依据: ...

### 🟡 P1 — 实现质量问题
...

### 🟢 P2 — 卫生问题
...

### ℹ️ P3 — 观察项
...

### 🚫 不做（投入产出比低）
[编号]. [问题] — **不做理由**: [修改面大/即将废弃/成本收益未明]

## 🔧 lint 建议（D11 独立清单）

发现以下重复反模式，建议升级为 lint 规则或 `.claude/rules/` 红线：

| 模式 | 出现次数 | 建议 |
|------|---------|------|
| `style={{}}` | 8 处 | ESLint `no-restricted-syntax` 或 `.claude/rules/frontend.md` MUST NOT |
| 裸 SQL 字符串 | 5 处 | `.claude/rules/backend.md` MUST 使用 ORM |

具体配置示例：
```json
// .eslintrc
"no-restricted-syntax": [
  "error",
  { "selector": "JSXAttribute[name.name='style']", "message": "使用 Tailwind/CSS Modules 替代 inline style" }
]
```

## 跨边界观察
[scope 限定时检测到的跨边界问题，注明对侧未完整分析]

## 重构计划

### Batch 1: [名称]（预估 [N] 个会话）
- **前置**: 无 / Batch N
- **范围**: [涉及的文件/模块]
- **解决问题**: #1, #3, #7
- **验收标准**: [具体可验证条件]

### Batch 2: ...

## 执行建议

按 Batch 顺序执行，每个 Batch 用 `/implement` 批量模式：
1. 先补测试锁定现有行为
2. 重构
3. 跑测试确认不破坏
4. commit

**lint 建议**：用户自行评估后加到 ESLint / `.claude/rules/` 配置（一次投入，长期防御）。

全部完成后再次运行 `/diagnose` 验证改善效果。
```

## Step 7: AskUserQuestion 引导下一步

**MUST 用 AskUserQuestion**（不散文建议，和其他 skill 保持一致）：

```
Question: 诊断完成，发现 [X] 个 Batch 的重构计划。下一步？

Options:
1. (Recommended) 启动 /implement 批量模式执行 Batch 1（按依赖顺序）
2. 生成 Roadmap TODO（留给后续迭代）
3. 只看报告（稍后手动处理）
4. 重新诊断特定范围（自由输入，如"只看 backend"）
```

**报告文件 MUST 已在 Step 6 写入**（无论用户选择什么），供后续查阅。

## Step 8: 输出确认

```
✅ 代码健康诊断完成

综合健康度: X.X/10 [与上次对比 ↑/→/↓]
扫描范围: [scope]
扫描文件: [N] 个
发现问题: P0 [N] 个 | P1 [N] 个 | P2 [N] 个 | P3 [N] 个
重构计划: [N] 个 Batch，预估 [N] 个会话
lint 建议: [M] 条（重复模式 ≥2 次，建议升级为 lint/rules）

报告: docs/reports/diagnose-YYYY-MM-DD.md
执行状态: ✅ 已启动 /implement Batch 1 / 📝 已写入 Roadmap / ⏭️ 只看报告
```

</workflow>
