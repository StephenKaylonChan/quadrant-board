import sqlite3
import sys
from pathlib import Path
from tempfile import TemporaryDirectory

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from app.orphan_uploads import find_orphans, remove_orphans


def make_data_dir(root: Path) -> Path:
    data_dir = root / "data"
    upload_dir = data_dir / "uploads"
    upload_dir.mkdir(parents=True)
    with sqlite3.connect(data_dir / "app.db") as conn:
        conn.execute("CREATE TABLE task_images (filename TEXT NOT NULL)")
        conn.execute("INSERT INTO task_images(filename) VALUES ('kept.png'), ('missing.png')")
    (upload_dir / "kept.png").write_bytes(b"ok")
    (upload_dir / "orphan.png").write_bytes(b"unused")
    return data_dir


def test_find_and_remove_orphans() -> None:
    with TemporaryDirectory() as tmp:
        data_dir = make_data_dir(Path(tmp))
        orphans, missing = find_orphans(data_dir)

        assert orphans == ["orphan.png"]
        assert missing == ["missing.png"]

        remove_orphans(data_dir, orphans)
        assert not (data_dir / "uploads" / "orphan.png").exists()
        assert (data_dir / "uploads" / "kept.png").exists()


def main() -> None:
    test_find_and_remove_orphans()
    print("orphan cleanup tests passed")


if __name__ == "__main__":
    main()
