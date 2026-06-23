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

# 登录鉴权:用户名 + 密码(加盐哈希存数据库)+ 签名 cookie。
# APP_USERNAME / APP_PASSWORD 只作「首次种子」:库里没有凭据行时用它们建初始账号,
# 之后用户在 app 内自助改用户名 / 密码,以数据库为准,env 不再生效。
# AUTH_ENABLED 仍由 APP_PASSWORD + SESSION_SECRET 是否配齐决定:本机不配 = 免登录。
APP_USERNAME = os.environ.get("APP_USERNAME", "admin")
APP_PASSWORD = os.environ.get("APP_PASSWORD", "")
# 给会话 cookie 盖防伪章用的密钥,必须保密且足够随机(生成示例:python -c "import secrets;print(secrets.token_hex(32))")
SESSION_SECRET = os.environ.get("SESSION_SECRET", "")
AUTH_ENABLED = bool(APP_PASSWORD and SESSION_SECRET)
# 登录态有效期(秒),默认 30 天;过期需重新输密码
SESSION_MAX_AGE = int(os.environ.get("SESSION_MAX_AGE", str(30 * 24 * 3600)))
# 生产走 HTTPS,cookie 必须带 Secure;本机 http 调试可设 COOKIE_SECURE=0
COOKIE_SECURE = os.environ.get("COOKIE_SECURE", "1") != "0"

# 允许的图片类型 -> 存盘时用的扩展名
ALLOWED_IMAGE_TYPES = {
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/gif": ".gif",
    "image/webp": ".webp",
}
