"""应用入口:组装 FastAPI 实例、路由、静态文件。"""
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from .config import UPLOAD_DIR
from .database import init_db
from .routers import ai, maintenance, tasks


# lifespan = 应用的"开机/关机钩子":yield 之前是启动时做的事,之后是关闭时
@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
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

app.include_router(tasks.router, prefix="/api")
app.include_router(ai.router, prefix="/api")
app.include_router(maintenance.router, prefix="/api")

# 上传的图片当静态文件直接对外:/uploads/<文件名> 就能在浏览器里打开
app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")


@app.get("/api/health")
async def health():
    return {"status": "ok"}
