"""本机数据维护接口:只读统计,方便备份前确认数据规模。"""
from pathlib import Path

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import DATA_DIR, UPLOAD_DIR
from ..database import get_db
from ..models import Task, TaskImage

router = APIRouter(tags=["maintenance"])


def _folder_size(path: Path) -> int:
    return sum(item.stat().st_size for item in path.rglob("*") if item.is_file())


@router.get("/maintenance/summary")
async def maintenance_summary(db: AsyncSession = Depends(get_db)):
    task_total = await db.scalar(select(func.count()).select_from(Task))
    open_total = await db.scalar(
        select(func.count()).select_from(Task).where(Task.completed_date.is_(None))
    )
    done_total = await db.scalar(select(func.count()).select_from(Task).where(Task.status == "done"))
    image_total = await db.scalar(select(func.count()).select_from(TaskImage))
    database_file = DATA_DIR / "app.db"

    return {
        "data_dir": "data/",
        "upload_dir": "data/uploads/",
        "task_total": task_total or 0,
        "open_total": open_total or 0,
        "done_total": done_total or 0,
        "image_total": image_total or 0,
        "database_bytes": database_file.stat().st_size if database_file.exists() else 0,
        "upload_bytes": _folder_size(UPLOAD_DIR),
    }
