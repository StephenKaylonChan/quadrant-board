# quadrant-board

> 每日四象限任务面板，单人本机使用，Docker Compose 启动。

## 项目结构

- `docker-compose.yml` — 一条命令启动前后端，容器时区 MUST 为 `Asia/Shanghai`
- `backend/app/` — FastAPI 后端，API 端口 8000，接口文档 http://localhost:8000/docs
- `backend/app/routers/tasks.py` — 任务、图片接口和每日面板核心查询
- `backend/app/routers/ai.py` — AI 拆任务草稿，调用 OpenAI 兼容接口
- `backend/app/models.py` / `schemas.py` — ORM 表结构和 API 输入输出模型
- `frontend/src/` — React + Vite 前端，开发端口 5173
- `frontend/src/components/` — 四象限、卡片、编辑弹窗、灯箱等组件
- `data/` — SQLite 数据库和上传图片，MUST 视为运行期数据
- `docs/` — 架构文档、路线图、Spec 和开发文档

## 常用命令

```bash
docker compose up -d              # 启动前后端
docker compose up -d --build      # 依赖或 Dockerfile 变化后重建
docker compose logs -f            # 查看日志
docker compose down               # 停止服务
curl http://localhost:8000/api/health  # 后端健康检查
cd frontend && npm run build      # 前端类型检查 + 构建
```

## 技术栈

- 前端: React 19、React DOM 19、TypeScript 5.7、Vite 6，手写 CSS，无 UI 库
- 后端: Python 3.12、FastAPI、SQLAlchemy 2.0 async、aiosqlite、Pydantic 2
- 数据库: SQLite，本地文件 `data/app.db`
- 包管理: 前端 npm，后端 `requirements.txt` + pip，整体 Docker Compose

## 开发约束

- MUST 使用 `important + due_date` 表达四象限：上下看 `important`，左右看 `due_date 是否为空`。
- MUST NOT 在新代码读写 `urgency / importance` 旧打分字段 — why: 旧列只为兼容老库保留，对外 API 已不暴露。
- MUST 保持任务不属于某一天：某天 D 的面板 = `created_date <= D 且 (completed_date 为空 或 >= D)`。
- MUST NOT 引入每日快照表 — why: 自动结转和历史回放都依赖同一个查询语义。
- MUST 保持 `done` 才写 `completed_date`；`review` 是待审状态，MUST 留在面板上不归档。
- MUST 使用 `sort_order` 浮点插队排序；象限内排序分层（用户拍板）：已过期 > doing > review > todo，同层内按 `due_date` 近远，再按 `sort_order`。状态优先于日期。
- MUST 通过 `toDateStr` 手拼本地日期字符串；MUST NOT 用 `toISOString()` 生成业务日期。
- MUST NOT 提交或打印 `.env`；AI 密钥只在项目根 `.env`，变更后用 `docker compose up -d` 重建。
- MUST 新建 ORM `Task` 时显式传 `images=[]`，避免 async SQLAlchemy 序列化触发懒加载。
- MUST 保持界面文案和代码注释为中文；对新概念的说明一次只引入一个。

## 交互约束

- 图片卡片缩略图点击 = 复制剪贴板；弹窗点图 = 自制灯箱；灯箱右键 = 复制。
- 删除任务 MUST 二次确认，MUST 使用 App 层 `confirm-layer`，MUST NOT 用 `window.confirm`。
- 编辑弹窗点外部时，有未保存内容 MUST 弹「保存 / 不保存 / 继续编辑」三选一。
- 主题 MUST 使用 CSS 变量；深色在 `[data-theme='dark']` 整组覆盖，MUST NOT 写死大面积深彩色块。
- AI 拆任务只产草稿，不直接入库；多条草稿 MUST 逐条弹预填 `TaskEditor`，保存才入库。
- AI Prompt 标题 MUST 是 15-25 字现象列举式概括，时间点和数值细节 MUST 放入 `description`。

## 完成标准

### 代码验证

1. 运行 `curl http://localhost:8000/api/health`，确认后端可用。
2. 涉及前端或类型变化时，运行 `cd frontend && npm run build`。
3. 关键交互改动 MUST 手动回归：拖拽、历史日期、done/review、图片复制、AI 草稿、弹窗关闭确认。
4. 检查边界条件：空标题、无期限、过期日期、图片类型/大小、AI 未配置、历史面板只读。
5. 当前项目尚无自动测试；新增测试框架前，MUST 在变更说明里写清验证方式。

### 进度同步

6. 更新 `docs/roadmap/` 对应 checkbox。
7. 如有关联 Spec，更新 `[x]`、Gate、`active_phase`。
8. Spec 全部完成后，将 status 更新为 `implemented` 并建议 `/done`。
9. Roadmap Phase 全部完成后，建议执行 `/release`。

## Git 提交规范

当前目录可能不是 Git 仓库。若启用 Git，commit MUST 使用 Conventional Commits：

```text
<type>(<scope>): <subject>
type: feat | fix | docs | refactor | perf | test | chore
```

## 关键架构决策

- 四象限由 `important + due_date` 派生，避免维护主观 1-10 紧急度。
- 任务按日期查询形成每日视图，不建快照表，减少数据重复。
- 图片存本地 `data/uploads/`，数据库只存文件名。
- 前端不引入 UI 库，保持暖纸色手帐风格和轻量维护成本。
- AI 只生成草稿，不自动入库，人工确认是数据质量边界。

## 引用文档

@docs/architecture/README.md
@docs/roadmap/README.md
@docs/roadmap/phase-3-规划与回顾能力.md
