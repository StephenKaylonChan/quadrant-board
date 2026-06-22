"""任务和图片的全部接口。

核心设计:任务不"属于"某一天。每天的面板是一个查询结果——
  某天 D 的面板 = 创建日期 <= D 且(还没完成 或 完成日期 >= D)的任务。
这样昨天没做完的任务今天自动出现(结转),翻历史也能还原当天的样子。
"""
import uuid
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, UploadFile
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import ALLOWED_IMAGE_TYPES, MAX_IMAGE_SIZE, UPLOAD_DIR
from ..database import get_db
from ..models import Task, TaskImage
from ..schemas import ImageOut, TaskCreate, TaskOut, TaskUpdate

router = APIRouter(tags=["tasks"])


async def _get_task_or_404(task_id: int, db: AsyncSession) -> Task:
    task = await db.get(Task, task_id)
    if task is None:
        raise HTTPException(status_code=404, detail="任务不存在")
    return task


@router.get("/tasks", response_model=list[TaskOut])
async def list_tasks(on: date | None = None, db: AsyncSession = Depends(get_db)):
    """某一天面板上的任务,不传 on 默认今天。"""
    board_date = on or date.today()
    stmt = (
        select(Task)
        .where(Task.created_date <= board_date)
        .where(or_(Task.completed_date.is_(None), Task.completed_date >= board_date))
        .order_by(Task.sort_order, Task.id)  # 顺序由用户拖拽决定
    )
    result = await db.scalars(stmt)
    return result.all()


@router.post("/tasks", response_model=TaskOut, status_code=201)
async def create_task(payload: TaskCreate, db: AsyncSession = Depends(get_db)):
    # 新任务排到当前最大序号之后(列表末尾)
    max_order = await db.scalar(select(func.max(Task.sort_order)))
    # images=[] 显式给个空列表,告诉 ORM"图片就是没有",
    # 否则返回时序列化会去数据库懒加载,在 async 下会报错
    task = Task(
        **payload.model_dump(),
        created_date=date.today(),
        # 极少见但要自洽:一建出来就是"已完成"的任务,完成日期就是今天
        completed_date=date.today() if payload.status == "done" else None,
        sort_order=(max_order or 0) + 1,
        images=[],
    )
    db.add(task)
    await db.commit()
    return task


@router.patch("/tasks/{task_id}", response_model=TaskOut)
async def update_task(task_id: int, payload: TaskUpdate, db: AsyncSession = Depends(get_db)):
    task = await _get_task_or_404(task_id, db)

    # exclude_unset=True:只拿请求里真正传了的字段,没传的不动
    data = payload.model_dump(exclude_unset=True)

    new_status = data.get("status")
    if new_status and new_status != task.status:
        # 标记完成时记下完成日期;从"已完成"改回去时清掉(任务重新回到每天的面板)
        task.completed_date = date.today() if new_status == "done" else None

    # 截止日期被清空(非空 → null,通常是拖去无期限象限)时,先把原值记下来,
    # 这样拖回有期限象限能还原原日期,而不是退化成"今天"。注意要在下面 setattr 覆盖前读旧值。
    if "due_date" in data and data["due_date"] is None and task.due_date is not None:
        task.last_due_date = task.due_date

    for field, value in data.items():
        setattr(task, field, value)

    await db.commit()
    return task


@router.delete("/tasks/{task_id}", status_code=204)
async def delete_task(task_id: int, db: AsyncSession = Depends(get_db)):
    task = await _get_task_or_404(task_id, db)
    # 先记下文件名,等数据库删除成功后再删磁盘文件(顺序反了可能丢文件却删库失败)
    filenames = [img.filename for img in task.images]
    await db.delete(task)
    await db.commit()
    for name in filenames:
        (UPLOAD_DIR / name).unlink(missing_ok=True)


@router.post("/tasks/{task_id}/images", response_model=list[ImageOut], status_code=201)
async def upload_images(
    task_id: int, files: list[UploadFile], db: AsyncSession = Depends(get_db)
):
    """给任务上传一张或多张图片(前端粘贴截图走的就是这个接口)。"""
    task = await _get_task_or_404(task_id, db)

    saved: list[TaskImage] = []
    written: list[str] = []  # 已写进磁盘的文件,出错时要回滚删掉
    try:
        for file in files:
            ext = ALLOWED_IMAGE_TYPES.get(file.content_type or "")
            if ext is None:
                raise HTTPException(
                    status_code=400, detail=f"不支持的图片类型:{file.content_type}"
                )
            content = await file.read()
            if len(content) > MAX_IMAGE_SIZE:
                raise HTTPException(status_code=400, detail="图片超过 10MB 限制")

            # 用 uuid 当文件名,避免重名覆盖,也不暴露原始文件名
            filename = f"{uuid.uuid4().hex}{ext}"
            (UPLOAD_DIR / filename).write_bytes(content)
            written.append(filename)

            image = TaskImage(
                task_id=task.id, filename=filename, original_name=file.filename or ""
            )
            db.add(image)
            saved.append(image)

        await db.commit()
    except Exception:
        # 任何一张失败就整体回退:数据库不提交,已写的文件也删掉
        for name in written:
            (UPLOAD_DIR / name).unlink(missing_ok=True)
        raise

    return saved


@router.delete("/images/{image_id}", status_code=204)
async def delete_image(image_id: int, db: AsyncSession = Depends(get_db)):
    image = await db.get(TaskImage, image_id)
    if image is None:
        raise HTTPException(status_code=404, detail="图片不存在")
    filename = image.filename
    await db.delete(image)
    await db.commit()
    (UPLOAD_DIR / filename).unlink(missing_ok=True)
