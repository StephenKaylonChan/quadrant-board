#!/bin/bash

INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.path // .tool_input.file_path // ""' 2>/dev/null)

if [ -z "$FILE_PATH" ] || [ ! -f "$FILE_PATH" ]; then
  exit 0
fi

case "$FILE_PATH" in
  *.ts|*.tsx|*.js|*.jsx|*.css|*.json)
    if [ -x "frontend/node_modules/.bin/prettier" ]; then
      (cd frontend && ./node_modules/.bin/prettier --write "../$FILE_PATH") >/dev/null 2>&1
    elif command -v prettier >/dev/null 2>&1; then
      prettier --write "$FILE_PATH" >/dev/null 2>&1
    fi
    ;;
  *.py)
    if command -v black >/dev/null 2>&1; then
      black "$FILE_PATH" >/dev/null 2>&1
    fi
    ;;
esac

exit 0
