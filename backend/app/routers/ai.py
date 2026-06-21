"""AI 拆任务:把一句自然语言变成一个或多个任务草稿。

只负责"拆解",不直接写数据库——草稿返回给前端,
用户确认后走普通的 POST /api/tasks 入库,方便人工把关 AI 的打分。
"""
import json
from datetime import date

import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from ..config import CHAT_MODEL, LLM_API_KEY, LLM_BASE_URL

router = APIRouter(tags=["ai"])

SYSTEM_PROMPT = """你是任务管理助手。把用户输入拆成 1 个或多个待办任务。

每个任务做三个判断:

1. important(重要吗,true/false):看影响大小——线上故障、影响客户或用户、关键功能 -> true;例行回复、琐事 -> false

2. due_date(哪天截止,YYYY-MM-DD 或 null):
- 「马上 / 今天 / 尽快 / 很急」 -> 今天的日期
- 「明天」 -> 明天的日期;「周五前 / 下周三」 -> 按今天的日期换算成具体日期
- 排查、修复、回复这类事,没提时限 -> 默认今天
- 梳理、学习、优化、探索这类没有死线的事,没提时限 -> null(无期限)

3. status(状态),以用户原话为准:
- 提到「待 Review / 已提交 PR / 等审核 / 等人看」 -> "review"
- 提到「待验证 / 待测试 / 已合并待测 / 真实环境验证」 -> "verify"
- 提到「正在做 / 排查中 / 进行中」 -> "doing"
- 提到「已完成 / 做完了 / 已解决」 -> "done"
- 没提就是 "todo"

title(标题)的写法:
- 高度概括"发生了什么 / 要做什么",关键现象要列举出来;15~25 字为宜,不追求极简
- 时间点、具体数值、复现条件这类细节一律不进标题,放进 description
- 范例:输入「系统在21:38后出现追问、返回'无'、乱码等BUG,需定位根因」
  好标题:「系统出现追问、乱码、返回异常等BUG」
  坏标题:「排查21:38后待办发送异常」(细节挤进标题,现象列举反而丢了)

description(备注)的写法:
- 承接全部细节:时间点、现象清单、线索、目标;用户口述重复、凌乱时,整理通顺再写,但不要丢信息
- 上面范例的备注应类似:「21:38 后开始出现;现象:重复追问、返回'无'、乱码;需要定位根因」
- 确实没有细节就给空字符串

输出严格的 JSON 数组,不要任何多余文字、不要代码块标记,每个元素形如:
{"title": "...", "description": "...", "important": true, "due_date": "2026-06-11", "status": "todo"}"""

WEEKDAY_CN = ["一", "二", "三", "四", "五", "六", "日"]


class ParseIn(BaseModel):
    text: str = Field(min_length=1, max_length=2000)
    existing_titles: list[str] = Field(default_factory=list, max_length=30)


VALID_STATUS = {"todo", "doing", "review", "verify", "done"}
MAX_DRAFTS = 12


class TaskDraft(BaseModel):
    title: str
    description: str = ""
    important: bool = True
    due_date: str | None = None  # YYYY-MM-DD,null = 无期限
    status: str = "todo"


@router.get("/ai/status")
async def ai_status():
    """前端用这个判断要不要显示 AI 输入框。"""
    return {"enabled": bool(LLM_BASE_URL and LLM_API_KEY), "model": CHAT_MODEL}


@router.post("/ai/parse-task", response_model=list[TaskDraft])
async def parse_task(payload: ParseIn):
    if not (LLM_BASE_URL and LLM_API_KEY):
        raise HTTPException(status_code=503, detail="后端未配置 LLM_BASE_URL / LLM_API_KEY")

    # 把今天的日期喂给模型,它才能把"明天/周五前"换算成具体日期
    today = date.today()
    date_context = f"\n\n今天是 {today.isoformat()},周{WEEKDAY_CN[today.weekday()]}。"
    body = {
        "model": CHAT_MODEL,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT + date_context},
            {"role": "user", "content": _build_user_content(payload.text, payload.existing_titles)},
        ],
        "temperature": 0.3,  # 判断类任务要稳定,温度调低
    }
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                f"{LLM_BASE_URL.rstrip('/')}/chat/completions",
                headers={"Authorization": f"Bearer {LLM_API_KEY}"},
                json=body,
            )
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"连不上大模型服务:{exc}") from exc

    if resp.status_code != 200:
        raise HTTPException(status_code=502, detail=f"大模型调用失败:HTTP {resp.status_code}")

    try:
        result = resp.json()
    except ValueError as exc:
        raise HTTPException(status_code=502, detail="大模型返回的不是 JSON") from exc

    content = _extract_message_content(result)
    drafts = _parse_drafts(content)
    if not drafts:
        raise HTTPException(status_code=502, detail="AI 没能拆出任务,换个说法再试试")
    return drafts


