---
name: audit
description: |
  浅层快速巡检项目健康状况（5-10 分钟）。只发现问题，不改代码。
  默认标准模式；`--deep` 加构建/测试覆盖率；`--security` 专项安全扫描。
  触发关键词：健康检查、audit、快速巡检、代码质量检查、依赖检查
argument-hint: "[--deep | --security | 空=标准]"
allowed-tools: Read, Bash, Grep, Glob
disable-model-invocation: true
---

<task>
对项目进行浅层快速巡检，发现"明显问题"。
**只发现问题 + 询问修复策略，不自动改代码/文档**（代码归 `/implement`，文档归 `/docs`）。
</task>

<workflow>

## Step 0: 读取项目实际命令

从项目上下文推断实际 lint / test / build 命令（**不硬编码**）：

1. 读 `CLAUDE.md` 的"常用命令"段落
2. 读 `package.json` 的 `scripts` 字段
3. 推断出的命令写入内部变量：`LINT_CMD`、`TEST_CMD`、`BUILD_CMD`

**推断失败**（找不到这些命令） → AskUserQuestion：
```
Question: 未找到项目的 lint / test / build 命令，如何处理？

Options:
1. 跳过相关检查（只做不依赖这些命令的项目）
2. 手动指定命令（自由输入）
```

## Step 1: 基本信息

```bash
echo "=== 项目审计 $(date '+%Y-%m-%d %H:%M') ==="
echo "--- 最近 5 个 commit ---"
git log --oneline -5
echo "--- 未提交文件 ---"
git status --short | head -20
```

## Step 2: 解析参数

| 参数 | 执行哪些 Step | 适用场景 |
|------|-------------|---------|
| 无参数 | Step 3（标准）+ Step 6（报告） | 日常 / 每周 / PR 前 |
| `--deep` | Step 3 + Step 4（构建测试）+ Step 6 | 大版本发布前 |
| `--security` | Step 5（安全专项）+ Step 6 | 上线前 / 定期安全审计 |

## Step 3: 标准巡检

### 3a. 代码质量

```bash
# Lint（从 Step 0 推断）
$LINT_CMD 2>&1 | tail -5

# TODO/FIXME/HACK 统计（自适应识别源码目录）
# 根据项目结构自动选择目录（apps/、src/、packages/ 等）
find . -type f \( -name "*.ts" -o -name "*.tsx" -o -name "*.py" -o -name "*.java" \) \
  -not -path '*/node_modules/*' -not -path '*/.git/*' -not -path '*/dist/*' \
  -exec grep -l "TODO\|FIXME\|HACK\|XXX" {} \; 2>/dev/null | wc -l
```

### 3b. 依赖健康（自适应包管理器）

```bash
# 检测包管理器
if [ -f pnpm-lock.yaml ]; then PM=pnpm; fi
if [ -f yarn.lock ]; then PM=yarn; fi
if [ -f package-lock.json ]; then PM=npm; fi
if [ -f poetry.lock ]; then PM=poetry; fi
if [ -f pyproject.toml ] && [ -z "$PM" ]; then PM=pip; fi

# 过时依赖 + 漏洞扫描（按包管理器）
case "$PM" in
  pnpm|npm|yarn) $PM outdated 2>/dev/null | head -20; $PM audit --audit-level=high 2>&1 | tail -10 ;;
  poetry) poetry show --outdated 2>/dev/null | head -20 ;;
  pip) pip list --outdated 2>/dev/null | head -20 ;;
esac
```

### 3c. 文档同步（原 --docs，现在合并到标准）

- [ ] CLAUDE.md 是否 < 200 行？（`wc -l CLAUDE.md`）
- [ ] 技术栈版本与 package.json 一致？
- [ ] `.claude/rules/` 的 paths glob 是否仍然匹配实际文件？
- [ ] `docs/roadmap/` 与 CLAUDE.md 中 `@` 引用一致？
- [ ] `docs/specs/` 中是否有 `status: implementing` **超过 2 周** 且无相关 commit 的 stale spec？
- [ ] 是否有 `status: approved` 但**从未开始实施**的 spec？

### 3d. Git 状态

