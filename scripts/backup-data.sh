#!/usr/bin/env sh
# 复制当前 data/ 到 backups/ 下,不修改运行中数据。
set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
STAMP=$(date +"%Y%m%d-%H%M%S")
TARGET=${1:-"$ROOT_DIR/backups/data-$STAMP"}

if [ ! -d "$ROOT_DIR/data" ]; then
  echo "未找到 data/ 目录" >&2
  exit 1
fi

if [ -e "$TARGET" ]; then
  echo "目标已存在:$TARGET" >&2
  exit 1
fi

mkdir -p "$(dirname -- "$TARGET")"
cp -R "$ROOT_DIR/data" "$TARGET"

echo "备份完成:$TARGET"
