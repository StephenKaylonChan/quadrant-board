# 后端架构

## 请求链路

1. FastAPI 在 `backend/app/main.py` 创建应用。
2. `lifespan` 启动时调用 `init_db()` 建表和补列。
3. `get_db()` 为每个接口请求创建一个 `AsyncSession`，请求结束自动关闭。
4. `/api/tasks` 和图片接口由 `routers/tasks.py` 提供。
5. `/api/ai/status` 和 `/api/ai/parse-task` 由 `routers/ai.py` 提供。
6. `/api/maintenance/*` 数据自检接口由 `routers/maintenance.py` 提供。
7. `/uploads` 通过 `StaticFiles` 暴露本地图片。

`main.py` 用 `/api` 前缀注册以上三个 router。

当前后端没有 Service / Repository 分层，也没有认证鉴权。业务逻辑集中在 router 内，适合这个单人本机工具；如果将来加入登录或多人同步，再拆中间层。

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

`init_db()` 只做轻量迁移：`create_all()` 建新表，但不会给旧表补列，所以新字段需要沿用当前 `PRAGMA table_info(tasks)` 后 `ALTER TABLE` 的模式。已有迁移包括 `sort_order`、`important`、`due_date` 和 `last_due_date`（可空、无需回填）；`status`、`created_date`、`completed_date` 等早期列已经在现有库中存在。具体操作边界见 `docs/development/database-migrations.md`。

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
