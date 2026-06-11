# quadrant-board 项目说明(给 Codex)

每日四象限任务面板,单人本机使用,Docker Compose 启动。

## 技术栈
- 后端:FastAPI + SQLAlchemy 2.0(async)+ SQLite(aiosqlite),图片存 `data/uploads/`
- 前端:React 19 + Vite 6 + TypeScript,无 UI 库,手写 CSS(暖纸色手帐风格)
- 启动:`docker compose up -d`,前端 :5173(Vite 代理 /api、/uploads 到后端),后端 :8000

## 核心设计(改动前必读)
- 任务不属于某一天。某天 D 的面板 = `created_date <= D 且 (completed_date 为空 或 >= D)` 的任务,见 `backend/app/routers/tasks.py` 的 list_tasks。未完成任务自动结转、历史可回放,都靠这一个查询,不要引入"每日快照表"。
- 象限是派生的:任务主模型是 `important`(重要/不重要) + `due_date`(有期限/无期限),见 `backend/app/models.py`、`frontend/src/types.ts` 和 `QuadrantBoard.tsx`。旧 `urgency / importance` 打分列只为兼容老库保留,新代码不要读写。
- 跨象限拖拽只改最小必要字段:`important`、`due_date`、`sort_order`。拖到左列会清空 `due_date`;拖到有期限象限的卡片附近会沿用落点卡片的截止日期;落在空白处默认保留原日期或填今天。
- 手动排序用 `sort_order`(float,取前后邻居中间值实现"插队");有期限象限先按 `due_date` 近远,同一天再按状态(`doing`/`verify`/`todo`/`review`)和 `sort_order`;无期限象限先按状态再按 `sort_order`。`database.py` 的 init_db 里有给老库补列的迁移逻辑,加新列照这个模式做。
- 主题:浅/深/系统三模式,localStorage 键 `qb-theme`;颜色全部走 CSS 变量,深色在 `[data-theme='dark']` 整组覆盖,新样式禁止写死颜色。深色设计原则(用户确认过):底色近中性暖炭、象限底色只带一丝色相,身份靠提亮的标题色——别用大面积深彩色块(会"阴间")。
- 图片交互:卡片缩略图点击=复制剪贴板(`clipboard.ts`,非 PNG 走 canvas 转码,`clipboard.write` 必须尽早发生在用户手势里);弹窗点图开自制灯箱 `Lightbox.tsx`,灯箱内有"复制图片"按钮,右键也会复制(拦截 contextmenu)。
- AI 拆任务:`routers/ai.py` 调 OpenAI 兼容接口(httpx),只产草稿不入库;前端拆完把草稿队列交给 App,逐条弹预填的 TaskEditor(key 用序号强制重挂载),保存才入库。密钥在项目根 `.env`(gitignore 了,绝不能提交/打印),改了要 `docker compose up -d` 重建。
- Prompt 风格(用户明确要求):标题=现象列举式高度概括(15~25 字),时间点/数值等细节一律进 description;改 SYSTEM_PROMPT 时保留里面的正反例。
- 任务状态五档:todo / doing / review(PR 待审,轮到别人处理,不归档)/ verify(已合并待真实环境验证,轮到自己收口,不归档)/ done;只有 done 会写 completed_date 进归档。AI 拆解也输出 status(SYSTEM_PROMPT 里有关键词映射),TaskCreate 接受 status。
- UI 展示层:review 仍是未完成状态,但默认折叠到象限标题右侧的"待 Review"等待区,不占主列表重点;verify 仍在主列表展示,因为还需要自己真实环境验证收口。
- 卡片上直接展示:位置序号(象限内 1 起,跟拖拽顺序)、备注正文(.card-desc 两行 line-clamp)、悬停 × 删除(App 层 deleting 状态 + confirm-layer 二次确认,删除一律要二次确认,别用 window.confirm)。
- 编辑弹窗点外部:有未保存内容弹三选一确认(TaskEditor 的 hasUnsaved / attemptClose),别改成静默关闭或无反应。
- 时区:容器内 TZ=Asia/Shanghai(compose 里设置),前后端的"今天"都基于本地时区;前端日期字符串用 toDateStr 手拼,禁止 toISOString(那是 UTC)。
- async SQLAlchemy 注意:关系用了 `lazy="selectin"`;新建对象时显式传 `images=[]` 避免序列化时触发异步懒加载报错。

## 约定
- 界面文案、代码注释一律中文。
- 用户是转行初学者:改动要附带讲解,新概念一次只引入一个,非显然的语法点一句。
- 测试方式:`curl http://localhost:8000/api/health`;前端构建 `docker compose exec frontend npm run build`;基础接口冒烟 `docker compose exec frontend npm run smoke:api`;接口文档 http://localhost:8000/docs。
