---
name: visual
description: |
  把项目数据渲染成可视化 HTML 仪表盘，替代难以阅读的长 Markdown 报告。
  生成零依赖、自包含的单 HTML 文件，浏览器直接打开。
  支持场景：roadmap 进度、audit 报告、跨文件变更地图、自由主题。
  触发关键词：可视化、visual、仪表盘、dashboard、HTML 报告
argument-hint: "[场景：roadmap / audit / changes / 或自由描述]"
allowed-tools: Read, Bash, Glob, Grep, Write
disable-model-invocation: true
---

<task>
读取项目数据，生成一个自包含的 HTML 可视化文件。替代长 Markdown 报告，让人 5 秒扫完关键信息。
输出到 `docs/reports/` 目录，自动在浏览器中打开。
</task>

<workflow>

## Step 0: 确定场景

读取 `$ARGUMENTS` 判断场景：

| $ARGUMENTS | 场景 | 数据源 |
|-----------|------|--------|
| `roadmap` | 项目进度仪表盘 | `docs/roadmap/`、README 版本记录 |
| `audit` | 审计报告可视化 | 最近的 `docs/reports/audit-*.md` |
| `changes` | 当前分支变更地图 | `git diff`、`git log` |
| 自由描述 | 按描述生成 | 根据描述判断数据源 |
| 空 | AskUserQuestion | 弹窗选场景 |

**无参数时 MUST 用 AskUserQuestion**：

```
Question: 要可视化什么？
Header: "场景"
Options:
1. Roadmap 进度仪表盘
2. Audit 报告可视化
3. 当前分支变更地图
4. 其他（自由描述）
```

## Step 1: 收集数据

根据场景读取对应数据源：

- **roadmap**：`docs/roadmap/README.md` + `docs/roadmap/phase-*.md` + README 版本记录
- **audit**：最近一份 `docs/reports/audit-*.md`
- **changes**：`git diff --stat` + `git log --oneline` + `git diff --name-only`
- **自由描述**：根据描述判断需要读哪些文件

## Step 2: 生成 HTML 文件

**MUST 遵循以下约束**：

1. **零外部依赖**：纯 HTML + inline `<style>` + inline `<script>`，无 CDN、无 import、无框架
2. **MUST 使用 `<design-system>` 的 CSS 变量**，保持所有输出视觉一致
3. **文件名**：`docs/reports/{场景}-{日期}.html`
4. **根据数据量选择布局模式**（见 `<layout-patterns>`）
5. **中文界面**

**生成后**：`open docs/reports/{文件名}.html`

## Step 3: 确认

输出一行摘要：已生成路径（行数，KB），已在浏览器打开。

</workflow>

<design-system>

## 暗色主题 CSS 变量

```css
:root {
  --bg: #111114;
  --surface: #1a1a1f;
  --surface-hover: #222228;
  --border: #2a2a32;
  --text: #e8e8ec;
  --text-secondary: #9a9aa8;
  --accent: #6bc4a0;
  --accent-light: #1a2e26;
  --done: #6bc4a0;    --done-bg: #1a2e26;
  --pending: #e5a84b;  --pending-bg: #2e2518;
  --blocked: #8888a0;  --blocked-bg: #1e1e28;
  --error: #e06c6c;    --error-bg: #2e1a1a;
  --serif: Georgia, 'Times New Roman', serif;
  --sans: system-ui, -apple-system, 'Segoe UI', sans-serif;
  --mono: 'SF Mono', 'Fira Code', 'Cascadia Code', monospace;
  --radius: 10px;
  --shadow: 0 2px 8px rgba(0,0,0,0.25), 0 1px 3px rgba(0,0,0,0.15);
}
```

## 排版规范

- `body`：`font-size: 1.12rem; line-height: 1.65; max-width: 1400px; padding: 2.5rem 3rem;`
- `h1`：`font-family: var(--serif); font-size: 2.2rem;`
- `h2`：`font-family: var(--serif); font-size: 1.5rem;`
- 条目标题 `1.08rem`、正文 `0.95rem`、统计数字 `2.5rem`
- `code`：`background: var(--surface-hover); color: var(--accent); font-family: var(--mono);`

## 通用组件

- 卡片：`background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius);`
- 筛选按钮：pill 形状，active 时 `background: var(--accent); color: var(--bg);`
- 进度条：`height: 6px; background: var(--border);` 填充用 `--accent`
- 状态圆点：24px，done/pending/blocked 用对应色对
- 响应式：768px 以下 grid 降为 2 列或 1 列

</design-system>

<layout-patterns>

## 布局模式

### 1. 仪表盘 — roadmap、项目概览
统计卡片行（4 列）→ 进度卡片 → 详细条目列表（筛选按钮）→ 待处理事项网格

### 2. 时间线 — 版本历史、事件序列
左侧竖线 + 圆点（里程碑实心）→ 月份分隔 → 每条：版本号 mono + 描述

### 3. 风险地图 — audit、安全扫描
顶部汇总条（P0/P1/P2 色块）→ 按严重程度分组 → 可折叠详情（details/summary）

### 4. 变更地图 — 跨文件变更、PR 概览
文件列表 + 增删色块 → 按目录分组 → 点击展开 diff 摘要

### 交互
筛选：onclick + classList。折叠：details/summary。拖拽：原生 drag API。导出：clipboard API。

</layout-patterns>

<notes>

- `/visual` 是只读可视化，不修改源文件
- 输出是一次性产物，`docs/reports/*.html` 建议加 `.gitignore`
- 不嵌入其他 skill 流程，独立调用

</notes>
