# 数据库轻量迁移策略

本项目是单人本机使用，数据库是 `data/app.db`。当前不引入 Alembic，启动时由 `backend/app/database.py` 的 `init_db()` 做轻量迁移。

## 当前机制

1. `Base.metadata.create_all()` 负责创建新表。
2. 旧表新增列时，先用 `PRAGMA table_info(tasks)` 读取现有列。
3. 缺列时执行 `ALTER TABLE tasks ADD COLUMN ...`。
4. 需要回填旧数据时，紧跟一条 `UPDATE`。

已有迁移：

- `sort_order`：新增浮点排序列，旧任务按 `id` 初始化。
- `important`：从旧 `importance >= 6` 回填。
- `due_date`：从旧 `urgency >= 6` 回填为当天，否则为空。
- `last_due_date`：新增可空日期列，记住被清空前的截止日期；无需回填，旧行默认 `NULL`。

## 适用范围

可以继续用轻量迁移的情况：

- 给已有表新增可默认的列。
- 新列能用常量或现有列安全回填。
- 迁移可以重复执行，第二次启动不会再次修改数据。
- 失败时不会造成图片文件和数据库不一致。

不要直接塞进 `init_db()` 的情况：

- 删除列、改列类型、拆表、合表。
- 需要逐行复杂转换或人工确认。
- 会移动、删除、重命名 `data/uploads/` 里的图片文件。
- 运行时间可能明显变长，影响启动。

这些情况先写独立脚本，并在执行前复制整个 `data/` 目录。

## 新增列步骤

1. 修改 `backend/app/models.py` 的 ORM 字段。
2. 修改 `backend/app/schemas.py` 的输入输出字段。
3. 在 `backend/app/database.py` 的 `init_db()` 中追加缺列检查。
4. 如果前端要读写该字段，更新 `frontend/src/types.ts` 和 `frontend/src/api.ts`。
5. 补测试或验证脚本，至少运行：

```bash
bash scripts/verify-local.sh
```

## 代码模板

```python
result = await conn.execute(text("PRAGMA table_info(tasks)"))
columns = [row[1] for row in result]
if "new_column" not in columns:
    await conn.execute(text("ALTER TABLE tasks ADD COLUMN new_column TEXT NOT NULL DEFAULT ''"))
    await conn.execute(text("UPDATE tasks SET new_column = '' WHERE new_column IS NULL"))
```

注意：

- 新迁移必须写成幂等逻辑。
- `ALTER TABLE` 后的回填必须只依赖当前库里已经存在的字段。
- 新代码不要读写旧 `urgency / importance`，除非是在一次性迁移里做兼容回填。

## 执行前检查

- [ ] 已复制 `data/` 或确认改动只读。
- [ ] 本地服务能启动。
- [ ] `scripts/verify-local.sh` 通过。
- [ ] Roadmap / changelog 已记录迁移影响。
