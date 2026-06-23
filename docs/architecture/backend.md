# 后端架构

## 请求链路

1. FastAPI 在 `backend/app/main.py` 创建应用。
2. `lifespan` 启动时调用 `init_db()` 建表和补列。
3. `get_db()` 为每个接口请求创建一个 `AsyncSession`，请求结束自动关闭。
4. `/api/auth/*` 登录鉴权接口由 `routers/auth.py` 提供。
5. `/api/tasks` 和图片接口由 `routers/tasks.py` 提供。
6. `/api/ai/status` 和 `/api/ai/parse-task` 由 `routers/ai.py` 提供。
7. `/api/maintenance/*` 数据自检接口由 `routers/maintenance.py` 提供。
8. `/uploads` 通过 `StaticFiles` 暴露本地图片。

`main.py` 用 `/api` 前缀注册以上四个 router；`tasks / ai / maintenance` 三组整组挂 `Depends(require_auth)` 守卫，`auth` 和 `/api/health` 保持开放。

当前后端没有 Service / Repository 分层，业务逻辑集中在 router 内，适合这个单人本机工具。登录鉴权见下方「登录鉴权」一节——个人单用户用「用户名 + 密码 + 签名 cookie」，不上多人同步 / OAuth。

## 数据模型

`Task` 是主表，`TaskImage` 是图片表。任务与图片是一对多关系，关系使用 `lazy="selectin"`，避免 async ORM 序列化阶段触发懒加载。

当前主字段：
- `important`：是否重要。
- `due_date`：截止日期，`null` 表示无期限。
- `last_due_date`：记住被清空前的截止日期，`null` 表示没有可还原的旧日期。
- `status`：`todo / doing / review / verify / done`。
- `sort_order`：手动排序浮点值。
- `created_date` / `completed_date`：决定任务在哪些日期出现。

旧字段 `urgency / importance` 只保留兼容老库，新代码不应读写。

`update_task` 维护两条字段不变式，都在 `setattr` 覆盖前读旧值：状态切到 `done` 写 `completed_date`、切回其它状态清空它；`due_date` 由非空变 `null` 时把旧值记入 `last_due_date`，供前端拖回有期限象限时还原。`last_due_date` 只在 `TaskOut` 输出、不在 `TaskUpdate` 输入，客户端无法直接设置。

`init_db()` 只做轻量迁移：`create_all()` 建新表，但不会给旧表补列，所以新字段需要沿用当前 `PRAGMA table_info(tasks)` 后 `ALTER TABLE` 的模式。已有迁移包括 `sort_order`、`important`、`due_date` 和 `last_due_date`（可空、无需回填）；`status`、`created_date`、`completed_date` 等早期列已经在现有库中存在。`init_db()` 末尾还调用 `_seed_credential()` 做登录账号种子（见下）。具体操作边界见 `docs/development/database-migrations.md`。

## 登录鉴权

个人单用户方案：用户名 + 密码 + 无状态签名 cookie，集中在 `auth.py` 和 `routers/auth.py`。

- **凭据存储**：单行表 `AppCredential`（`models.py`，固定 `id=1`）存用户名和 `pbkdf2_sha256` 加盐哈希后的密码，**不存明文**；哈希用标准库 `hashlib.pbkdf2_hmac`（20 万轮），不引第三方。
- **开关 + 种子**：`AUTH_ENABLED = bool(APP_PASSWORD and SESSION_SECRET)`，两个 env 都配齐才开启；本机不配即免登录（启动打 WARNING）。开启后首次启动 `_seed_credential()` 用 `APP_USERNAME` / `APP_PASSWORD` 建初始账号写库，**之后以数据库为准，env 不再覆盖**（库里有行就跳过种子）。
- **登录态**：登录成功签发 `qb_session` cookie，内容是「到期时间戳 + 用 `SESSION_SECRET` 做的 HMAC 签名」，后端无状态、不存 session 表，验票只是重算签名 + 比到期时间。cookie 属性 `HttpOnly + SameSite=Lax + 生产 Secure`。
- **守卫**：`require_auth` 依赖只读 cookie（不查库），挂在 `tasks / ai / maintenance` 三组路由；`AUTH_ENABLED` 为假时直接放行。`/api/health`、`/uploads` 和 `auth` 路由不在守卫内（health 要公开供健康检查、uploads 靠不可枚举 uuid 文件名兜底）。
- **接口**：`/api/auth/login`（用户名 + 密码，恒定时间比较）、`/logout`、`/status`（回带是否开启 / 是否登录 / 当前用户名）、`/account`（登录后自助改用户名 / 密码，需验证当前密码、新密码 ≥6 位，自身另挂 `require_auth`）。
- 生产环境变量与忘记密码处理见 `docs/DEPLOYMENT.md` §2。

