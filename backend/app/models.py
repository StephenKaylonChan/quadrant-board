"""数据库表结构(ORM 模型):任务表 + 任务图片表。"""
from __future__ import annotations

from datetime import date, datetime

from sqlalchemy import Boolean, Date, DateTime, Float, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


class Task(Base):
    __tablename__ = "tasks"

    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String(200))
    description: Mapped[str] = mapped_column(Text, default="")
    # 象限的两个维度:重要吗(上下)+ 有没有截止日期(左右)
    # 紧急度不单独存——它就是"截止日期离今天多近",由前端按日期推导
    important: Mapped[bool] = mapped_column(Boolean, default=True)
    due_date: Mapped[date | None] = mapped_column(Date, nullable=True)  # null = 无期限
    # 记住"被清空前的截止日期":拖去无期限象限会把 due_date 清成 null,
    # 这一列留下原值,拖回有期限象限时据此还原,避免日期被悄悄抹掉。
    # 由后端 update_task 在 due_date 由非空变 null 时自动写入,客户端不直接设置。
    last_due_date: Mapped[date | None] = mapped_column(Date, nullable=True)

    # 旧版的 1-10 打分,已废弃;列留着兼容老数据,新代码不要再读写
    urgency: Mapped[int] = mapped_column(Integer, default=5)
    importance: Mapped[int] = mapped_column(Integer, default=5)

    status: Mapped[str] = mapped_column(String(20), default="todo")  # todo / doing / review / verify / done

    # 手动拖拽排序用:数值小的排前面。用小数是为了"插队"时
    # 不用改动别人——插在 1 和 2 之间,自己取 1.5 就行
    sort_order: Mapped[float] = mapped_column(Float, default=0)

    # 这两个日期决定任务出现在哪些天的面板上(见 routers/tasks.py 的查询)
    created_date: Mapped[date] = mapped_column(Date)
    completed_date: Mapped[date | None] = mapped_column(Date, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now()
    )

    # 一个任务对应多张图片;删任务时图片记录一起删(delete-orphan)
    # lazy="selectin":查任务时顺带把图片一次性查出来,避免异步下的懒加载报错
    images: Mapped[list[TaskImage]] = relationship(
        back_populates="task", cascade="all, delete-orphan", lazy="selectin"
    )


class AppCredential(Base):
    """登录凭据:整张表只有一行(id 固定为 1),存用户名和加盐哈希后的密码。

    密码不存明文;哈希格式见 auth.py 的 hash_password。用户名 / 密码都可在 app 内自助修改。
    """
    __tablename__ = "app_credential"

    id: Mapped[int] = mapped_column(primary_key=True)
    username: Mapped[str] = mapped_column(String(64))
    password_hash: Mapped[str] = mapped_column(String(255))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now()
    )


class TaskImage(Base):
    __tablename__ = "task_images"

    id: Mapped[int] = mapped_column(primary_key=True)
    task_id: Mapped[int] = mapped_column(ForeignKey("tasks.id", ondelete="CASCADE"))
    filename: Mapped[str] = mapped_column(String(100))            # 存盘文件名(uuid + 扩展名)
    original_name: Mapped[str] = mapped_column(String(255), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    task: Mapped[Task] = relationship(back_populates="images")
