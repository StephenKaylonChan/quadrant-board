#!/bin/bash

INPUT=$(cat)
COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // ""' 2>/dev/null)

case "$COMMAND" in
  git\ commit*) ;;
  *) exit 0 ;;
esac

echo "检测到 git commit，运行提交前验证..." >&2

if [ -f "frontend/package.json" ]; then
  echo "--- 前端构建 ---" >&2
  if docker compose ps --services --filter "status=running" 2>/dev/null | grep -q '^frontend$'; then
    docker compose exec -T frontend npm run build >&2
  else
    (cd frontend && npm run build) >&2
  fi
  if [ "$?" -ne 0 ]; then
    echo "前端构建失败，禁止提交。" >&2
    exit 2
  fi
fi

echo "--- 后端健康检查 ---" >&2
if ! curl -fsS http://localhost:8000/api/health >/dev/null; then
  echo "后端健康检查失败。请先确认 docker compose up -d 已启动服务。" >&2
  exit 2
fi

echo "提交前验证通过。" >&2
exit 0
