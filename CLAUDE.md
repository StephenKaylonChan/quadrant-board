# quadrant-board

> 每日四象限任务面板，单人本机使用，Docker Compose 启动。

## 项目结构

- `docker-compose.yml` — 一条命令启动前后端，容器时区 MUST 为 `Asia/Shanghai`
- `backend/app/` — FastAPI 后端，API 端口 8000，接口文档 http://localhost:8000/docs
- `backend/app/routers/tasks.py` — 任务、图片接口和每日面板核心查询
- `backend/app/routers/ai.py` — AI 拆任务草稿，调用 OpenAI 兼容接口
- `backend/app/routers/maintenance.py` — 数据规模统计与上传文件对账，全部只读
- `backend/app/routers/auth.py` / `auth.py` — 登录鉴权接口与密码哈希、签名 cookie、`require_auth` 守卫
- `backend/app/models.py` / `schemas.py` — ORM 表结构和 API 输入输出模型
- `frontend/src/` — React + Vite 前端，开发端口 5173
- `frontend/src/components/` — 四象限、散点、卡片、编辑弹窗、灯箱、错误边界等组件
- `data/` — SQLite 数据库和上传图片，MUST 视为运行期数据
- `docs/` — 架构文档、路线图、Spec 和开发文档

## 常用命令

```bash
docker compose up -d              # 启动前后端
docker compose up -d --build      # 依赖或 Dockerfile 变化后重建
docker compose logs -f            # 查看日志
docker compose down               # 停止服务
curl http://localhost:8000/api/health  # 后端健康检查
docker compose exec frontend npm run build     # 前端类型检查 + 构建
docker compose exec frontend npm run smoke:api # 基础接口冒烟检查
```

## 技术栈

- 前端: React 19、React DOM 19、TypeScript 5.7、Vite 6，手写 CSS，无 UI 库
- 后端: Python 3.12、FastAPI、SQLAlchemy 2.0 async、aiosqlite、Pydantic 2
- 数据库: SQLite，本地文件 `data/app.db`
- 包管理: 前端 npm，后端 `requirements.txt` + pip，整体 Docker Compose

## 开发约束

- MUST 使用 `important + due_date` 表达四象限：上下看 `important`，左右看 `due_date 是否为空`。
- MUST NOT 在新代码读写 `urgency / importance` 旧打分字段 — why: 旧列只为兼容老库保留，对外 API 已不暴露。
- MUST NOT 让客户端直接设置 `last_due_date` — why: 它是后端不变式,只在 `update_task` 里 `due_date` 由非空变 `null` 时自动记原值,只读暴露;前端拖回有期限象限时按 `due_date ?? last_due_date ?? 今天` 还原。
- MUST 保持任务不属于某一天：某天 D 的面板 = `created_date <= D 且 (completed_date 为空 或 >= D)`。
- MUST NOT 引入每日快照表 — why: 自动结转和历史回放都依赖同一个查询语义。
- MUST 保持 `done` 才写 `completed_date`；`review` 是待审状态，`verify` 是待真实环境验证状态，MUST 留在面板上不归档。
- MUST 使用 `sort_order` 浮点插队排序；有期限象限先按 `due_date` 近远，同一天内再按 `doing > verify > todo > review` 和 `sort_order`；无期限象限先按状态再按 `sort_order`。
- UI 层 MUST 使用顶部三段视图切换：`当前 / 待 Review / 归档`。`review` 不进入“当前”视图；`verify` 仍留在“当前”，作为需要自己收口的事项。
- MUST 通过 `toDateStr` 手拼本地日期字符串；MUST NOT 用 `toISOString()` 生成业务日期。
- MUST NOT 提交或打印 `.env`；AI 密钥只在项目根 `.env`，变更后用 `docker compose up -d` 重建。
- MUST 新建 ORM `Task` 时显式传 `images=[]`，避免 async SQLAlchemy 序列化触发懒加载。
- MUST 保持界面文案和代码注释为中文；对新概念的说明一次只引入一个。

## 交互约束

- 图片卡片缩略图点击 = 复制剪贴板；弹窗点图 = 自制灯箱；灯箱复制按钮走剪贴板 API，右键保留浏览器原生复制菜单兜底。
- 删除任务 MUST 二次确认，MUST 使用 App 层 `confirm-layer`，MUST NOT 用 `window.confirm`。
- 编辑弹窗点外部时，有未保存内容 MUST 弹「保存 / 不保存 / 继续编辑」三选一。
- 主题 MUST 使用 CSS 变量；深色在 `[data-theme='dark']` 整组覆盖，MUST NOT 写死大面积深彩色块。
- 阅读模式是纯 CSS 专注开关：MUST 只用 `.app` 的 `reading-mode` class 隐藏外围 chrome，MUST NOT 借它改数据或象限逻辑；只对象限布局生效，进入时 MUST 清空筛选。
- AI 拆任务只产草稿，不直接入库；多条草稿 MUST 逐条弹预填 `TaskEditor`，保存才入库。
- AI Prompt 标题 MUST 是 15-25 字现象列举式概括，时间点和数值细节 MUST 放入 `description`。

## 完成标准

### 代码验证

1. 运行 `curl http://localhost:8000/api/health`，确认后端可用。
2. 涉及前端或类型变化时，运行 `docker compose exec frontend npm run build`。
3. 关键交互改动 MUST 手动回归：拖拽、历史日期、done/review/verify、图片复制、AI 草稿、今日同步、弹窗关闭确认。
4. 检查边界条件：空标题、无期限、过期日期、图片类型/大小、AI 未配置、历史面板只读。
5. 接口链路变更时运行 `docker compose exec frontend npm run smoke:api`；它不覆盖拖拽、粘贴图片、灯箱复制等浏览器交互。

### 进度同步

6. 更新 `docs/roadmap/` 对应 checkbox。
7. 如有关联 Spec，更新 `[x]`、Gate、`active_phase`。
8. Spec 全部完成后，将 status 更新为 `implemented` 并建议 `/done`。
9. Roadmap Phase 全部完成后，建议执行 `/release`。

## Git 提交规范

当前目录是 Git 仓库，默认分支 `main` 跟踪 `origin/main`，远端为 `https://github.com/StephenKaylonChan/quadrant-board.git`。commit MUST 使用 Conventional Commits：

```text
<type>(<scope>): <subject>
type: feat | fix | docs | refactor | perf | test | chore
```

提交前 MUST 确认 `.env`、`data/`、`frontend/dist/`、`.idea/` 和本地 session-notes 仍然只作为 ignored 文件存在。

## 关键架构决策

- 四象限由 `important + due_date` 派生，避免维护主观 1-10 紧急度。
- 任务按日期查询形成每日视图，不建快照表，减少数据重复。
- 图片存本地 `data/uploads/`，数据库只存文件名。
- 前端不引入 UI 库，保持暖纸色手帐风格和轻量维护成本。
- AI 只生成草稿，不自动入库，人工确认是数据质量边界。
- 登录鉴权按 env 在场与否自动开关（`APP_PASSWORD`+`SESSION_SECRET` 配齐才开），本机开发免登录、生产必配；凭据加盐哈希存数据库、env 仅作首次种子，登录态是无状态签名 cookie。详见 `docs/DEPLOYMENT.md` §2。

## 引用文档

@docs/architecture/README.md
@docs/roadmap/README.md
@docs/roadmap/phase-3-规划与回顾能力.md
