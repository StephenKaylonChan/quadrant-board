"""数据库连接:引擎、会话工厂、建表入口。"""
from datetime import date

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from .config import DATABASE_URL

engine = create_async_engine(DATABASE_URL)

# 会话(session)= 一次和数据库的对话,每个请求开一个、用完关掉
# expire_on_commit=False:提交后对象里的数据还能直接读,不用再查一次库
SessionLocal = async_sessionmaker(engine, expire_on_commit=False)


class Base(DeclarativeBase):
    """所有表模型的基类,SQLAlchemy 靠它收集表结构。"""


async def init_db() -> None:
    """应用启动时建表(表已存在则跳过)。"""
    from . import models  # noqa: F401  导入一下,让模型类注册到 Base 上

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

        # 老库升级:create_all 只建新表、不会给已有表加列,
        # 所以这里查一下 tasks 表有没有 sort_order,没有就手动补上
        result = await conn.execute(text("PRAGMA table_info(tasks)"))
        columns = [row[1] for row in result]
        if "sort_order" not in columns:
            await conn.execute(
                text("ALTER TABLE tasks ADD COLUMN sort_order FLOAT NOT NULL DEFAULT 0")
            )
            # 老任务按 id(创建先后)给个初始顺序
            await conn.execute(text("UPDATE tasks SET sort_order = id"))

        # 1-10 打分换成"重要吗 + 哪天截止"后的数据迁移
        if "important" not in columns:
            await conn.execute(
                text("ALTER TABLE tasks ADD COLUMN important BOOLEAN NOT NULL DEFAULT 1")
            )
            await conn.execute(
                text("UPDATE tasks SET important = CASE WHEN importance >= 6 THEN 1 ELSE 0 END")
            )
        if "due_date" not in columns:
            await conn.execute(text("ALTER TABLE tasks ADD COLUMN due_date DATE"))
            # 老数据里"紧急"(>=6)的任务,截止日期算今天;不紧急的算无期限
            await conn.execute(
                text("UPDATE tasks SET due_date = :today WHERE urgency >= 6"),
                {"today": date.today().isoformat()},
            )

        # 记住被清空前的截止日期,供拖回有期限象限时还原(老库默认空)
        if "last_due_date" not in columns:
            await conn.execute(text("ALTER TABLE tasks ADD COLUMN last_due_date DATE"))


async def get_db():
    """FastAPI 依赖:每个请求拿到一个独立的数据库会话,请求结束自动关闭。

    yield 写法 = 把会话"借"给接口函数用,接口返回后这里继续执行清理。
    """
    async with SessionLocal() as session:
        yield session
