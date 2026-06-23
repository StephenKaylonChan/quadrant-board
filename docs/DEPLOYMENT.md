# 部署文档 — quadrant-board

> ⚠️ **本仓库公开**：服务器 IP / SSH 用户 / 密钥路径等敏感信息一律用占位符（`<SERVER>` / `<SSH_USER>` / `<SSH_KEY>`），真实值见私有运维记录。**切勿把真实凭据、`.env`、API key 提交进本仓库。**

首次上线：**2026-06-23**，域名 **board.kaylonchan.com**。

## 1. 概览

- **前端**：React 19 + Vite → `vite build` 出 `dist/` 静态产物，由一台**共享 nginx**（与同服务器上的 kaylonchan-website 栈复用）托管，零常驻进程。
- **后端**：FastAPI + 单 uvicorn worker（个人单用户，省内存，实测 ~58M），SQLite 持久化，调阿里云 DashScope LLM API（无本地模型）。
- **部署形态**：后端跑在独立 docker compose 项目里，**加入共享网络** `<SHARED_NET>`（即 `kaylonchan_web`），共享 nginx 通过容器名反代 `/api` 与 `/uploads` 到后端。
- **为什么这样**：服务器是 2 核 / ~1.6G 内存的小机，内存是硬约束。静态前端 + 单 worker 后端 + 复用 nginx，把这个项目的常驻足迹压到 ~58M。

```
浏览器 → 共享 nginx (SSL)
          ├── /            → /usr/share/nginx/html/board（dist 静态产物）
          ├── /api         → quadrant-board-backend:8000（FastAPI）
          └── /uploads     → quadrant-board-backend:8000（StaticFiles）
                                   └── SQLite + 上传图片（docker volume: board-data）
```

## 2. ⚠️ 安全：鉴权尚未实现（务必尽快补）

**当前后端没有任何登录 / 鉴权**：所有 `/api/*` 接口对任何能访问到的人开放，可读可写整个任务板。上线时为尽快可用而暂缓鉴权，**这是已知的待办，应尽快补上**。

补登录时的关键信息（开发指引）：
- 前端所有请求集中在 `frontend/src/api.ts` 的 `request()`——加 token / 登录态在这一处统一改即可。
- 后端路由在 `backend/app/routers/{tasks,ai,maintenance}.py`，统一挂 `/api` 前缀（`app/main.py`）。加鉴权可用 FastAPI 依赖（`Depends`）做全局 / 路由级守卫。
- nginx 是流量入口：在 app 内鉴权落地前，**可加一道临时 nginx Basic Auth 密码门**挡一下（见 §6 排查/运维里的说明，或让运维在 `board.conf` 的 `location /` 加 `auth_basic`）。
- 方案选择：个人单用户 → session cookie 或单一密码 + 签名 token 即可，不必上完整 OAuth。

## 3. 前置（占位符 → 真实值见私有运维记录）

| 占位符 | 含义 |
|--------|------|
| `<SERVER>` | 生产服务器 IP |
| `<SSH_USER>` | SSH 用户（docker 命令需 `sudo`，已配 passwordless） |
| `<SSH_KEY>` | 本地 SSH 私钥路径 |
| `<SHARED_NET>` | 共享 docker 网络名（`kaylonchan_web`） |
| `<NGINX_DIR>` | 共享 nginx 部署目录（`/opt/docker/kaylonchan`，含 `nginx/conf.d`、`static/`、`certbot/`） |
| `<BOARD_DIR>` | 本项目服务器部署目录（`/opt/docker/quadrant-board`） |

本地需要：`docker`（含 buildx）、`node`/`npm`、`rsync`、`ssh`。

> **铁律：镜像在本地交叉构建为 `linux/amd64` 再传，绝不在服务器上 `docker build`。** 本机是 arm64（Apple Silicon），服务器是 x86_64；且服务器内存紧张，on-server build 会 OOM 把实例拖垮（有前车之鉴）。

## 4. 关键文件

| 文件 | 作用 | 所在 repo |
|------|------|-----------|
| `backend/Dockerfile.prod` | 生产镜像（无 `--reload`、单 worker） | 本仓库 |
| `docker-compose.prod.yml` | 后端服务（外部网络 + 数据卷 + 健康检查） | 本仓库 |
| `.env` | LLM 配置（`LLM_BASE_URL`/`CHAT_MODEL`/`LLM_API_KEY`），**gitignore，仅放服务器** | 不进 git |
| `nginx board.conf` | 静态 root + `/api`、`/uploads` 反代 | kaylonchan-website 私有 repo（`docker/nginx/conf.d/board.conf`） |

## 5. 部署 / 重新部署

### 5.1 更新前端（改了 React 代码）

```bash
# 本地
cd frontend && npm install && npm run build          # 出 dist/
rsync -az --delete -e "ssh -i <SSH_KEY>" dist/ \
  <SSH_USER>@<SERVER>:<NGINX_DIR>/static/board/
# 静态文件即时生效，无需重启任何容器
```

