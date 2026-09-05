/* 實作-B-1　S-02（建立）與 S-02b（編輯）對原型的文字比對。
 *
 * 基準是 `src/test/fixtures/screens.json`——原型**操作模式**同一畫面的字串集合。
 * 原型是規格，所以比對對象是原型，不是「上一版的自己」。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import screens from '@/test/fixtures/screens.json';
import { render, makeSupabaseMock } from '@/test/utils';

const members = [
  { id: 'm1', trip_id: 't1', name: 'Rozi', emoji: '🐵', sort_order: 0, linked_profile_id: null,
    person_id: null, user_id: null, role: null, created_at: '2026-03-01' },
  { id: 'm2', trip_id: 't1', name: '小美', emoji: '🐱', sort_order: 1, linked_profile_id: null,
    person_id: null, user_id: null, role: null, created_at: '2026-03-01' },
  { id: 'm3', trip_id: 't1', name: '阿明', emoji: '🍋', sort_order: 2, linked_profile_id: null,
    person_id: null, user_id: null, role: null, created_at: '2026-03-01' },
  { id: 'm4', trip_id: 't1', name: '小魚', emoji: '🐟', sort_order: 3, linked_profile_id: null,
    person_id: null, user_id: null, role: null, created_at: '2026-03-01' },
];

const trip = {
  id: 't1', owner_id: 'u1', name: '2026 濟州島四寶團', emoji: '✈️', currency: 'KRW',
  start_date: '2026-03-14', end_date: '2026-03-18', status: 'active', kind: 'trip',
  share_token: 'tok', owner_member_id: null, collab_enabled: false, card_id: null,
  cover_path: null, settlement_mode: 'direct', hub_member_id: null,
  payment_methods: ['現金', '信用卡'], cash_rate_twd: null, cash_rate_foreign: null,
  tone_seq: 1, created_at: '2026-03-01', updated_at: '2026-03-01',
  trip_members: members,
};

/* 兩種支付方式各被幾筆用到——原型的基準是「現金 3 筆、信用卡 12 筆」 */
const expenses = [
  ...Array.from({ length: 3 }, (_, i) => ({ id: `c${i}`, payment_method: 'cash', payment_label: null, payer_member_id: 'm1', individual_member_id: null })),
  ...Array.from({ length: 12 }, (_, i) => ({ id: `k${i}`, payment_method: 'credit_card', payment_label: null, payer_member_id: 'm1', individual_member_id: null })),
];

vi.mock('@/lib/supabaseClient', () => ({
  supabase: makeSupabaseMock({
    trips: [trip], trip_members: members, expenses,
    expense_splits: [], settlements: [], settlement_items: [],
  }),
}));

let TripFormSheet: typeof import('./TripFormSheet').default;
beforeEach(async () => { TripFormSheet = (await import('./TripFormSheet')).default; });

/** 畫面上看得見的字，正規化後比對（空白差異來自排版，不是行為）*/
function seen(container: HTMLElement) {
  return (container.textContent ?? '').replace(/\s+/g, '');
}
/** 原型該有的字 */
const want = (id: 's02' | 's02b') => (screens as Record<string, { list: string[]; text: string }>)[id];

/* 原型的截圖是它自己的示範資料（四位成員、幣別 JPY）。
   那些字是**資料**不是規格——建立表單本來就從沒有成員開始。
   把資料排掉，比的才是「這個畫面該有哪些字」；成員有沒有正確畫出來另外驗。 */
const DEMO = ['🐵', 'Rozi', '🐱', '小美', '🍋', '阿明', '🐟', '小魚',
              'JPY · 日圓', '🇹🇼', 'TWD', '🇰🇷', 'KRW'];
const spec = (id: 's02' | 's02b') => want(id).list.filter(t => !DEMO.includes(t));

