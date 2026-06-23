"""登录鉴权:单一密码 + 无状态签名 cookie。

设计要点(为什么这样):
- 个人单用户,不需要用户表 / OAuth;登录态就是一张「带防伪章的门票」。
- 门票内容只有「到期时间戳」,用 SESSION_SECRET 做 HMAC 签名 -> 客户端改不了、也伪造不出。
  后端因此不必存 session 表,验票只是重算签名 + 比到期时间(无状态)。
- 用标准库 hmac,不引第三方依赖。
- AUTH_ENABLED 为假时(本机没配密码),守卫直接放行,保持本地开发免登录。
"""
import base64
import hashlib
import hmac
import os
import time
from hashlib import sha256

from fastapi import HTTPException, Request, status

from .config import (
    AUTH_ENABLED,
    COOKIE_SECURE,
    SESSION_MAX_AGE,
    SESSION_SECRET,
)

SESSION_COOKIE = "qb_session"

# 密码哈希参数:PBKDF2-HMAC-SHA256,加随机盐、20 万轮,纯标准库不引第三方
_PBKDF2_ROUNDS = 200_000


def hash_password(password: str) -> str:
    """把明文密码加盐哈希成可存库的字符串:pbkdf2_sha256$轮次$盐$哈希(都是十六进制)。"""
    salt = os.urandom(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, _PBKDF2_ROUNDS)
    return f"pbkdf2_sha256${_PBKDF2_ROUNDS}${salt.hex()}${digest.hex()}"


def verify_password(password: str, stored: str) -> bool:
    """校验明文密码和库里哈希是否匹配,恒定时间比较防时序侧信道。"""
    try:
        algo, rounds, salt_hex, digest_hex = stored.split("$")
        if algo != "pbkdf2_sha256":
            return False
        digest = hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(salt_hex), int(rounds))
        return hmac.compare_digest(digest.hex(), digest_hex)
    except (ValueError, TypeError):
        return False


def _sign(payload: str) -> str:
    """用密钥给 payload 盖 HMAC 防伪章,返回 base64url 签名。"""
    mac = hmac.new(SESSION_SECRET.encode(), payload.encode(), sha256).digest()
    return base64.urlsafe_b64encode(mac).decode().rstrip("=")


def make_token() -> str:
    """签发一张门票:内容是到期时间戳,形如 `<到期秒>.<签名>`。"""
    expiry = str(int(time.time()) + SESSION_MAX_AGE)
    return f"{expiry}.{_sign(expiry)}"


def verify_token(token: str | None) -> bool:
    """验票:签名对得上且未过期才算有效。"""
    if not token or "." not in token:
        return False
    expiry, sig = token.rsplit(".", 1)
    # compare_digest 是「恒定时间比较」,避免按字符逐位比时通过耗时差猜出签名
    if not hmac.compare_digest(sig, _sign(expiry)):
        return False
    try:
        return int(expiry) > int(time.time())
    except ValueError:
        return False


def is_authenticated(request: Request) -> bool:
    """当前请求是否已登录(未开启鉴权时恒为真)。"""
    if not AUTH_ENABLED:
        return True
    return verify_token(request.cookies.get(SESSION_COOKIE))


async def require_auth(request: Request) -> None:
    """路由守卫依赖:未登录抛 401。挂到需要保护的路由组上。"""
    if not is_authenticated(request):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="未登录或登录已过期")


def cookie_kwargs() -> dict[str, object]:
    """统一的 cookie 安全属性:HttpOnly 防 JS 偷取,SameSite=Lax 防跨站,生产带 Secure。"""
    return {
        "httponly": True,
        "secure": COOKIE_SECURE,
        "samesite": "lax",
        "path": "/",
    }
