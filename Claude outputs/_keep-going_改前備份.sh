#!/bin/bash
cd "${CLAUDE_PROJECT_DIR:-.}" 2>/dev/null || exit 0
CNT=".claude/.keepgoing_count"
[ -f "_停.txt" ] && exit 0

REASON=""
if [ -f "_要修的.md" ]; then
  REASON="專案根目錄還有 \`_要修的.md\`（Cowork 複驗退回的項目）還沒處理完。"
else
  AHEAD=$(git rev-list --count origin/main..HEAD 2>/dev/null || echo 0)
  if [ "$AHEAD" != "0" ]; then
    REASON="本機還有 $AHEAD 個 commit 沒推上去（實作階段：做完就要推）。"
  fi
fi

[ -z "$REASON" ] && { rm -f "$CNT"; exit 0; }

n=$(cat "$CNT" 2>/dev/null || echo 0)
case "$n" in ''|*[!0-9]*) n=0 ;; esac
n=$((n+1)); echo "$n" > "$CNT"
[ "$n" -gt 15 ] && exit 0

printf '{"decision":"block","reason":"%s 請立刻接著做，不要停：\\n- 若是 `_要修的.md`：讀它，從第一個沒做完的項目接著做，做完把它改名到 `Claude outputs/`。\\n- 若是等推上線：先 `git fetch origin` 再 `git push origin main`，成功後把 `_可以推了.txt` 改名為 `Claude outputs/_可以推了_已推.txt`，並在 `_停點.md` 記下推上去的 commit 與時間。push 失敗就把完整錯誤訊息寫進 `_停.txt` 後結束。\\n- 只有遇到五類例外（不可逆且無備份／要花錢／安全性隱私／重大範疇取捨／需 Rozi 記憶或偏好）才停：建立 `_停.txt` 寫明原因。"}\n' "$REASON"
