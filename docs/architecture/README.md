# 架构总览

## 模块划分

- `docs/architecture/background.md` 记录项目来源、真实工作流痛点和核心产品目标。
- `frontend/src/App.tsx` 是单页应用的状态容器，负责日期、主题、视图与布局切换、AI 输入区收起、阅读模式、搜索筛选、AI 草稿队列、周回顾、备份弹窗、删除确认和任务加载。
- `frontend/src/components/QuadrantBoard.tsx` 负责四象限分组、排序、完成折叠和拖拽落点计算。
- `frontend/src/components/TaskScatter.tsx` 负责散点坐标布局，把任务按时限压力和重要性摊在一屏。
- `frontend/src/components/TaskEditor.tsx` 负责新建 / 编辑、图片粘贴、上传删除、未保存关闭确认和任务删除。
- `frontend/src/components/TaskCard.tsx` 负责卡片展示、象限内序号、卡片快捷操作、缩略图复制和卡片级拖放。
- `frontend/src/components/AiQuickAdd.tsx` 负责一句话拆任务入口，只把草稿交回 `App`。
- `frontend/src/components/Lightbox.tsx` 负责图片预览，复制按钮走 `clipboard.ts`，右键保留浏览器原生菜单兜底。
- `frontend/src/components/ErrorBoundary.tsx` 包裹应用根做渲染异常兜底。
- `frontend/src/taskViews.ts` / `taskReview.ts` / `taskReports.ts` / `statusMeta.ts` 分别集中视图筛选与收口建议、周回顾统计、导出与同步、状态元数据等纯逻辑。
- `frontend/src/api.ts` 是前端唯一 API 访问层，组件不直接拼后端请求。
- `backend/app/main.py` 组装 FastAPI、CORS、路由和 `/uploads` 静态目录。
- `backend/app/routers/tasks.py` 负责任务 CRUD、每日面板查询和图片上传删除。
- `backend/app/routers/ai.py` 负责 AI 拆任务草稿，不写数据库。
- `backend/app/routers/maintenance.py` 负责数据规模统计和上传文件对账，全部只读。
- `backend/app/orphan_uploads.py` 是磁盘与数据库文件对账工具，被维护接口和清理脚本共用。
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
- `last_due_date` 记住「被清空前的截止日期」：由后端在 `due_date` 由非空变 `null` 时自动写入，只读暴露，客户端不直接设置。供拖回有期限象限时还原原日期，避免拖去无期限象限再拖回时丢失日期。
- 每日面板不是快照，按日期查询任务是否出现在当天。
- `done` 任务用 `completed_date` 决定历史可见性；UI 用顶部三段视图切换 `当前 / 待 Review / 归档`。`review` 和 `done` 不进入当前重点视图,`verify` 继续留在当前视图。
- 有期限任务的紧急感来自 `due_date` 距离今天的远近，不再需要人工打紧急度分。

## 非直觉决策

- 不建每日快照表：自动结转和历史回放用同一个查询维护，避免重复数据。
- 有期限象限先按截止日期近远排序，同一天内再按状态和手动顺序；无期限象限先按状态再按手动顺序。
- AI 只产草稿：模型输出必须经过编辑弹窗人工确认，保存后才入库；拆解时附带当前标题做去重参考，结果是一条可回退的草稿队列。
- 散点视图不是新数据，是 `important + due_date + status` 的另一种坐标呈现；筛选与回顾统计都由前端纯函数派生，后端只提供原始任务列表。
- 截止日期的「记忆」由后端守约束、前端管交互：后端在清空时自动记 `last_due_date`，前端拖回时按 `due_date ?? last_due_date ?? 今天` 还原；乐观更新清空时也同步本地 `last_due_date`，避免 reload 返回前快速拖回还原失败。
- 阅读模式是纯前端的「专注开关」：用 CSS class `reading-mode` 隐藏外围 chrome 并瘦身顶栏，不改数据、不碰象限逻辑；只对象限布局生效，进入时清空筛选避免看到子集却以为是完整面板。
- 跨象限拖拽收尾不只依赖 `dragend`：卡片换象限会被 React 销毁重建导致其 `dragend` 不触发，所以在「放下」路径里就清拖拽态，否则卡片会一直半透明卡住。
- 维护接口只读：文件对账区分“孤儿文件”（磁盘有库无）和“缺失文件”（库有磁盘无），实际删除留给确认后的脚本，避免接口误删数据。
- 图片复制优先走前端剪贴板能力：非 PNG 会先转成 PNG，灯箱打开时会预先准备可写入的 PNG；如果浏览器拒绝程序化写入，右键图片仍可使用浏览器原生复制菜单。
- 本地数据目录是产品核心资产：备份项目时重点备份 `data/`。
