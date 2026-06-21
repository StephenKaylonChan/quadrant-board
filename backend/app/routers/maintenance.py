"""本机数据维护接口:只读统计,方便备份前确认数据规模。"""
from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import DATA_DIR, UPLOAD_DIR
from ..database import get_db
from ..models import Task, TaskImage
from ..orphan_uploads import folder_size, upload_health

router = APIRouter(tags=["maintenance"])


async def _upload_health_payload(db: AsyncSession) -> dict[str, object]:
    registered_images = set(await db.scalars(select(TaskImage.filename)))
    return upload_health(UPLOAD_DIR, registered_images)


@router.get("/maintenance/upload-health")
async def maintenance_upload_health(db: AsyncSession = Depends(get_db)):
    return await _upload_health_payload(db)


@router.get("/maintenance/cleanup-preview")
async def maintenance_cleanup_preview(db: AsyncSession = Depends(get_db)):
    return {
        "mode": "dry-run",
        **await _upload_health_payload(db),
    }


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
        "upload_bytes": folder_size(UPLOAD_DIR),
        **await _upload_health_payload(db),
    }
