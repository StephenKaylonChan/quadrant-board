#!/bin/bash

echo "=== 项目状态 ==="
echo "时间: $(date '+%Y-%m-%d %H:%M')"
echo ""

echo "--- Git 状态 ---"
if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  git status --short 2>/dev/null | head -20
  UNPUSHED=$(git log --oneline @{u}.. 2>/dev/null | wc -l | tr -d ' ')
  if [ "${UNPUSHED:-0}" -gt 0 ]; then
    echo "有 $UNPUSHED 个未推送的 commit"
  fi
else
  echo "当前目录不是 Git 仓库。"
fi

echo ""
echo "--- 环境文件 ---"
if [ -f ".env" ]; then
  echo ".env 已存在。"
else
  echo "未找到 .env；AI 拆任务会自动隐藏，其余功能不受影响。"
fi

echo ""
echo "--- Docker 服务 ---"
if command -v docker >/dev/null 2>&1; then
  docker compose ps 2>/dev/null || echo "Docker Compose 暂不可用或服务未启动。"
else
  echo "未找到 docker 命令。"
fi

echo ""
echo "就绪，可以开始工作。"