- [ ] 未提交文件数（> 20 → 提醒）
- [ ] 未推送 commit 数（提醒 push）
- [ ] 是否有 WIP commit 累积 > 3 天未整理？

## Step 4: `--deep` 额外检查

```bash
# 构建（从 Step 0 推断）
$BUILD_CMD 2>&1 | tail -5

# 测试覆盖率（从 Step 0 推断）
$TEST_CMD --coverage 2>&1 | tail -10
```

## Step 5: `--security` 专项安全

### 5a. 硬编码密钥扫描（优先 gitleaks）

```bash
# 优先用 gitleaks（更精准，误报低）
if command -v gitleaks &>/dev/null; then
  gitleaks detect --no-git --redact 2>&1 | tail -20
else
  # fallback 到 grep（不推荐，误报多）
  echo "⚠️ gitleaks 未安装，建议：brew install gitleaks"
  find . -type f \( -name "*.ts" -o -name "*.py" -o -name "*.java" \) \
    -not -path '*/node_modules/*' -not -path '*/.git/*' \
    -exec grep -iE "(password|secret|api[_-]?key|token)\s*=\s*['\"][^'\"]+['\"]" {} + \
    2>/dev/null | grep -v "test\|spec\|example" | head -10
fi
```

### 5b. 环境文件检查

- [ ] `.env` 是否在 `.gitignore`？
- [ ] `.env.example` 是否存在（模板可复制）？
- [ ] 未跟踪的 `.env*` 文件列表（可能被误提交）

### 5c. 依赖漏洞高危

```bash
# 只看 high / critical 级别
case "$PM" in
  pnpm|npm|yarn) $PM audit --audit-level=high 2>&1 ;;
esac
```

## Step 6: 历史对比 + 输出报告

### 6a. 读取上次审计结果（如有）

```bash
LAST_REPORT=$(ls -t docs/reports/audit-*.md 2>/dev/null | head -1)
```

有则读取关键数值（CLAUDE.md 行数、过时依赖数、未提交文件数等）用于趋势对比。

### 6b. 写入本次报告

路径：`docs/reports/audit-YYYY-MM-DD.md`

内容：

```markdown
# 项目审计报告 - YYYY-MM-DD

**模式**: 标准 / --deep / --security

## 总览（含趋势对比）

| 维度 | 状态 | 数值 | 上次 | 趋势 |
|------|------|-----|------|------|
| 代码质量 | ✅/⚠️/❌ | [N] warnings | [M] | ↑/↓/→ |
| 依赖健康 | ✅/⚠️/❌ | [N] 过时 / [M] 高危 | ... | ... |
| 文档同步 | ✅/⚠️/❌ | CLAUDE.md [N] 行 | [M] | ... |
| Git 状态 | ✅/⚠️/❌ | [N] 未提交 / [M] 未推送 | ... | ... |

## 🔴 P0 立即处理
[Critical 问题]

## 🟡 P1 本周处理
[Warning 问题]

## 🟢 P2 有空再说
[Info 问题]

## 📈 趋势分析
[和上次对比：哪些恶化，哪些改善]
```

### 6c. AskUserQuestion 引导修复

**有问题** → 弹窗：

```
Question: 发现问题：P0 [X] 个 / P1 [Y] 个 / P2 [Z] 个。下一步？

Options:
1. (Recommended) 只看报告，我自己决定（报告已写入 docs/reports/）
2. 启动 /implement 批量修复（按 P0 → P1 → P2 顺序）
3. 只处理 P0（立即修复 Critical）
4. 生成 TODO 清单到 Roadmap（留给后续）
```

选 2/3 → 调用 /implement 批量模式执行修复。
选 1/4 → 仅输出报告。

## Step 7: 输出确认

```
✅ 审计完成（模式：标准 / --deep / --security）

━━━━━━━━━━━━━━━━━━━━━━━━
问题统计：P0 [X] / P1 [Y] / P2 [Z]
趋势：[恶化 / 持平 / 改善]（对比 [上次日期]）
━━━━━━━━━━━━━━━━━━━━━━━━

报告：docs/reports/audit-YYYY-MM-DD.md
下一步：[根据弹窗选择输出]
```

</workflow>