describe('B-1　S-02 建立行程', () => {
  it('原型上的每一段文字都要出現', async () => {
    const { container } = render(<TripFormSheet onClose={() => {}} onCreated={() => {}} />);
    await waitFor(() => expect(screen.getByText('這趟去哪？')).toBeInTheDocument());
    const got = seen(document.body);
    const missing = spec('s02').filter(t => !got.includes(t.replace(/\s+/g, '')));
    expect(missing).toEqual([]);
    expect(container).toBeTruthy();
  });

  it('有成員時逐列畫出 emoji 與名字', async () => {
    render(<TripFormSheet tripId="t1" onClose={() => {}} onCreated={() => {}} />);
    await waitFor(() => expect(screen.getByText('Rozi')).toBeInTheDocument());
    for (const m of ['Rozi', '小美', '阿明', '小魚']) expect(screen.getByText(m)).toBeInTheDocument();
    expect(screen.getByText('🐵')).toBeInTheDocument();
  });

  it('回程可留空，而且要說「不填就是當天來回」', async () => {
    render(<TripFormSheet onClose={() => {}} onCreated={() => {}} />);
    await waitFor(() => expect(screen.getByText('不填就是當天來回')).toBeInTheDocument());
  });

  it('禁止 autofocus——手機上會讓鍵盤關掉又跳出來', () => {
    render(<TripFormSheet onClose={() => {}} onCreated={() => {}} />);
    expect(document.querySelectorAll('[autofocus]')).toHaveLength(0);
  });

  it('不要用字元充當 icon（✕ ＋ ✓ 都不行）', async () => {
    render(<TripFormSheet onClose={() => {}} onCreated={() => {}} />);
    await waitFor(() => expect(screen.getByText('這趟去哪？')).toBeInTheDocument());
    const txt = document.body.textContent ?? '';
    for (const ch of ['✕', '＋', '✓', '⠿', '×']) expect(txt).not.toContain(ch);
  });

  it('關閉鍵是 .ic2（畫面層級的動作）', async () => {
    render(<TripFormSheet onClose={() => {}} onCreated={() => {}} />);
    await waitFor(() => expect(document.querySelector('button.ic2')).toBeTruthy());
    expect(document.querySelector('button.ic2')?.querySelector('svg')).toBeTruthy();
  });

  it('「這是我」整組已移除', async () => {
    render(<TripFormSheet onClose={() => {}} onCreated={() => {}} />);
    await waitFor(() => expect(screen.getByText('這趟去哪？')).toBeInTheDocument());
    expect(document.body.textContent).not.toContain('這是我');
  });

  it('被砍掉的三段灰字都不在了', async () => {
    render(<TripFormSheet onClose={() => {}} onCreated={() => {}} />);
    await waitFor(() => expect(screen.getByText('這趟去哪？')).toBeInTheDocument());
    for (const s of ['點成員，標記哪位是你', '最多 10 個字', '統計卡的「我的花費」', '點一下換 emoji'])
      expect(document.body.textContent).not.toContain(s);
  });
});

