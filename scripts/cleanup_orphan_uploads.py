#!/usr/bin/env python3
"""清理 data/uploads/ 里的孤儿图片。

默认只预览。只有传入 --apply 才会删除孤儿文件。
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))
from app.orphan_uploads import find_orphans, remove_orphans


def project_root() -> Path:
    return Path(__file__).resolve().parents[1]


def main() -> None:
    parser = argparse.ArgumentParser(description="预览或清理 data/uploads/ 孤儿图片")
    parser.add_argument("--data-dir", default=str(project_root() / "data"), help="data 目录路径")
    parser.add_argument("--apply", action="store_true", help="实际删除孤儿图片;不传则只预览")
    args = parser.parse_args()

    data_dir = Path(args.data_dir).resolve()
    orphans, missing = find_orphans(data_dir)

    print(f"data_dir={data_dir}")
    print(f"orphan_upload_count={len(orphans)}")
    for filename in orphans[:20]:
        print(f"orphan={filename}")
    if len(orphans) > 20:
        print(f"orphan_more={len(orphans) - 20}")

    print(f"missing_upload_count={len(missing)}")
    for filename in missing[:20]:
        print(f"missing={filename}")
    if len(missing) > 20:
        print(f"missing_more={len(missing) - 20}")

    if not args.apply:
        print("mode=dry-run")
        return

    remove_orphans(data_dir, orphans)
    print(f"deleted_orphan_upload_count={len(orphans)}")


if __name__ == "__main__":
    main()
