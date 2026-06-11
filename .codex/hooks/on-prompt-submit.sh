#!/bin/bash

NOTES_FILE=".claude/session-notes.md"

if [ -f "$NOTES_FILE" ]; then
  echo "=== 当前会话进度 ==="
  cat "$NOTES_FILE"
  echo ""
fi

exit 0
