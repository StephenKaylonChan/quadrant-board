#!/usr/bin/env sh
# 从一个 data 备份目录恢复。要求先停止 Docker Compose 服务。
set -eu

usage() {
  echo "用法: scripts/restore-data.sh --from <备份目录>" >&2
}

if [ "${1:-}" != "--from" ] || [ -z "${2:-}" ]; then
  usage
  exit 1
fi

ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
SOURCE=$2
STAMP=$(date +"%Y%m%d-%H%M%S")
SAFETY_BACKUP="$ROOT_DIR/backups/pre-restore-data-$STAMP"

if [ ! -d "$SOURCE" ]; then
  echo "备份目录不存在:$SOURCE" >&2
  exit 1
fi

if [ ! -f "$SOURCE/app.db" ] || [ ! -d "$SOURCE/uploads" ]; then
  echo "备份目录必须包含 app.db 和 uploads/" >&2
  exit 1
fi

RUNNING=$(docker compose ps --services --filter status=running 2>/dev/null || true)
if [ -n "$RUNNING" ]; then
  echo "请先执行 docker compose down,停止服务后再恢复数据。" >&2
  exit 1
fi

mkdir -p "$ROOT_DIR/backups"
if [ -d "$ROOT_DIR/data" ]; then
  cp -R "$ROOT_DIR/data" "$SAFETY_BACKUP"
  echo "当前 data/ 已另存为:$SAFETY_BACKUP"
fi

rm -rf "$ROOT_DIR/data"
cp -R "$SOURCE" "$ROOT_DIR/data"

echo "恢复完成:$ROOT_DIR/data"
echo "下一步: docker compose up -d && bash scripts/verify-local.sh"