def _normalize_due(value: object) -> str | None:
    """截止日期容错:合法的 YYYY-MM-DD 原样保留,空值算无期限,格式坏了按默认今天。"""
    if value in (None, "", "null"):
        return None
    try:
        return date.fromisoformat(str(value)).isoformat()
    except ValueError:
        return date.today().isoformat()


def _clean_existing_titles(titles: list[str]) -> list[str]:
    """清洗前端传来的当前任务标题,只给模型做去重参考。"""
    cleaned: list[str] = []
    seen: set[str] = set()
    for title in titles:
        normalized = title.strip()
        if not normalized or normalized in seen:
            continue
        seen.add(normalized)
        cleaned.append(normalized[:80])
        if len(cleaned) >= 30:
            break
    return cleaned


def _build_user_content(text: str, existing_titles: list[str]) -> str:
    """把当前任务标题附在用户输入后面,降低 AI 重复拆同一事项的概率。"""
    titles = _clean_existing_titles(existing_titles)
    if not titles:
        return text

    title_lines = "\n".join(f"- {title}" for title in titles)
    return (
        f"{text}\n\n"
        "当前仍未归档的任务标题如下,只作为去重参考。"
        "如果用户输入已经和已有任务表达同一件事,不要重复照抄已有标题;"
        "只有出现新的动作、细节或验证事项时才拆成新草稿。\n"
        f"{title_lines}"
    )


def _normalize_important(value: object) -> bool:
    """重要性容错:兼容模型把布尔值写成字符串的情况。"""
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        normalized = value.strip().lower()
        if normalized in {"false", "0", "no", "n", "否", "不重要"}:
            return False
        if normalized in {"true", "1", "yes", "y", "是", "重要"}:
            return True
    return True if value is None else bool(value)


def _extract_message_content(result: object) -> str:
    """读取 OpenAI 兼容响应,结构不对时返回可理解的 502。"""
    if not isinstance(result, dict):
        raise HTTPException(status_code=502, detail="大模型响应格式异常")

    choices = result.get("choices")
    if not isinstance(choices, list) or not choices:
        raise HTTPException(status_code=502, detail="大模型没有返回候选结果")

    first = choices[0]
    if not isinstance(first, dict):
        raise HTTPException(status_code=502, detail="大模型候选结果格式异常")

    message = first.get("message")
    if not isinstance(message, dict):
        raise HTTPException(status_code=502, detail="大模型响应缺少 message")

    content = message.get("content")
    if not isinstance(content, str) or not content.strip():
        raise HTTPException(status_code=502, detail="大模型返回了空内容")
    return content


def _strip_code_fence(text: str) -> str:
    """兼容模型把 JSON 包在 ```json 代码块里的情况。"""
    cleaned = text.strip()
    if not cleaned.startswith("```"):
        return cleaned

    lines = cleaned.splitlines()
    if lines and lines[0].startswith("```"):
        lines = lines[1:]
    if lines and lines[-1].startswith("```"):
        lines = lines[:-1]
    return "\n".join(lines).strip()


def _load_json_from_ai_text(content: str) -> object | None:
    """尽量只抽取 JSON 主体,避免模型偶尔加一句解释导致整段解析失败。"""
    text = _strip_code_fence(content)
    candidates = [text]

    array_start = text.find("[")
    array_end = text.rfind("]")
    if 0 <= array_start < array_end:
        candidates.append(text[array_start : array_end + 1])

    object_start = text.find("{")
    object_end = text.rfind("}")
    if 0 <= object_start < object_end:
        candidates.append(text[object_start : object_end + 1])

    for candidate in candidates:
        try:
            return json.loads(candidate.strip())
        except json.JSONDecodeError:
            continue
    return None


def _parse_drafts(content: str) -> list[TaskDraft]:
    """容错解析模型输出:支持代码块、单对象和带少量解释的 JSON。"""
    data = _load_json_from_ai_text(content)
    if data is None:
        return []

    if isinstance(data, dict):
        nested = data.get("tasks") or data.get("items")
        data = nested if isinstance(nested, list) else [data]  # 模型偶尔只回一个对象而不是数组
    if not isinstance(data, list):
        return []

    drafts: list[TaskDraft] = []
    for item in data:
        if len(drafts) >= MAX_DRAFTS:
            break
        if not isinstance(item, dict):
            continue
        title = str(item.get("title") or item.get("name") or "").strip()
        if not title:
            continue
        status = str(item.get("status", "todo")).strip().lower()
        drafts.append(
            TaskDraft(
                title=title[:200],
                description=str(item.get("description") or item.get("content") or item.get("detail") or "")[:2000],
                important=_normalize_important(item.get("important", item.get("is_important", True))),
                due_date=_normalize_due(item.get("due_date", item.get("deadline"))),
                status=status if status in VALID_STATUS else "todo",
            )
        )
    return drafts
