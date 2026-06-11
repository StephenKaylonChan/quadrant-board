---
name: fix-permission
description: |
  分析权限拦截原因并自动修复。当用户遇到 Codex 权限弹窗时使用。
  用户粘贴拦截信息，自动诊断原因、添加对应权限规则到 settings.json（用户/项目/项目本地三级可选）。
  触发关键词：权限拦截、permission、被拦截了、又来了、要确认
argument-hint: "<粘贴拦截信息>"
allowed-tools: Read, Edit, Bash
disable-model-invocation: true
---

<task>
分析用户遇到的 Codex 权限拦截，诊断原因，写入前预演确认，最后添加规则到用户选择的 settings.json 级别。
</task>

<workflow>

## Step 1: 解析拦截信息

从 `$ARGUMENTS` 中提取：
1. **被拦截的命令**（Bash command 后面的内容）
2. **拦截原因**（如 "Compound commands"、"backslash-escaped whitespace" 等）

## Step 2: 诊断原因

### Bash 类拦截

| 拦截提示 | 根因 | 需要的权限规则 |
|---------|------|--------------|
| Compound commands with cd and git | cd && git 复合命令 | `Bash(*)` 或 `Bash(cd * && git *)` |
| backslash-escaped whitespace | 路径含空格/中文 | `Bash(*)` 或对应命令的 `Bash(cmd *)` |
| command substitution $() | 命令替换 | `Bash(*)` 或 `Bash(for *)` 等 |
| quoted newline followed by # | 多行脚本带注释 | `Bash(*)` 或 `Bash(docker *)` |
| output redirection (>) | 输出重定向 | `Bash(*)` 或对应命令的 `Bash(cmd *)` |
| pipe command (\|) | 管道命令 | `Bash(cmd1 \| cmd2 *)` 或 `Bash(*)` |
| background process (&) | 后台运行 | `Bash(cmd * &)` 或 `Bash(*)` |
| Permission rule ... requires confirmation | 命令不在 allow 列表 | 添加对应 `Bash(cmd *)` 到 allow |

### Web 类拦截

| 拦截提示 | 根因 | 需要的权限规则 |
|---------|------|--------------|
| Codex wants to fetch content from X | 域名 X 不在 WebFetch allow | `WebFetch(domain:X)`（**首选用户级**，跨项目复用价值大） |
| WebSearch 弹窗 | 全局缺 WebSearch | `WebSearch`（**不带括号 / 无 domain 概念**，零风险全局开） |

> **💡 "Yes, and don't ask again" 的沉淀位置陷阱**
> 用户在弹窗点 "Yes, and don't ask again" 时，规则**默认写入 `./.Codex/settings.local.json`**（项目本地，gitignored）。
> - **后果**：跨项目浏览同一批技术博客 / 文档站时，每个新项目都要重新同意一遍
> - **建议**：定期把 `settings.local.json` 里高频 `WebFetch(domain:*)` 提升到用户级 `~/.Codex/settings.json`
> - **诊断信号**：用户反馈"经常被同一域名拦截" → 先 `cat ~/.Codex/settings.json` 看用户级是否覆盖

## Step 3: 读取三级 settings 配置

```bash
# 用户级（全局）
cat ~/.Codex/settings.json 2>/dev/null

# 项目级（版本控制，团队共享）
cat ./.Codex/settings.json 2>/dev/null

# 项目本地（gitignore，个人）
cat ./.Codex/settings.local.json 2>/dev/null
```

诊断：
- 三个级别哪个已有相关规则？
- 缺的是什么？
- 是否 deny 列表阻止了 allow（deny 优先级高）？

## Step 4: 诊断输出

### 情况 A：`Bash(*)` 已存在于 allow，但仍被拦截

这是 Codex 内置安全启发式。几种解法：

1. **更具体的规则**：尝试 `Bash(cmd *)` 替代宽泛的 `Bash(*)`，更具体的规则可能绕过启发式
2. **检查 deny**：`deny` 列表比 `allow` 优先级高，看是否被 deny 拦住
3. **Auto mode**：Shift+Tab 切到 Auto mode，分类器自动判定（安全操作放行）
4. **手动确认**：如果是一次性命令，直接点"Yes, and don't ask again"

