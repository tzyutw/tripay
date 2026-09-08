/* 🔴 實作-AC　「查看計算依據」展開後的每人卡片。**S-05 與分享頁共用這一份。**
 *
 * 由來：實作-AB 之後，同一個人在同一畫面出現兩次而且數字不一樣——
 * 展開區上半的卡片寫「Ziyu 要給出 $24,192」（那是**上一次已確認結算**存的值），
 * 畫面更上面的「大家給 Ning」寫的是即時算出來的 $24,209。
 * Rozi 拍板：計算依據整理進每個人自己的卡片，四欄表整張拿掉，分享頁一起做。
 *
 * ⚠️ 兩頁**必須是同一支元件**（驗收會驗）。分享頁另寫一套就是「移植檢查」那條陷阱。
 * ⚠️ 這裡**不做任何計算**——`breakdown`／`net`／`tx` 都由呼叫端算好傳進來。
 */
import { money, memberLabel } from '@/lib/format';
import Avatar from './Avatar';
import type { SharedTrip, Transfer } from './types';

/** 一位成員的四行組成。與 `SettlementPage` 的 `Breakdown` 同形狀，
 *  這裡只列出畫得到的欄位，避免共用元件反過來依賴頁面。 */
export interface BreakdownLike {
  shared: number; sharedN: number;
  self: number;   selfN: number;
  each: number;   eachN: number;
  fronted: number; frontedN: number;
  /** 他付出去的**全部**（含自己買給自己的）。AC-2 明訂保留原意，供其他斷言用 */
  paid: number;
}

export interface SettleBreakdownProps {
  t: SharedTrip;
  tx: Transfer[];
  /** 每人淨額。**正＝可以拿回、負＝要給出**（全站慣例） */
  net: Record<string, number>;
  breakdownOf: (id: string) => BreakdownLike;
}

/** `−$ 0` 不准出現：0 就是 0，加個負號只會讓人以為少了什麼 */
const signedAmt = (v: number) => (v < 0 ? `−${money(-v)}` : money(v));

export default function SettleBreakdown({ t, tx, net, breakdownOf }: SettleBreakdownProps) {
  return (
    <div className="gap">
      {t.members.map((m, i) => {
        const v = net[m.id] ?? 0;
        const b = breakdownOf(m.id);
        const mine = tx.filter(x => x.from === m.id || x.to === m.id);
        /* 差額 ＝ 第一行 − 第二行 − 第三行。**三行真的加得起來**，
           不是把結果印出來就算數——這一頁存在的理由就是讓人能自己對一遍。 */
        const diff = b.fronted - b.shared - b.each;
        return (
          <div className="netcard" key={m.id}
            data-settle-row data-member={m.id}
            data-shared={b.shared} data-self={b.self} data-each={b.each}
            data-fronted={b.fronted} data-paid={b.paid} data-diff={diff}>
            <div className="netrow">
              <Avatar emoji={m.emoji} name={m.name} index={i} />
              <span className="flex-1 text-body font-semibold">{m.name}</span>
              <span className="money"
                style={{ color: v > 0 ? 'var(--in)' : v < 0 ? 'var(--out)' : 'var(--gr)' }}>
                {v > 0 ? `可以拿回 ${money(v)}` : v < 0 ? `要給出 ${money(-v)}` : '剛好打平'}
              </span>
            </div>
            {mine.length > 0 && (
              <div className="netwho">
                {mine.map(x => (
                  <div key={`${x.from}>${x.to}`}>
                    {x.from === m.id
                      ? <>給 {memberLabel(t.members.find(y => y.id === x.to)!)}{' '}
                          <span className="money inline">{money(x.amount)}</span></>
                      : <>{memberLabel(t.members.find(y => y.id === x.from)!)} 給你{' '}
                          <span className="money inline">{money(x.amount)}</span></>}
                  </div>
                ))}
              </div>
            )}
            {/* 🔴 AC-1　順序固定，**筆數 0 的行照樣顯示**（Rozi 拍板）：
                整行為 0 時仍要出現，使用者才看得懂這一欄在講什麼。 */}
            <div className="detailparts">
              <div><span>他幫大家先付的</span><i>{b.frontedN} 筆</i>
                <b className="money">{signedAmt(b.fronted)}</b></div>
              <div><span>一起分的</span><i>{b.sharedN} 筆</i>
                <b className="money">{signedAmt(-b.shared)}</b></div>
              <div><span>各付各的</span><i>{b.eachN} 筆</i>
                <b className="money">{signedAmt(-b.each)}</b></div>
              <div className="partsline" />
              <div className="diffline"><span>差額</span><i />
                <b className="money">{signedAmt(diff)}</b></div>
              {/* 🔴 AC-1／AC-3　「自己買給自己的」**不在算式內**：放在差額下面、
                  灰字、縮排，右邊標「不進結算」。
                  Rozi：「不然很容易被理解這筆帳也要被扣掉」。
                  原本那句「這些你自己付、也算你自己，不影響要轉的錢」拿掉了——
                  位置已經說明它不在算式裡，不需要再解釋一次。 */}
              <div className="selfline"><span>自己買給自己的</span><i>{b.selfN} 筆</i>
                <b className="money">{signedAmt(b.self)}</b>
                <em>不進結算</em></div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
