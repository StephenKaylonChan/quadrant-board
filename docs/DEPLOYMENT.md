# 部署文档 — quadrant-board

> ⚠️ **本仓库公开**：服务器 IP / SSH 用户 / 密钥路径等敏感信息一律用占位符（`<SERVER>` / `<SSH_USER>` / `<SSH_KEY>`），真实值见私有运维记录。**切勿把真实凭据、`.env`、API key 提交进本仓库。**

首次上线：**2026-06-23**，域名 **board.kaylonchan.com**。
登录鉴权（用户名 + 密码）已于 **2026-06-23** 在生产启用并灌入本地真实数据，配置见 §2。

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

## 2. 安全：登录鉴权（已实现，生产必须配）

**方案**：个人单用户 → 「用户名 + 密码（加盐哈希存数据库）+ 无状态签名 cookie」，不上 OAuth。
- 凭据存数据库单行表 `app_credential`（`backend/app/models.py` 的 `AppCredential`）：用户名 + `pbkdf2_sha256` 加盐哈希密码，**不存明文**。登录后可在 app 内自助改用户名 / 密码（改密需验证当前密码）。
- 后端 `backend/app/auth.py`：密码哈希/校验（标准库 pbkdf2，无第三方依赖）；登录态是一张只含到期时间、用 `SESSION_SECRET` 做 HMAC 签名的 cookie（`qb_session`，HttpOnly + SameSite=Lax + 生产 Secure），后端无状态、不存 session 表。
- 守卫挂在 `app/main.py`：`tasks / ai / maintenance` 三个路由整组挂 `Depends(require_auth)`；`auth`（登录/登出/状态/改账号）和 `/api/health` 保持开放（改账号接口自身另挂守卫）。
- 前端 `frontend/src/api.ts` + `components/LoginGate.tsx`（登录页）+ `components/AccountModal.tsx`（顶栏「账号」按钮里改用户名/密码）：启动先查 `/api/auth/status`，开了鉴权且未登录就挡在登录页；任何请求遇 401 统一弹回登录页。

**开关 + 种子逻辑（关键）**：`APP_PASSWORD` 和 `SESSION_SECRET` 两个环境变量**都配齐才开启**鉴权。
- 开启后**首次启动**用 `APP_USERNAME`（默认 `admin`）+ `APP_PASSWORD` 建初始账号写进数据库；**之后改密以数据库为准，env 不再生效**（库里已有凭据行就跳过种子）。
- 生产 `.env` **必须配 `APP_PASSWORD` + `SESSION_SECRET`**，否则 `/api` 对公网裸奔（后端启动会打 WARNING 日志提醒）。
- 本机 `docker compose up`（dev）不配 = 免登录，方便开发。

**生产 `.env` 配置**（与 LLM 配置放一起，仍 gitignore、仅在服务器）：
```bash
APP_USERNAME=你的用户名         # 可选，默认 admin
APP_PASSWORD=初始密码           # 仅首次种子用,上线后建议进 app 改掉
SESSION_SECRET=$(python -c "import secrets;print(secrets.token_hex(32))")  # 随机长串，务必保密
# 改完重建后端容器：cd <BOARD_DIR> && sudo docker compose up -d --force-recreate board-backend
```

> 可选环境变量：`SESSION_MAX_AGE`（登录态有效期秒数，默认 30 天）；`COOKIE_SECURE`（默认 1=带 Secure，仅本机 http 调试才设 0）。
> 轮换 `SESSION_SECRET` 会让所有已登录设备立即失效（需重新输密码），应急踢人可用。
> **忘记密码**：删库里 `app_credential` 那一行再重启后端，会用 env 重新种子回初始账号。

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
| `.env` | LLM 配置（`LLM_BASE_URL`/`CHAT_MODEL`/`LLM_API_KEY`）+ 鉴权（`APP_PASSWORD`/`SESSION_SECRET`，见 §2），**gitignore，仅放服务器** | 不进 git |
| `backend/app/auth.py` | 密码哈希/校验（pbkdf2）+ 签名 cookie 签发/验证 + `require_auth` 守卫 | 本仓库 |
| `backend/app/routers/auth.py` | 登录 / 登出 / 状态 / 自助改账号接口 | 本仓库 |
| `backend/app/models.py` `AppCredential` | 单行凭据表（用户名 + 哈希密码），`database.py` 首次启动种子 | 本仓库 |
| `frontend/src/components/LoginGate.tsx` / `AccountModal.tsx` | 登录页 / 顶栏「账号」改用户名密码弹窗 | 本仓库 |
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
# 后端内部自测（容器内）—— 打开放的 /api/health（鉴权开启后 /api/* 业务接口需登录会 401）
ssh -i <SSH_KEY> <SSH_USER>@<SERVER> 'sudo docker exec quadrant-board-backend \
  python -c "import urllib.request;print(urllib.request.urlopen(\"http://localhost:8000/api/health\").status)"'
# 外部（本地 DNS 若被代理 fake-ip 污染，用 --resolve 指真实 IP）
# /api/health 开放;鉴权开启后 /api/tasks 等业务接口返回 401 属正常（说明守卫生效）
curl --resolve board.kaylonchan.com:443:<SERVER> https://board.kaylonchan.com/api/health
```

常见问题：
- **首页 500**：nginx 容器没挂到 `static/board`（见 §5.1 注），或 `dist/` 没传上去。
- **/api 502 / nginx reload 报 host not found**：`board-backend` 容器没起、或不在 `<SHARED_NET>` 网络。
- **502 在容器重建后**：nginx 缓存了旧容器 IP → recreate nginx 或重载。
- **镜像跑不起来 / exec format error**：镜像不是 `linux/amd64`（忘了 `--platform`）。
- **AI 拆任务不工作**：服务器 `<BOARD_DIR>/.env` 的 `LLM_BASE_URL`/`LLM_API_KEY` 没配或失效（前端会自动隐藏 AI 入口）。
- **打开是裸面板、没要登录**：`.env` 没配齐 `APP_PASSWORD` + `SESSION_SECRET`，鉴权没开（`docker logs` 会有「鉴权未开启」WARNING）。配齐后 `--force-recreate board-backend`。
- **登录后立刻又被踢回登录页**：多半是 cookie 没带上——确认走 HTTPS（`COOKIE_SECURE` 默认要求 Secure），且 nginx 反代 `/api` 时没有丢 `Cookie` 头。
- **改了 `SESSION_SECRET` 后所有人要重登**：正常，旧 cookie 的签名对不上了（也是应急踢人手段）。

## 9. 资源足迹

后端常驻 ~58M（单 worker）；前端纯静态（计入共享 nginx，可忽略）；SQLite 内存映射 <10M。
