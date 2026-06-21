"""维护统计的轻量回归测试。"""
import sys
from pathlib import Path
from tempfile import TemporaryDirectory

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from app.routers.maintenance import _folder_size, _upload_health


def test_upload_health() -> None:
    with TemporaryDirectory() as tmp:
        root = Path(tmp)
        (root / "kept.png").write_bytes(b"abc")
        (root / "orphan.png").write_bytes(b"12345")
        (root / "nested").mkdir()
        (root / "nested" / "ignored.png").write_bytes(b"x")

        health = _upload_health(root, {"kept.png", "missing.png"})

        assert health["orphan_upload_count"] == 1
        assert health["orphan_upload_samples"] == ["orphan.png"]
        assert health["missing_upload_count"] == 1
        assert health["missing_upload_samples"] == ["missing.png"]
        assert _folder_size(root) == 9


def main() -> None:
    test_upload_health()
    print("maintenance tests passed")


if __name__ == "__main__":
    main()
