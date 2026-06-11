"""接口的输入输出格式(Pydantic 模型)。

和 models.py 的区别:models 定义数据库里怎么存,schemas 定义接口上怎么传。
FastAPI 用它做两件事:校验请求参数 + 把 ORM 对象转成 JSON。
"""
from datetime import date
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

# Literal = 只允许这几个值,传别的直接报 422
# review = 已提交 PR 等审核;verify = 已合并待真实环境验证,两者都不归档
Status = Literal["todo", "doing", "review", "verify", "done"]


class ImageOut(BaseModel):
    # from_attributes:允许直接从 ORM 对象读字段(而不只是字典)
    model_config = ConfigDict(from_attributes=True)

    id: int
    filename: str
    original_name: str


class TaskCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    description: str = ""
    important: bool = True
    due_date: date | None = None  # null = 无期限(落在左列)
    status: Status = "todo"  # AI 拆解可能直接带上"待 Review/待验证"等状态


class TaskUpdate(BaseModel):
    """所有字段都可选:只传想改的字段(PATCH 语义)。

    注意 due_date:不传 = 不动它;显式传 null = 清空期限(挪去左列)。
    exclude_unset 能区分这两种情况。
    """

    title: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = None
    important: bool | None = None
    due_date: date | None = None
    status: Status | None = None
    sort_order: float | None = None


class TaskOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    description: str
    important: bool
    due_date: date | None
    status: Status
    sort_order: float
    created_date: date
    completed_date: date | None
    images: list[ImageOut]