> 若是**首次**接入或新增静态站：还需在共享 nginx 的 compose 里给 nginx 服务加一行卷挂载
> `- ./static/board:/usr/share/nginx/html/board:ro` 并 `docker compose up -d --force-recreate nginx-proxy`，
> 否则容器内没有该目录，首页会 500。（已在首次上线时配好，日常更新不用动。）

### 5.2 更新后端（改了 FastAPI 代码）

```bash
# 本地：交叉构建 amd64 → 打包
cd quadrant-board
docker buildx build --platform linux/amd64 --provenance=false --sbom=false \
  -f backend/Dockerfile.prod -t quadrant-board-backend:latest --load backend/
docker save quadrant-board-backend:latest | gzip > /tmp/board-backend.tar.gz

# 传到服务器并加载
scp -i <SSH_KEY> /tmp/board-backend.tar.gz <SSH_USER>@<SERVER>:/tmp/
ssh -i <SSH_KEY> <SSH_USER>@<SERVER> '
  sudo docker load < /tmp/board-backend.tar.gz
  cd <BOARD_DIR> && sudo docker compose up -d --no-build --force-recreate board-backend
  rm /tmp/board-backend.tar.gz'
```

### 5.3 首次上线做过的事（备忘）

1. 服务器建 `<BOARD_DIR>`，放 `docker-compose.prod.yml`（重命名为 `docker-compose.yml`）+ `.env`。
2. `docker load` 后端镜像；`docker compose up -d --no-build` 起 `board-backend`（自动加入 `<SHARED_NET>`）。
3. 前端 `dist/` rsync 到 `<NGINX_DIR>/static/board/`；共享 nginx compose 加 board 静态挂载并 recreate nginx。
4. 在共享 nginx 的 `conf.d/` 放 `board.conf`；`nginx -t` + reload（**后端容器须先 up 且在同网络，否则 reload 报 host not found**）。
5. SSL：给 board **单独**签证书（见 §7）。

## 6. 数据持久化与备份

- docker 卷 `board-data` 挂到容器 `/code/data`，内含 `app.db`（SQLite）+ `uploads/`（图片）。
- 删容器不丢数据（卷独立）；**删卷才丢**。
- 备份：
  ```bash
  ssh -i <SSH_KEY> <SSH_USER>@<SERVER> \
    'sudo docker run --rm -v quadrant-board_board-data:/d -v /tmp:/b alpine \
       tar czf /b/board-data-$(date +%F).tgz -C /d .'
  scp -i <SSH_KEY> <SSH_USER>@<SERVER>:/tmp/board-data-*.tgz ./backups/
  ```

## 7. SSL 证书

- board 用**独立**证书（`/etc/letsencrypt/live/board.kaylonchan.com/`），与主站 `kaylonchan.com` 证书分开。
- **为什么独立**：曾尝试把 board 并进主站证书做 `certbot --expand`，但主域 apex 在 Let's Encrypt 二次校验时偶发 DNS `SERVFAIL` 导致整批失败。给新子域单独 `certonly -d board.kaylonchan.com` 只校验该子域，绕开主域 DNS 抖动，也不牵连主证书。
- 签发命令（在共享 nginx 目录，certbot 服务有死循环 entrypoint 需覆盖）：
  ```bash
  cd <NGINX_DIR> && sudo docker compose run --rm --entrypoint certbot certbot \
    certonly --webroot -w /var/www/certbot --non-interactive -d board.kaylonchan.com
  ```
- 自动续期：共享栈的 certbot 服务会定时 `renew`，board 证书一并续。

## 8. 排查

```bash
# 健康 / 日志
ssh -i <SSH_KEY> <SSH_USER>@<SERVER> 'sudo docker ps | grep board; sudo docker logs --tail 50 quadrant-board-backend'
# 后端内部自测（容器内）
ssh -i <SSH_KEY> <SSH_USER>@<SERVER> 'sudo docker exec quadrant-board-backend \
  python -c "import urllib.request;print(urllib.request.urlopen(\"http://localhost:8000/api/ai/status\").status)"'
# 外部（本地 DNS 若被代理 fake-ip 污染，用 --resolve 指真实 IP）
curl --resolve board.kaylonchan.com:443:<SERVER> https://board.kaylonchan.com/api/tasks?on=$(date +%F)
```

常见问题：
- **首页 500**：nginx 容器没挂到 `static/board`（见 §5.1 注），或 `dist/` 没传上去。
- **/api 502 / nginx reload 报 host not found**：`board-backend` 容器没起、或不在 `<SHARED_NET>` 网络。
- **502 在容器重建后**：nginx 缓存了旧容器 IP → recreate nginx 或重载。
- **镜像跑不起来 / exec format error**：镜像不是 `linux/amd64`（忘了 `--platform`）。
- **AI 拆任务不工作**：服务器 `<BOARD_DIR>/.env` 的 `LLM_BASE_URL`/`LLM_API_KEY` 没配或失效（前端会自动隐藏 AI 入口）。

## 9. 资源足迹

后端常驻 ~58M（单 worker）；前端纯静态（计入共享 nginx，可忽略）；SQLite 内存映射 <10M。
