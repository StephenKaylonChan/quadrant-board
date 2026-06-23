"""应用入口:组装 FastAPI 实例、路由、静态文件。"""
import logging
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from .auth import require_auth
from .config import AUTH_ENABLED, UPLOAD_DIR
from .database import init_db
from .routers import ai, auth, maintenance, tasks

logger = logging.getLogger("uvicorn.error")


# lifespan = 应用的"开机/关机钩子":yield 之前是启动时做的事,之后是关闭时
@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    if not AUTH_ENABLED:
        # 生产务必配 APP_PASSWORD + SESSION_SECRET,否则 /api 对公网裸奔
        logger.warning("鉴权未开启:未配置 APP_PASSWORD / SESSION_SECRET,所有 /api 接口对外开放")
    yield


app = FastAPI(title="每日四象限", lifespan=lifespan)

# 平时前端走 Vite 代理(同源),用不到 CORS;
# 留着是为了想直接从 5173 之外访问后端时不报跨域错
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# 登录接口本身开放(没登录也要能调登录);业务路由统一挂 require_auth 守卫
app.include_router(auth.router, prefix="/api")
app.include_router(tasks.router, prefix="/api", dependencies=[Depends(require_auth)])
app.include_router(ai.router, prefix="/api", dependencies=[Depends(require_auth)])
app.include_router(maintenance.router, prefix="/api", dependencies=[Depends(require_auth)])

# 上传的图片当静态文件直接对外:/uploads/<文件名> 就能在浏览器里打开
app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")


@app.get("/api/health")
async def health():
    return {"status": "ok"}