### 情况 B：缺少对应权限规则

需要添加规则。**进入 Step 5 选择写入级别**。

### 情况 C：命令在 `deny` 列表中

明确被拒绝的命令（如 `rm -rf /`、`curl | bash`、`wget | sh`、`git push --force`）。

- 如果是安全拦截 → **告知用户，不建议放行**
- 用户确认要放行 → 进入 Step 5 但提示这是**高危操作**

## Step 5: AskUserQuestion 选择写入级别

**仅在情况 B/C 需要写入时询问**：

```
Question: 权限规则写到哪个级别？

Options:
1. (Recommended) 用户级（~/.Codex/settings.json）= 所有项目都生效，个人偏好
2. 项目级（./.Codex/settings.json）= 只当前项目 + 提交到 git（团队共享）
3. 项目本地（./.Codex/settings.local.json）= 只当前项目 + 不提交（个人项目特定）
```

**选择建议**：
- **WebFetch domain** → 用户级（跨项目复用价值大，技术博客 / 文档站浏览模式）
- **WebSearch**（无 domain）→ 用户级（零风险，搜索结果文本不直接抓任意 URL）
- 通用 Bash 命令（`ls`、`git status`）→ 用户级
- 项目特定脚本（`pnpm` / `poetry run` 等）→ 项目级（团队统一）
- 个人实验或敏感配置 → 项目本地

## Step 6: 预演写入规则

显示将要添加的规则 + AskUserQuestion 确认：

```
将在 [用户/项目/项目本地] 级 settings.json 的 permissions.allow 添加：

  "Bash(pnpm install *)"

之前该级别已有 [N] 条规则。添加后总 [N+1] 条。

Question: 确认添加？

Options:
1. (Recommended) 确认添加
2. 调整规则（自由输入更精确的规则）
3. 取消
```

## Step 7: 写入 settings.json

用户确认后，编辑对应级别的 `settings.json`：
- 如文件不存在 → 创建包含基础结构的新文件
- 如文件存在 → 读取 → 合并规则 → 写回（保持 JSON 格式化）

**精确 add**（如项目级）：
```bash
git add .Codex/settings.json  # 仅项目级才需要
```

## Step 8: 输出结果

```
✅ 权限规则已添加

━━━━━━━━━━━━━━━━━━━━━━━━
拦截命令: [命令摘要]
拦截原因: [原因分类]
处理方式:
  - 级别: [用户级 / 项目级 / 项目本地]
  - 规则: [具体规则，如 Bash(pnpm install *)]
  - 文件: [路径]
━━━━━━━━━━━━━━━━━━━━━━━━

需要重启 Codex 生效（退出后重新 Codex）。
下次遇到类似命令将自动放行。
```

</workflow>

## ⚠️ settings.local.json 残骸清理

Codex 在用户对包含 for-loop / heredoc / 复杂引号的命令点 "Yes, and don't ask again" 时，会**拆词错误**写入假权限规则，例如：

- `Bash(do)` / `Bash(done)` / `Bash(for f:*)` / `Bash(for file:*)` — for-loop 关键字被当成独立命令
- `Read(//tmp/**)` / `Read(//Users/...)` — 双斜杠路径残留
- `Bash(/tmp/verification_checklist.txt:*)` — 文件路径被当命令名

这些规则**无害但累赘**。可在 `/fix-permission` 跑完后扫一眼 `settings.local.json`，删除明显异常项。

## 与 `/fewer-permission-prompts` 的分工

Anthropic 提供 Bundled Skill `/fewer-permission-prompts`，自动扫 transcript 生成白名单（写到**项目级** `.Codex/settings.json`）。两者关系：

| 场景 | 用哪个 |
|------|-------|
| 拦截已发生，**单条规则**精确诊断 + 用户级写入 | **`/fix-permission`** |
| 项目长期使用后**批量补全**项目级白名单 | **`/fewer-permission-prompts`**（Bundled） |
| Web 类（WebFetch domain）跨项目复用 | **`/fix-permission`** → 用户级（`/fewer-permission-prompts` 只写项目级） |
