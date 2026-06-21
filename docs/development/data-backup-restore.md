# 数据备份与恢复

运行期数据全部在 `data/`：

- `data/app.db`：SQLite 任务数据库。
- `data/uploads/`：上传图片文件。

## 备份

服务运行中也可以复制备份。脚本只读当前 `data/`，不会修改数据。

```bash
scripts/backup-data.sh
```

默认备份到 `backups/data-YYYYMMDD-HHMMSS`。也可以指定目录：

```bash
scripts/backup-data.sh /Volumes/Backup/quadrant-board-data-20260622
```

## 恢复

恢复会替换当前 `data/`，所以必须先停服务。

```bash
docker compose down
scripts/restore-data.sh --from backups/data-YYYYMMDD-HHMMSS
docker compose up -d
bash scripts/verify-local.sh
```

恢复脚本会先把当前 `data/` 另存为 `backups/pre-restore-data-YYYYMMDD-HHMMSS`，再替换目录。

## 备份目录要求

可恢复的备份目录必须包含：

```text
app.db
uploads/
```

## 注意事项

- 不要只复制 `app.db`，否则图片记录和磁盘文件可能不一致。
- 恢复前必须停止服务，避免 SQLite 文件正在被写入。
- 恢复后必须运行 `bash scripts/verify-local.sh`。
- 如果恢复后维护概览出现孤儿或缺失图片，先不要继续清理，保留恢复前自动备份用于对照。

## 孤儿图片清理

先预览：

```bash
python3 scripts/cleanup_orphan_uploads.py
```

确认输出中的 `orphan_upload_count` 和文件名后，再显式删除：

```bash
python3 scripts/cleanup_orphan_uploads.py --apply
```

缺失图片记录只报告，不会自动修改数据库。