describe('B-1　S-02b 編輯行程', () => {
  const open = () => render(<TripFormSheet tripId="t1" onClose={() => {}} onCreated={() => {}} />);

  it('原型上的每一段文字都要出現（含成員與幣別，這一頁真的載得到）', async () => {
    open();
    /* 等 hydration 跑完再量——existingTrip 是非同步載入的，
       太早量會量到還沒灌值的表單（幣別還停在預設 JPY） */
    await waitFor(() => expect(screen.getByText('KRW')).toBeInTheDocument());
    const got = seen(document.body);
    const missing = want('s02b').list.filter(t => !got.includes(t.replace(/\s+/g, '')));
    expect(missing).toEqual([]);
  });

  it('三段新區塊都在，而且順序是「誰一起去→怎麼結算→支付方式→現金匯率」', async () => {
    open();
    await waitFor(() => expect(screen.getByText('這趟的現金匯率')).toBeInTheDocument());
    const txt = seen(document.body);
    const order = ['誰一起去？', '這趟怎麼結算？', '這趟的支付方式', '這趟的現金匯率']
      .map(k => txt.indexOf(k.replace(/\s+/g, '')));
    expect(order.every(i => i >= 0)).toBe(true);
    /* 版位層級：選中心人需要先有成員，所以結算模式一定排在成員之後 */
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  it('支付方式列出用量，已被使用的不能刪', async () => {
    open();
    await waitFor(() => expect(screen.getByText('3 筆在用')).toBeInTheDocument());
    expect(screen.getByText('12 筆在用')).toBeInTheDocument();
    expect(screen.getByText('已經有消費在用的不能刪')).toBeInTheDocument();
  });

  it('拖曳把手是真的把手：只有把手吃觸控，列本身還要捲得動', async () => {
    open();
    await waitFor(() => expect(screen.getByText('3 筆在用')).toBeInTheDocument());
    const grips = document.querySelectorAll('.grip[role="button"]');
    expect(grips.length).toBe(2);
    for (const g of grips) {
      expect((g as HTMLElement).style.touchAction).toBe('none');
      expect(g.querySelector('svg')).toBeTruthy();   // 不是 ⠿ 字元
    }
    const rows = document.querySelectorAll('[data-payrow]');
    for (const r of rows) expect((r as HTMLElement).style.touchAction).not.toBe('none');
  });

  it('結算模式用圓形單選鈕，不是打勾框', async () => {
    open();
    await waitFor(() => expect(screen.getByText('誰欠誰就轉給誰')).toBeInTheDocument());
    expect(document.querySelectorAll('.selchip')).toHaveLength(2);
    expect(document.querySelectorAll('.chkchip')).toHaveLength(0);
  });

  it('現金匯率只有兩個輸入框，「1」那一欄排在上面', async () => {
    open();
    await waitFor(() => expect(screen.getByText('KRW')).toBeInTheDocument());
    const inputs = document.querySelectorAll('.ratebox .rateinput');
    expect(inputs).toHaveLength(2);
    /* KRW：1 韓元不到 0.1 台幣 → 講法是「1 台幣 = N 韓元」，所以 TWD 那欄在上 */
    expect(document.querySelectorAll('.raterow')[0].getAttribute('data-side')).toBe('twd');
    expect((inputs[0] as HTMLInputElement).placeholder).toBe('1');
  });

  it('編輯模式沒有名稱／幣別／日期——那些在建立時就定了', async () => {
    open();
    await waitFor(() => expect(screen.getByText('這趟的支付方式')).toBeInTheDocument());
    for (const s of ['這趟去哪？', '去哪？', '當地幣別', '出發', '回程'])
      expect(document.body.textContent).not.toContain(s);
  });
});

/* ══════════════════════════════════════════════════════════════
   實作-H　Rozi 手機實測回報的兩項
   ══════════════════════════════════════════════════════════════ */
describe('H-①　日期欄位走 .datefield，不要自己寫一份', () => {
  it('兩欄都在 .datefield 裡，父層有 flex-1 min-w-0，gap 是 9px', async () => {
    render(<TripFormSheet onClose={() => {}} onCreated={() => {}} />);
    const container = document.body;   // sheet 走 createPortal，RTL 的 container 是空的
    await waitFor(() => expect(screen.getByText('這趟去哪？')).toBeInTheDocument());

    const fields = container.querySelectorAll('.datefield');
    expect(fields.length, `.datefield 有 ${fields.length} 個，應該是 2`).toBe(2);

    for (const f of fields) {
      const input = f.querySelector('input[type=date]');
      expect(input, '.datefield 裡面要有 date input').not.toBeNull();
      /* 右側日曆 icon（.datefield>svg 靠絕對定位放上去） */
      expect(f.querySelector('svg'), '缺日曆 icon').not.toBeNull();
      /* 父層要允許縮——沒有 min-w-0 的話原生 date 的 min-content 會把整列撐開 */
      const parent = f.parentElement!;
      expect(parent.className, '日期欄的父層缺 flex-1').toContain('flex-1');
      expect(parent.className, '日期欄的父層缺 min-w-0').toContain('min-w-0');
    }

    const row = fields[0].closest('.flex') as HTMLElement;
    expect(row.style.gap, '兩欄之間的 gap 要是 9px').toBe('9px');
  });

  it('高度交給 .datefield，JSX 裡不再寫死 h-[46px]／border 顏色', async () => {
    render(<TripFormSheet onClose={() => {}} onCreated={() => {}} />);
    const container = document.body;   // sheet 走 createPortal，RTL 的 container 是空的
    await waitFor(() => expect(screen.getByText('這趟去哪？')).toBeInTheDocument());
    for (const f of container.querySelectorAll('.datefield')) {
      const input = f.querySelector('input[type=date]') as HTMLElement;
      expect(input.className, '日期欄不該再帶自己寫的高度').not.toContain('h-[46px]');
      expect(input.className).not.toContain('border-[#E4DFD9]');
    }
  });

  it('lang="en" 已拿掉——外觀關掉之後格式由我們控制', async () => {
    render(<TripFormSheet onClose={() => {}} onCreated={() => {}} />);
    const container = document.body;   // sheet 走 createPortal，RTL 的 container 是空的
    await waitFor(() => expect(screen.getByText('這趟去哪？')).toBeInTheDocument());
    for (const i of container.querySelectorAll('input[type=date]'))
      expect(i.getAttribute('lang')).toBeNull();
  });

  it('S-02b（編輯行程）走同一段 JSX，不是另寫一份', async () => {
    const src = await import('fs').then(fs =>
      fs.readFileSync('src/components/TripFormSheet.tsx', 'utf8'));
    /* 整個檔案只能有一組日期列 */
    expect((src.match(/className="datefield"/g) ?? []).length,
      '日期列被寫了兩份').toBe(2);   // 出發、回程各一，不是兩組四個
  });
});

describe('H-②　新增行程不預填上一趟的成員（G-09 已於 2026-09-04 移除）', () => {
  it('沒有 prefill 時，成員區是空的，畫面上找不到「已帶入」', async () => {
    render(<TripFormSheet onClose={() => {}} onCreated={() => {}} />);
    const container = document.body;   // sheet 走 createPortal，RTL 的 container 是空的
    await waitFor(() => expect(screen.getByText('這趟去哪？')).toBeInTheDocument());

    expect(seen(document.body)).not.toContain('已帶入');
    /* 成員列數＝原型 S-02 的起始狀態：一個都沒有 */
    const rows = [...container.querySelectorAll('.rowb')]
      .filter(r => r.querySelector('.avatar'));
    expect(rows.length, `成員列有 ${rows.length} 列，原型 S-02 起始是 0 列`).toBe(0);
    /* 四位示範成員一個都不該出現 */
    for (const n of ['Rozi', '小美', '阿明', '小魚'])
      expect(seen(document.body), `不該預填 ${n}`).not.toContain(n);
  });

  it('TripListPage 不再傳 prefill，也不留沒人用的 latestTripId', async () => {
    const src = await import('fs').then(fs =>
      fs.readFileSync('src/pages/TripListPage.tsx', 'utf8'));
    expect(src).not.toContain('prefill=');
    expect(src, 'latestTripId 沒人用了就不要留').not.toContain('latestTripId');
  });

  it('mode:"full"（複製行程）**仍然**帶入成員與幣別，文案沒被砍掉', async () => {
    render(<TripFormSheet prefill={{ tripId: 't1', mode: 'full' }} onClose={() => {}} onCreated={() => {}} />);
    const container = document.body;
    /* 成員是非同步帶進來的，要等它畫出來——提示句的條件是 members.length > 0 */
    await waitFor(() => expect(screen.getByText('Rozi')).toBeInTheDocument());

    expect(screen.getByText('已帶入原本那趟的成員與幣別，可以改')).toBeInTheDocument();
    const rows = [...container.querySelectorAll('.rowb')].filter(r => r.querySelector('.avatar'));
    expect(rows.length, '複製行程要帶入四位成員').toBe(4);
    expect(seen(document.body)).toContain('Rozi');
  });
});
