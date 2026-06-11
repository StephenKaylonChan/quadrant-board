---
paths:
  - "backend/app/**/*.py"
---

## 后端红线

- MUST NOT 引入每日快照表，任务出现在哪一天 MUST 继续由 `list_tasks` 查询条件决定。
- MUST NOT 在新代码读写 `urgency / importance` 旧打分字段。
- MUST NOT 打印 `.env`、`LLM_API_KEY` 或任何密钥值。
- MUST NOT 在 async SQLAlchemy 返回路径触发懒加载；新建任务时 MUST 显式传 `images=[]`。
- MUST NOT 吞异常，文件写入和数据库提交之间 MUST 保持可回滚思路。

## 后端规范

- MUST 使用 Pydantic schema 做接口输入输出校验。
- MUST 保持 `done` 才写 `completed_date`，从 done 改回其他状态时清空完成日期。
- MUST 保持图片文件先记录、数据库提交失败时回滚已写文件。
- AI 拆任务 MUST 只返回草稿，不直接写数据库。
- 当前没有 pytest 配置；改动后至少运行 `curl http://localhost:8000/api/health`，接口变更还要手动验证 `/docs`。
