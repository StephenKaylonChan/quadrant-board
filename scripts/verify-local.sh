#!/usr/bin/env sh
# 本机交付前验证:要求 Docker Compose 服务已经启动。
set -eu

echo "== Docker 服务 =="
docker compose ps

echo "== 后端健康 =="
curl -fsS http://localhost:8000/api/health
echo

echo "== 数据维护概览 =="
curl -fsS http://localhost:8000/api/maintenance/summary
echo

echo "== 前端构建 =="
docker compose exec -T frontend npm run build

echo "== 接口冒烟 =="
docker compose exec -T frontend npm run smoke:api

echo "== 后端编译 =="
docker compose exec -T backend python -m compileall app

echo "== 后端轻量测试 =="
docker compose exec -T backend python app/tests/test_ai_parser.py
docker compose exec -T backend python app/tests/test_maintenance.py

echo "== 完成 =="
