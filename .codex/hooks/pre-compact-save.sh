#!/bin/bash

echo "上下文即将压缩。"
echo ""
echo "请在压缩摘要中保留以下关键信息："
echo "1. 当前正在实施的功能和进度"
echo "2. 已完成和未完成的步骤"
echo "3. 重要技术决策及原因"
echo "4. 下一步计划"
echo ""

if [ -d "docs/specs" ]; then
  ACTIVE_SPECS=$(grep -rl "status: implementing" docs/specs/ 2>/dev/null)
  if [ -n "$ACTIVE_SPECS" ]; then
    echo "当前实施中的 Spec："
    for spec in $ACTIVE_SPECS; do
      PHASE=$(grep "active_phase:" "$spec" 2>/dev/null | head -1)
      echo "- $spec ($PHASE)"
    done
    echo ""
    echo "请读取上述 spec 文件确认 active_phase 和 Tasks 勾选状态。"
  fi
fi

echo ""
echo "同时请将进度写入 .claude/session-notes.md，供 /catchup 恢复。"
