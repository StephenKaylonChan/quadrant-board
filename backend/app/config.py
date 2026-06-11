"""全局配置:路径、数据库地址、上传限制、大模型接入。"""
import os
from pathlib import Path

# __file__ 是当前文件路径,parent.parent 往上两级就是 /code(容器里的工作目录)
DATA_DIR = Path(__file__).resolve().parent.parent / "data"
UPLOAD_DIR = DATA_DIR / "uploads"

# 启动时确保目录存在(数据库文件和图片都放这里)
DATA_DIR.mkdir(parents=True, exist_ok=True)
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

# aiosqlite 是 SQLite 的异步驱动,配合 FastAPI 的 async 接口使用
DATABASE_URL = f"sqlite+aiosqlite:///{DATA_DIR / 'app.db'}"

MAX_IMAGE_SIZE = 10 * 1024 * 1024  # 单张图片上限 10MB

# AI 拆任务用的大模型(OpenAI 兼容接口),从环境变量读,没配就禁用 AI 功能
LLM_BASE_URL = os.environ.get("LLM_BASE_URL", "")
LLM_API_KEY = os.environ.get("LLM_API_KEY", "")
CHAT_MODEL = os.environ.get("CHAT_MODEL", "qwen-plus")

# 允许的图片类型 -> 存盘时用的扩展名
ALLOWED_IMAGE_TYPES = {
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/gif": ".gif",
    "image/webp": ".webp",
}
