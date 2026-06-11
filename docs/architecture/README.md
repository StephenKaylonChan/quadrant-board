# 架构总览

## 模块划分

- `docs/architecture/background.md` 记录项目来源、真实工作流痛点和核心产品目标。
- `frontend/src/App.tsx` 是单屏应用的状态容器，负责日期、主题、AI 草稿队列、删除确认和任务加载。
- `frontend/src/components/QuadrantBoard.tsx` 负责四象限分组、排序、完成折叠和拖拽落点计算。
- `frontend/src/components/TaskEditor.tsx` 负责新建 / 编辑、图片粘贴、上传删除、未保存关闭确认和任务删除。
- `frontend/src/components/TaskCard.tsx` 负责卡片展示、象限内序号、缩略图复制和卡片级拖放。
- `frontend/src/components/AiQuickAdd.tsx` 负责一句话拆任务入口，只把草稿交回 `App`。
- `frontend/src/components/Lightbox.tsx` 负责图片预览，复制按钮和右键复制都走 `clipboard.ts`。
- `frontend/src/api.ts` 是前端唯一 API 访问层，组件不直接拼后端请求。
- `backend/app/main.py` 组装 FastAPI、CORS、路由和 `/uploads` 静态目录。
- `backend/app/routers/tasks.py` 负责任务 CRUD、每日面板查询和图片上传删除。
- `backend/app/routers/ai.py` 负责 AI 拆任务草稿，不写数据库。
- `backend/app/database.py` 负责 async SQLAlchemy 连接、建表和轻量迁移。

## 数据流

1. 前端通过 Vite 代理访问 `/api` 和 `/uploads`，本地开发时浏览器只访问 `localhost:5173`。
2. 后端通过 FastAPI router 接收请求，使用 Pydantic schema 校验。
3. `get_db()` 为每个请求提供独立 async session，SQLAlchemy 读写 SQLite `data/app.db`。
4. 图片文件落盘到 `data/uploads/`，数据库只保存 uuid 文件名和原始文件名。
5. 前端拖拽时先乐观更新，接口完成后重新拉取任务列表，以后端结果作为最终状态。

## 核心状态模型

- 任务主字段是 `important: boolean` 和 `due_date: date | null`。
- 旧 `urgency / importance` 只为兼容老数据库保留，新代码不读写。
- 每日面板不是快照，按日期查询任务是否出现在当天。
- `done` 任务用 `completed_date` 决定历史可见性；UI 用顶部三段视图切换 `当前 / 待 Review / 归档`。`review` 和 `done` 不进入当前重点视图,`verify` 继续留在当前视图。
- 有期限任务的紧急感来自 `due_date` 距离今天的远近，不再需要人工打紧急度分。

## 非直觉决策

- 不建每日快照表：自动结转和历史回放用同一个查询维护，避免重复数据。
- 有期限象限先按截止日期近远排序，同一天内再按状态和手动顺序；无期限象限先按状态再按手动顺序。
- AI 只产草稿：模型输出必须经过编辑弹窗人工确认，保存后才入库。
- 图片复制统一走前端剪贴板能力：非 PNG 会先转成 PNG，`clipboard.write` 在点击/右键手势里立即触发，避免浏览器异步权限丢失。
- 本地数据目录是产品核心资产：备份项目时重点备份 `data/`。
