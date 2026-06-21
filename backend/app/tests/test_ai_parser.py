"""AI 解析容错的轻量回归测试。

不用 pytest,直接 `python app/tests/test_ai_parser.py` 就能跑,方便当前 Docker 镜像执行。
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from app.routers.ai import MAX_DRAFTS, _normalize_important, _parse_drafts


def test_bool_string() -> None:
    assert _normalize_important(False) is False
    assert _normalize_important("false") is False
    assert _normalize_important("不重要") is False
    assert _normalize_important("true") is True


def test_parse_single_object_and_fence() -> None:
    drafts = _parse_drafts(
        """```json
{"title": "整理本周开发事项", "description": "含复盘", "important": "false", "due_date": null, "status": "doing"}
```"""
    )
    assert len(drafts) == 1
    assert drafts[0].important is False
    assert drafts[0].status == "doing"


def test_parse_limit_and_bad_status() -> None:
    payload = [
        {
            "title": f"任务 {index}",
            "description": "x" * 2500,
            "important": True,
            "due_date": "bad-date",
            "status": "unknown",
        }
        for index in range(MAX_DRAFTS + 3)
    ]
    drafts = _parse_drafts("模型说明:" + json.dumps(payload, ensure_ascii=False))
    assert len(drafts) == MAX_DRAFTS
    assert drafts[0].status == "todo"
    assert len(drafts[0].description) == 2000


def main() -> None:
    test_bool_string()
    test_parse_single_object_and_fence()
    test_parse_limit_and_bad_status()
    print("ai parser tests passed")


if __name__ == "__main__":
    main()
