# 上手指南

## 环境要求

- Docker Desktop
- 浏览器
- 如需直接跑前端构建，需要本机 Node.js 20+ 和 npm
- 如需直接跑后端，需要 Python 3.12

## 首次运行

如果是新机器，先拉取仓库：

```bash
git clone https://github.com/StephenKaylonChan/quadrant-board.git
cd quadrant-board
```

本机已有项目目录时，直接在项目根目录启动：

```bash
docker compose up -d
```

首次启动会构建后端镜像并安装前端依赖。启动后访问：

- 前端：http://localhost:5173
- 后端文档：http://localhost:8000/docs
- 健康检查：http://localhost:8000/api/health

查看日志：

```bash
docker compose logs -f
```

停止服务：

```bash
docker compose down
```

前端和后端代码都通过 volume 挂进容器。普通代码修改会热重载；改 `backend/requirements.txt` 或 `frontend/package.json` 后，需要重新构建或重启对应容器。

## AI 配置

AI 拆任务读取项目根 `.env`：

```text
LLM_BASE_URL=...
CHAT_MODEL=...
LLM_API_KEY=...
```

`.env` 已被忽略，MUST NOT 提交或打印。未配置时 AI 输入框隐藏，其余功能可用。

修改 `.env` 后运行：

```bash
docker compose up -d
```

## 数据位置

- SQLite 数据库：`data/app.db`
- 上传图片：`data/uploads/`

备份项目数据时，重点备份整个 `data/` 目录。

## 常用验证

```bash
curl http://localhost:8000/api/health
docker compose exec frontend npm run build
docker compose exec frontend npm run smoke:api
```

`smoke:api` 会创建一个临时任务，验证健康检查、任务列表、完成日期、恢复和删除链路，结束时自动清理。它覆盖不了拖拽、粘贴图片和灯箱复制，关键交互改动仍需要手动回归。前端依赖安装在 Docker volume 内，宿主机没有 `node_modules` 时，优先在容器里跑构建验证。

## 视觉调试（可选）

需要让 AI 助手直接看到页面渲染、做前端视觉迭代时，可挂 Playwright MCP 让助手自主截图，免去人工逐张截图：

```bash
claude mcp add playwright -- npx -y @playwright/mcp@latest   # 一次性；装完需重启 Claude Code 工具才加载
```

截图 MUST 按浏览器真实 CSS 宽度复现：4K 显示器若是 Retina 2 倍屏，逻辑分辨率约 `1920×1080`（`system_profiler SPDisplaysDataType` 看 `UI Looks like` 那行），按 1920 宽截图才与肉眼一致；用错宽度（如 1440）会逼出额外换行、得出错误的布局结论。截图产物落在 `.playwright-mcp/`，已被 git 忽略。

## 项目结构

```text
backend/app/main.py               FastAPI 入口、路由和静态目录
backend/app/routers/tasks.py      任务、每日面板和图片接口
backend/app/routers/ai.py         AI 拆任务草稿接口
backend/app/routers/maintenance.py 数据规模统计与上传文件对账（只读）
backend/app/orphan_uploads.py     磁盘与数据库文件对账工具
backend/app/database.py           async SQLAlchemy 连接、建表和轻量迁移
frontend/src/App.tsx              单页应用状态容器
frontend/src/api.ts               前端请求封装
frontend/src/components/          四象限、散点、卡片、编辑弹窗、AI 输入、灯箱和错误边界
frontend/src/taskViews.ts         视图切分、筛选谓词和收口建议
frontend/src/taskReview.ts        周回顾统计与提示词
frontend/src/taskReports.ts       今日同步、导出和 AI 复盘提示词
frontend/src/dates.ts             本地时区日期字符串工具
frontend/src/styles.css           全局样式和主题变量
scripts/                          备份、恢复、孤儿图片清理和本地验证脚本
data/                             运行期数据库和上传图片
```