## 每日面板查询

某天 D 的面板由以下条件决定：

```text
created_date <= D 且 (completed_date 为空 或 completed_date >= D)
```

这让未完成任务自动结转，也让历史日期可回放。不要引入每日快照表。

## 图片处理

上传接口校验 MIME 类型和 10MB 大小限制。文件名使用 uuid，避免覆盖和泄露原始文件名。数据库提交失败时，已写入磁盘的文件必须回滚删除。

删除任务时先读取图片文件名，数据库删除提交成功后再删除磁盘文件；删除单张图片也是先删数据库再删文件。这样优先保证数据库状态正确，磁盘残留最多是可清理的孤儿文件。

## AI 拆任务

AI 接口读取 `.env` 中的大模型配置，但不能打印密钥。后端按 OpenAI 兼容 `/chat/completions` 调用，`LLM_BASE_URL` 结尾斜杠会被容错处理。AI 只返回草稿数组，字段与 `TaskCreate` 对齐：`title`、`description`、`important`、`due_date`、`status`。

`SYSTEM_PROMPT` 会把“今天日期”和中文星期注入给模型，用来把“明天 / 周五前”换成具体日期。请求体把 `temperature` 调到 `0.3`，让判断类输出更稳定，调用整体设 30 秒超时，连接或解析失败统一返回 `HTTPException(502)`。

`parse-task` 还接收前端传来的 `existing_titles`（当前面板已有标题，清洗后最多 30 个），拼进用户消息作为“去重参考”，降低模型把同一件事重复拆一遍的概率。

模型输出会经过 `_parse_drafts()` 多层容错：支持单对象或数组、`{"tasks": [...]}` / `{"items": [...]}` 包裹，剥离可能的 ```json 代码块，非法日期按今天兜底，非法状态回退为 `todo`，最多保留 12 条草稿（`MAX_DRAFTS`）。

## 数据自检与文件对账

`routers/maintenance.py` 提供三个只读接口，给本机备份前确认数据规模和文件一致性用，不改任何数据：

- `GET /api/maintenance/upload-health`：对账磁盘文件与数据库记录。
- `GET /api/maintenance/cleanup-preview`：同上并标记 `mode: dry-run`，供前端预览将清理哪些孤儿文件。
- `GET /api/maintenance/summary`：汇总任务数、未完成 / 已完成数、图片数、数据库与上传目录占用，以及上传健康检查。

对账逻辑集中在工具模块 `orphan_uploads.py`，被 router 和独立脚本共用：`orphan`（在磁盘但数据库没有）= 磁盘文件集合减去数据库登记文件名；`missing`（数据库登记但磁盘缺失）= 反向差集。它另提供 `registered_filenames_from_sqlite()` 直接用 `sqlite3` 读库，让 `scripts/cleanup_orphan_uploads.py` 这类 CLI 不必拉起 FastAPI 和 async ORM。删除孤儿文件用 `unlink(missing_ok=True)`，避免文件已不在时报错。

## 错误处理

后端主要使用 FastAPI 默认 JSON 错误格式，业务错误通过 `HTTPException(detail=...)` 返回中文信息。前端 `api.ts` 会优先读取 `detail` 并抛成 `Error` 展示。

## 验证方式

FastAPI 自动生成接口文档：`http://localhost:8000/docs`。当前没有 pytest 配置，最低验证是 `curl http://localhost:8000/api/health`。基础接口回归由 `docker compose exec frontend npm run smoke:api` 覆盖任务创建、今日列表、完成日期、恢复、清空截止日期时 `last_due_date` 的记忆，以及删除；前端构建验证是 `docker compose exec frontend npm run build`。
