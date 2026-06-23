"""登录鉴权接口:登录、登出、查登录态、自助改账号。

凭据(用户名 + 密码哈希)存数据库的单行 AppCredential,可在 app 内自助修改。
登录 / 登出 / 状态不挂守卫(否则没登录就调不了);改账号挂 require_auth。
"""
import hmac

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth import (
    SESSION_COOKIE,
    cookie_kwargs,
    hash_password,
    is_authenticated,
    make_token,
    require_auth,
    verify_password,
)
from ..config import AUTH_ENABLED, SESSION_MAX_AGE
from ..database import get_db
from ..models import AppCredential

router = APIRouter(tags=["auth"])


class LoginIn(BaseModel):
    username: str
    password: str


class AccountIn(BaseModel):
    current_password: str
    # 两个都可选,但至少要改一个;新密码至少 6 位,用户名 1~64 位
    new_username: str | None = Field(default=None, min_length=1, max_length=64)
    new_password: str | None = Field(default=None, min_length=6, max_length=128)


async def _get_credential(db: AsyncSession) -> AppCredential | None:
    """取唯一的凭据行(固定 id=1,这里直接按主键拿)。"""
    return await db.get(AppCredential, 1)


@router.get("/auth/status")
async def auth_status(request: Request, db: AsyncSession = Depends(get_db)):
    """前端启动时先问一句:要不要登录、现在登没登、当前用户名是谁。"""
    authed = is_authenticated(request)
    username = None
    if AUTH_ENABLED and authed:
        cred = await _get_credential(db)
        username = cred.username if cred else None
    return {"auth_enabled": AUTH_ENABLED, "authenticated": authed, "username": username}


@router.post("/auth/login")
async def login(body: LoginIn, response: Response, db: AsyncSession = Depends(get_db)):
    """用户名 + 密码都对就发门票(写 cookie);未开启鉴权时直接放行。"""
    if not AUTH_ENABLED:
        return {"ok": True, "auth_enabled": False}
    cred = await _get_credential(db)
    # 用户名和密码都要对;两个都算完再判,避免因用户名先错就早返回而泄露时序
    username_ok = cred is not None and hmac.compare_digest(body.username, cred.username)
    password_correct = cred is not None and verify_password(body.password, cred.password_hash)
    if not (username_ok and password_correct):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="用户名或密码错误")
    response.set_cookie(SESSION_COOKIE, make_token(), max_age=SESSION_MAX_AGE, **cookie_kwargs())
    return {"ok": True, "auth_enabled": True}


@router.post("/auth/logout")
async def logout(response: Response):
    """清门票。删除时 cookie 属性要和写入时一致,否则部分浏览器删不掉。"""
    response.delete_cookie(SESSION_COOKIE, **cookie_kwargs())
    return {"ok": True}


@router.post("/auth/account", dependencies=[Depends(require_auth)])
async def update_account(body: AccountIn, db: AsyncSession = Depends(get_db)):
    """登录后自助改用户名 / 密码:必须验证当前密码,至少改一项。"""
    if body.new_username is None and body.new_password is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="未提供要修改的内容")
    cred = await _get_credential(db)
    if cred is None or not verify_password(body.current_password, cred.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="当前密码错误")
    if body.new_username is not None:
        cred.username = body.new_username
    if body.new_password is not None:
        cred.password_hash = hash_password(body.new_password)
    await db.commit()
    return {"ok": True, "username": cred.username}
