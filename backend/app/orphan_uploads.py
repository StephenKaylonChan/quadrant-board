"""上传图片文件和数据库记录的一致性工具。"""
import sqlite3
from pathlib import Path


def folder_size(path: Path) -> int:
    return sum(item.stat().st_size for item in path.rglob("*") if item.is_file())


def upload_file_names(path: Path) -> set[str]:
    return {item.name for item in path.iterdir() if item.is_file()}


def upload_health(upload_dir: Path, registered: set[str]) -> dict[str, object]:
    files = upload_file_names(upload_dir)
    orphan = sorted(files - registered)
    missing = sorted(registered - files)
    return {
        "orphan_upload_count": len(orphan),
        "orphan_upload_samples": orphan[:5],
        "missing_upload_count": len(missing),
        "missing_upload_samples": missing[:5],
    }


def registered_filenames_from_sqlite(db_path: Path) -> set[str]:
    if not db_path.exists():
        raise FileNotFoundError(f"数据库不存在:{db_path}")
    with sqlite3.connect(db_path) as conn:
        rows = conn.execute("SELECT filename FROM task_images").fetchall()
    return {row[0] for row in rows}


def find_orphans(data_dir: Path) -> tuple[list[str], list[str]]:
    db_path = data_dir / "app.db"
    upload_dir = data_dir / "uploads"
    registered = registered_filenames_from_sqlite(db_path)
    files = upload_file_names(upload_dir)
    return sorted(files - registered), sorted(registered - files)


def remove_orphans(data_dir: Path, orphans: list[str]) -> None:
    upload_dir = data_dir / "uploads"
    for filename in orphans:
        (upload_dir / filename).unlink(missing_ok=True)
