#!/bin/bash

INPUT=$(cat)
LAST_MSG=$(echo "$INPUT" | jq -r '.last_assistant_message // "Claude Code 完成"' 2>/dev/null | head -c 100)
HOOK_ACTIVE=$(echo "$INPUT" | jq -r '.stop_hook_active // false' 2>/dev/null)

if [ "$HOOK_ACTIVE" = "true" ]; then
  exit 0
fi

if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  CHANGED_FILES=$(git diff --name-only 2>/dev/null)
  if [ -n "$CHANGED_FILES" ]; then
    ISSUES=""
    for f in $CHANGED_FILES; do
      case "$f" in
        *.ts|*.tsx)
          if [ -f "$f" ] && grep -qE '@ts-ignore|@ts-expect-error' "$f" 2>/dev/null; then
            ISSUES="$ISSUES\n$f: 检测到 TypeScript 忽略注释，请优先修复类型。"
          fi
          ;;
        *.py)
          if [ -f "$f" ] && grep -qE 'except Exception:[[:space:]]*pass|except:[[:space:]]*pass' "$f" 2>/dev/null; then
            ISSUES="$ISSUES\n$f: 检测到吞异常，请使用明确错误处理。"
          fi
          ;;
      esac
    done
    if [ -n "$ISSUES" ]; then
      echo -e "代码质量检查：$ISSUES"
    fi
  fi
fi

if command -v osascript >/dev/null 2>&1; then
  osascript -e "display notification \"$LAST_MSG\" with title \"Claude Code 完成\" sound name \"Glass\"" >/dev/null 2>&1
elif command -v notify-send >/dev/null 2>&1; then
  notify-send "Claude Code 完成" "$LAST_MSG" >/dev/null 2>&1
fi

exit 0
