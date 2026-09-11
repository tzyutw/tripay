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

  # ── 鎖檔太舊就當殘骸清掉 ─────────────────────────────────
  # 🔴 收尾-AH-4　2026-09-11 查到鎖檔從凌晨 03:03 留到 08:12，五個多小時。
  # 條件是「沒有鎖才做事」，所以鎖一旦留下來 watcher 就**永遠安靜地不做任何事**，
  # 外面看起來像它死了——Cowork 放進來的工作躺了十分鐘沒人撿。
  # 殘留成因不明（可能是 claude -p 被中斷、或 session 被砍掉沒跑到清鎖那一行），
  # 所以不去追成因，改成「超過 30 分鐘的鎖一律視為殘骸」。
  if [ -f "$LOCK" ]; then
    lock_age=$(( $(date +%s) - $(stat -f %m "$LOCK" 2>/dev/null || echo 0) ))
    [ "$lock_age" -gt 1800 ] && rm -f "$LOCK"
  fi

  # ── 有工作就做 ───────────────────────────────────────────
  if [ -f "$TASK" ] && [ ! -f "$LOCK" ]; then
    : > "$LOCK"
    # 🔴 AG-4　原本只讀指令檔的**第一行**，第二行以後整段被吃掉。
    # 2026-09-10 就是這樣：Cowork 放了三件事，終端機只收到「三件小事」那一句，
    # 回問「三件事是什麼？」就停住，白等十分鐘。整份讀進來。
    line=$(cat "$TASK")
    if [ -n "$line" ]; then
      # 工作目錄寫死，不會跑到別的專案去
      #
      # 🔴 AG-4 附帶的調查結果：**我沒能重現「連 git commit 都停在權限對話框」**。
      #   在這個 repo 用 `claude -p` 實跑 `git status --short`（純指令）與
      #   `git status --short | wc -l`（管線）兩種，都直接執行、沒有停——
      #   代表 `settings.local.json` 的 `Bash(git:*)` 在 `-p` 模式下是吃得到的。
      #   合理的解釋是：2026-09-10 那次卡住發生在那三條 allow 加進去**之前**，
      #   或者卡住的是 `rm -f`／`nohup` 那類當時還沒被允許的指令，不是 git。
      #
      # ⚠️ 但**無人看管的背景程式不該有「可能永遠卡住」這件事**。
      #   `--print` 的權限詢問預設送給 host 回答（`--permission-prompts host`），
      #   而 `nohup` 起來的殼**沒有 host 可以回答**，於是那個詢問沒有人接 → 掛著。
      #   加 `--permission-prompts none`：任何**會跳詢問**的動作直接被拒絕，
      #   白名單內的照跑。這把「靜靜卡十分鐘」換成「立刻失敗並留在 log 裡」。
      #   **不用 `--dangerously-skip-permissions`**——那會把護欄整個拿掉。
      # `< /dev/null`：不接 stdin。少了它每次都會先卡 3 秒等輸入再印一行 warning。
      (cd "$PROJ" && claude -p --permission-prompts none "$line" < /dev/null) \
        >> "$PROJ/.claude/kickoff.log" 2>&1
    fi
    mkdir -p "$OUT"
    mv -f "$TASK" "$OUT/_開工_已處理_$(date +%Y%m%d-%H%M%S).txt" 2>/dev/null
    rm -f "$LOCK"
  fi

  sleep 30
done
