#!/bin/bash
# 🔴 實作-AF-9　開工小程式：讓 Rozi 不必每一輪都到終端機打「收」。
#
# Rozi 2026-09-10 的兩個顧慮，這支程式逐條滿足：
#   ①「我不想要它是一個長期會跑的東西」
#      → **會自己過期**（讀 .claude/kickoff_until，過了就 exit）
#      → 用 nohup 背景跑，**不用 launchd**（launchd 會開機自動啟動，那就是她說的長期）
#   ②「我在別的專案或別的對話要終端機做事情，會不會打架？」
#      → **工作目錄寫死成這個專案的絕對路徑**，只讀寫這個資料夾
#      → 不掃 $HOME、不掃任何其他路徑
#      → 有 lock，同一時間只准跑一個
#
# 停止方式（任一即可）：
#   - 專案根目錄放 _停watcher.txt
#   - 等 .claude/kickoff_until 到期
#   - kill 掉那個 process

set -u
# 寫死的專案絕對路徑——**不要改成 $PWD 之類的相對推導**，那就會跟著別的地方跑
PROJ="/Users/ziyu/Claude/Projects/家庭旅遊分帳Dashboard"
LOCK="$PROJ/.claude/kickoff.lock"
UNTIL="$PROJ/.claude/kickoff_until"
TASK="$PROJ/_開工.txt"
STOP="$PROJ/_停watcher.txt"
OUT="$PROJ/Claude outputs"

cd "$PROJ" || exit 0

while true; do
  # ── 停止條件 ─────────────────────────────────────────────
  [ -f "$STOP" ] && { rm -f "$LOCK"; exit 0; }
  # 到期檔不存在也結束——「不確定要跑到什麼時候」就不要跑
  [ -f "$UNTIL" ] || { rm -f "$LOCK"; exit 0; }
  now=$(date +%s)
  until_ts=$(cat "$UNTIL" 2>/dev/null || echo 0)
  case "$until_ts" in ''|*[!0-9]*) until_ts=0 ;; esac
  [ "$now" -ge "$until_ts" ] && { rm -f "$LOCK"; exit 0; }

  # ── 有工作就做 ───────────────────────────────────────────
  if [ -f "$TASK" ] && [ ! -f "$LOCK" ]; then
    : > "$LOCK"
    line=$(head -n 1 "$TASK")
    if [ -n "$line" ]; then
      # 工作目錄寫死，不會跑到別的專案去
      (cd "$PROJ" && claude -p "$line") >> "$PROJ/.claude/kickoff.log" 2>&1
    fi
    mkdir -p "$OUT"
    mv -f "$TASK" "$OUT/_開工_已處理_$(date +%Y%m%d-%H%M%S).txt" 2>/dev/null
    rm -f "$LOCK"
  fi

  sleep 30
done
