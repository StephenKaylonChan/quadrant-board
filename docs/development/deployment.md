# 部署说明

## 当前部署方式

本项目当前定位为单人本机使用，通过 Docker Compose 本地启动，不包含公网部署流程。

GitHub 仓库：https://github.com/StephenKaylonChan/quadrant-board

```bash
docker compose up -d
docker compose logs -f
docker compose down
```

## 端口

- 前端：`5173`
- 后端：`8000`

如端口冲突，修改 `docker-compose.yml` 左侧宿主机端口。

## 环境变量

大模型配置来自 `.env`，由 Docker Compose 自动读取：

| 名称 | 必填 | 默认值 | 说明 | 示例 |
|------|------|--------|------|------|
| `LLM_BASE_URL` | 否 | 空 | OpenAI 兼容接口地址；为空时隐藏 AI 输入框 | `https://dashscope.aliyuncs.com/compatible-mode/v1` |
| `CHAT_MODEL` | 否 | `qwen-plus` | AI 拆任务使用的模型名 | `qwen-plus` |
| `LLM_API_KEY` | 否 | 空 | 大模型密钥；为空时隐藏 AI 输入框 | 不写入文档 |
| `TZ` | 是 | `Asia/Shanghai` | Compose 中固定容器时区，保证“今天”不按 UTC 计算 | `Asia/Shanghai` |

修改 `.env` 后运行：

```bash
docker compose up -d
```

如果改了 Python 或前端依赖，使用：

```bash
docker compose up -d --build
```

## 数据备份和恢复

运行期数据全部在 `data/`。备份时复制整个目录；恢复时停止容器、替换 `data/`、再启动容器。

恢复步骤：

```bash
docker compose down
# 替换 data/ 目录
docker compose up -d
curl http://localhost:8000/api/health
```

## 回滚

当前项目已启用 Git，`main` 跟踪 `origin/main`。回滚代码前 MUST 先备份 `data/`，避免误删本地数据。

推荐回滚顺序：

1. 停止服务并备份当前 `data/`。
2. 用 Git 回滚到目标提交，或重新 clone GitHub 仓库。
3. 恢复对应 `data/`。
4. `docker compose up -d` 启动。
5. 用健康检查、页面访问和关键交互确认恢复成功。

常用 Git 检查：

```bash
git status --short --branch
git log --oneline --decorate -5
git rev-list --left-right --count main...origin/main
```

## 本机部署检查清单

- Docker Desktop 已启动。
- `5173` 和 `8000` 端口未被占用，或已在 `docker-compose.yml` 改宿主机端口。
- `.env` 不提交、不截图、不打印。
- `data/` 已备份。
- `curl http://localhost:8000/api/health` 返回 `{"status":"ok"}`。
