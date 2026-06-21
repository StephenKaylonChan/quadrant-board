"""后端 live API 回归测试。

要求后端服务已启动。脚本只创建带特殊标记的临时任务,最后会清理。
"""
import json
import os
import urllib.error
import urllib.request
from datetime import date, timedelta

API_BASE = os.environ.get("API_BASE", "http://127.0.0.1:8000/api")


def request(path: str, method: str = "GET", body: dict | None = None):
    data = json.dumps(body).encode("utf-8") if body is not None else None
    req = urllib.request.Request(
        f"{API_BASE}{path}",
        data=data,
        method=method,
        headers={"Content-Type": "application/json"} if body is not None else {},
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as res:
            if res.status == 204:
                return None
            return json.loads(res.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", "ignore")
        raise AssertionError(f"{method} {path} failed: {exc.code} {detail}") from exc


def assert_true(value: bool, message: str) -> None:
    if not value:
        raise AssertionError(message)


def main() -> None:
    today = date.today()
    yesterday = today - timedelta(days=1)
    tomorrow = today + timedelta(days=1)
    marker = f"__backend_live_api_{today.isoformat()}__"
    task_id: int | None = None

    try:
        health = request("/health")
        assert_true(health["status"] == "ok", "health endpoint should return ok")

        upload_health = request("/maintenance/upload-health")
        assert_true("orphan_upload_count" in upload_health, "upload health should expose orphan count")

        cleanup_preview = request("/maintenance/cleanup-preview")
        assert_true(cleanup_preview["mode"] == "dry-run", "cleanup preview should be dry-run")

        created = request(
            "/tasks",
            method="POST",
            body={
                "title": marker,
                "description": "后端 live API 测试临时任务",
                "important": True,
                "due_date": today.isoformat(),
                "status": "todo",
            },
        )
        task_id = created["id"]
        assert_true(created["completed_date"] is None, "new todo task should not be completed")

        today_tasks = request(f"/tasks?on={today.isoformat()}")
        assert_true(any(task["id"] == task_id for task in today_tasks), "task should appear today")

        yesterday_tasks = request(f"/tasks?on={yesterday.isoformat()}")
        assert_true(
            all(task["id"] != task_id for task in yesterday_tasks),
            "task should not appear before created_date",
        )

        done = request(f"/tasks/{task_id}", method="PATCH", body={"status": "done"})
        assert_true(done["completed_date"] == today.isoformat(), "done task should set completed_date")

        tomorrow_tasks = request(f"/tasks?on={tomorrow.isoformat()}")
        assert_true(
            all(task["id"] != task_id for task in tomorrow_tasks),
            "done task should not roll over to tomorrow",
        )

        restored = request(f"/tasks/{task_id}", method="PATCH", body={"status": "verify"})
        assert_true(restored["completed_date"] is None, "restored task should clear completed_date")
        assert_true(restored["status"] == "verify", "restored task should keep requested status")

        request(f"/tasks/{task_id}", method="DELETE")
        task_id = None
        print("tasks live api tests passed")
    finally:
        if task_id is not None:
            try:
                request(f"/tasks/{task_id}", method="DELETE")
            except Exception as exc:
                print(f"清理临时任务失败:{exc}")


if __name__ == "__main__":
    main()
