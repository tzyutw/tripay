/* 實作-B-1　S-02（建立）與 S-02b（編輯）對原型的文字比對。
 *
 * 基準是 `src/test/fixtures/screens.json`——原型**操作模式**同一畫面的字串集合。
 * 原型是規格，所以比對對象是原型，不是「上一版的自己」。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor, fireEvent } from '@testing-library/react';
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
  /* **只填了外幣那一邊**——這就是 Rozi 真實資料的形狀（她填了 0.19、另一欄空著）。
     兩欄都空的話「還差一欄」那條路徑就沒有假資料走過，等於沒有人守著。 */
  payment_methods: ['現金', '信用卡'], cash_rate_twd: null, cash_rate_foreign: 0.19,
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
       太早量會量到還沒灌值的表單（幣別還停在預設 JPY）。
       實作-O-5 之後編輯頁也有幣別欄，所以 'KRW' 會出現兩次（幣別鈕＋匯率列的代碼）
       ——用 getAllByText，getByText 撞到多個會直接拋錯。 */
    await waitFor(() => expect(screen.getAllByText('KRW').length).toBeGreaterThan(0));
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
    await waitFor(() => expect(screen.getAllByText('KRW').length).toBeGreaterThan(0));
    const inputs = document.querySelectorAll('.ratebox .rateinput');
    expect(inputs).toHaveLength(2);
    /* KRW：1 韓元不到 0.1 台幣 → 講法是「1 台幣 = N 韓元」，所以 TWD 那欄在上 */
    expect(document.querySelectorAll('.raterow')[0].getAttribute('data-side')).toBe('twd');
    expect((inputs[0] as HTMLInputElement).placeholder).toBe('1');
  });

  /* 實作-O-5（Rozi 2026-09-06）：「按編輯行程的時候，我想到介面應該跟建立新行程的
     欄位一致，因為我就是要修改在這個行程設定上的欄位」。
     編輯頁補上當地幣別與出發／回程——**這條原本是反過來斷言的**，
     方向由 Rozi 推翻，不是實作跑掉。 */
  it('編輯模式也有幣別與出發／回程（與建立頁欄位一致）', async () => {
    open();
    await waitFor(() => expect(screen.getByText('這趟的支付方式')).toBeInTheDocument());
    for (const s of ['這趟叫什麼？', '當地幣別', '出發', '回程', '誰一起去？',
                     '這趟怎麼結算？', '這趟的支付方式', '這趟的現金匯率'])
      expect(document.body.textContent, `編輯頁缺欄位：${s}`).toContain(s);
    expect(document.querySelectorAll('input[type=date]').length,
      '編輯頁要有出發／回程兩個日期欄').toBe(2);
    /* 頁面標題不動：編輯頁是「編輯行程」，不是建立頁的「這趟去哪？」 */
    expect(document.body.textContent).not.toContain('這趟去哪？');
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

/* ══════════════════════════════════════════════════════════════
   實作-I　Cowork 線上實測找到的 bug（③④）
   ══════════════════════════════════════════════════════════════ */
describe('I-③　成員加進來之後，錯誤要跟著清掉', () => {
  it('觸發「至少要有一位成員」→ 加一位 → 紅字消失', async () => {
    render(<TripFormSheet onClose={() => {}} onCreated={() => {}} />);
    await waitFor(() => expect(screen.getByText('這趟去哪？')).toBeInTheDocument());

    fireEvent.change(screen.getByPlaceholderText('例如：沖繩四人行 ☀️'), { target: { value: 'ZZ 測試' } });
    fireEvent.click(screen.getByText('出發！'));
    expect(screen.getByText('至少要有一位成員')).toBeInTheDocument();

    fireEvent.click(screen.getByText('新增成員'));
    fireEvent.change(screen.getByPlaceholderText('叫什麼名字？'), { target: { value: '小美' } });
    fireEvent.click(screen.getByText('加進來'));

    expect(screen.queryByText('至少要有一位成員'), '人已經在畫面上了，紅字不該還掛著').toBeNull();
  });
});

describe('I-④　名字打了但沒按「加進來」就送出', () => {
  it('直接按「出發！」→ 那個名字算一位成員，不報錯', async () => {
    render(<TripFormSheet onClose={() => {}} onCreated={() => {}} />);
    await waitFor(() => expect(screen.getByText('這趟去哪？')).toBeInTheDocument());

    fireEvent.change(screen.getByPlaceholderText('例如：沖繩四人行 ☀️'), { target: { value: 'ZZ 測試' } });
    fireEvent.click(screen.getByText('新增成員'));
    fireEvent.change(screen.getByPlaceholderText('叫什麼名字？'), { target: { value: '小美' } });
    /* 不按「加進來」——那顆在摺線以下，使用者不會知道要按 */
    fireEvent.click(screen.getByText('出發！'));

    expect(screen.queryByText('至少要有一位成員'),
      '名字明明在畫面上，不該報「至少要有一位成員」').toBeNull();
    /* 名字欄清空、人進到成員列 */
    await waitFor(() =>
      expect((screen.getByPlaceholderText('叫什麼名字？') as HTMLInputElement).value).toBe(''));
  });

  it('名字欄按 Enter 等同按「加進來」', async () => {
    render(<TripFormSheet onClose={() => {}} onCreated={() => {}} />);
    const container = document.body;   // sheet 走 createPortal
    await waitFor(() => expect(screen.getByText('這趟去哪？')).toBeInTheDocument());

    fireEvent.click(screen.getByText('新增成員'));
    const input = screen.getByPlaceholderText('叫什麼名字？');
    fireEvent.change(input, { target: { value: '阿明' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    const rows = [...container.querySelectorAll('.rowb')].filter(r => r.querySelector('.avatar'));
    expect(rows.length, 'Enter 沒有把人加進來').toBe(1);
    expect(seen(document.body)).toContain('阿明');
  });
});

/* ══════════════════════════════════════════════════════════════
   實作-L-3　編輯行程要能改行程名稱（S-02b-14，Rozi 2026-09-06 新增需求）
   ══════════════════════════════════════════════════════════════ */
describe('L-③　S-02b-14 行程名稱', () => {
  it('編輯模式有行程名欄位，初始值等於該趟的 name，高度與 S-02 同款', async () => {
    render(<TripFormSheet tripId="t1" onClose={() => {}} onCreated={() => {}} />);
    /* 行程是非同步載入的，要等值真的帶進來——不等的話量到的是空字串 */
    await waitFor(() => expect(
      (screen.getByPlaceholderText('例如：沖繩四人行 ☀️') as HTMLInputElement).value,
    ).toBe('2026 濟州島四寶團'));

    const input = screen.getByPlaceholderText('例如：沖繩四人行 ☀️') as HTMLInputElement;
    expect(input, '編輯行程沒有行程名欄位').toBeTruthy();
    /* 與 S-02「去哪？」同一款：h-[46px] */
    expect(input.className).toContain('h-[46px]');
    expect(screen.getByText('這趟叫什麼？')).toBeInTheDocument();
  });

  it('改字之後 state 跟著變（存檔會寫進 trips.name）', async () => {
    render(<TripFormSheet tripId="t1" onClose={() => {}} onCreated={() => {}} />);
    await waitFor(() => expect(
      (screen.getByPlaceholderText('例如：沖繩四人行 ☀️') as HTMLInputElement).value,
    ).toBe('2026 濟州島四寶團'));

    const input = screen.getByPlaceholderText('例如：沖繩四人行 ☀️') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'ZZ 改過的名字' } });
    expect(input.value).toBe('ZZ 改過的名字');

    /* 存檔的 payload 裡要有 name——不然改了也不會寫回去 */
    const src = await import('fs').then(fs =>
      fs.readFileSync('src/components/TripFormSheet.tsx', 'utf8'));
    expect(src).toMatch(/\.from\('trips'\)[\s\S]{0,120}\.update\(\{[\s\S]{0,80}\bname\b/);
  });

  /* O-5c：名稱欄位兩頁統一叫「這趟叫什麼？」（Rozi 指定的方向是把建立頁的
     「去哪？」改掉，不是反過來）。同一個欄位在兩頁叫兩個名字，
     是最容易讓人以為在改不同東西的寫法。 */
  it('建立頁的名稱欄位改叫「這趟叫什麼？」，「去哪？」不再是欄位標題', async () => {
    render(<TripFormSheet onClose={() => {}} onCreated={() => {}} />);
    await waitFor(() => expect(screen.getByText('這趟去哪？')).toBeInTheDocument());
    expect(screen.getByText('這趟叫什麼？')).toBeInTheDocument();
    const labels = [...document.querySelectorAll('label')].map(l => l.textContent);
    expect(labels, '「去哪？」不該再是欄位標題').not.toContain('去哪？');
  });

  /* O-9　兩頁的欄位標題集合完全相同（排掉各自的頁面標題） */
  it('建立頁與編輯頁的欄位標題集合完全相同', async () => {
    const labelsOf = () => [...document.querySelectorAll('label, .lbl')]
      .map(l => (l.textContent ?? '').trim()).filter(Boolean).sort();
    const a = render(<TripFormSheet onClose={() => {}} onCreated={() => {}} />);
    await waitFor(() => expect(screen.getByText('這趟去哪？')).toBeInTheDocument());
    const create = labelsOf();
    a.unmount(); document.body.innerHTML = '';

    render(<TripFormSheet tripId="t1" onClose={() => {}} onCreated={() => {}} />);
    await waitFor(() => expect(screen.getByText('這趟的支付方式')).toBeInTheDocument());
    const edit = labelsOf();
    expect(edit).toEqual(create);
    expect(create).toContain('這趟叫什麼？');
    expect(create).toContain('當地幣別');
  });

  /* O-6　必填**恰好四個**，而且是這四個 */
  it('必填標示恰好四個：這趟叫什麼？／當地幣別／出發／誰一起去？', async () => {
    render(<TripFormSheet onClose={() => {}} onCreated={() => {}} />);
    await waitFor(() => expect(screen.getByText('這趟去哪？')).toBeInTheDocument());
    const req = [...document.querySelectorAll('.req')].map(l => (l.textContent ?? '').trim());
    /* 先斷言「有東西」，不然一個都沒有時下面的比對會因為兩邊都空而假通過（#29 犯過） */
    expect(req.length, `.req 有 ${req.length} 個`).toBe(4);
    expect([...req].sort()).toEqual(['出發', '這趟叫什麼？', '當地幣別', '誰一起去？'].sort());
    /* 反向：回程與結算模式都不得帶 .req */
    for (const no of ['回程', '這趟怎麼結算？'])
      expect(req, `${no} 不該是必填`).not.toContain(no);
  });
});

/* ══════════════════════════════════════════════════════════════
   實作-N-1　現金匯率的「1」要自動帶值（Rozi 填了 0.19 卻一直算不出來）
   ══════════════════════════════════════════════════════════════ */
describe('O-⑦　匯率「填了一邊，另一邊自動帶 1」', () => {
  /* Rozi 2026-09-06 覆蓋實作-N 的做法。
     實作-N 是「進畫面就依幣別預先在某一欄帶 1」——算得出正確結果，
     但要求使用者先接受系統挑好的那一邊。她要的是「我填哪一邊都行，另一邊自己補」。 */
  it('既有資料照原樣載入，**不替使用者猜方向補 1**', async () => {
    render(<TripFormSheet tripId="t1" onClose={() => {}} onCreated={() => {}} />);
    await waitFor(() => expect(
      (document.getElementById('rate-for') as HTMLInputElement)?.value).toBe('0.19'));
    /* 她把 0.19 填在外幣欄。這裡若自動補台幣 = 1，rate 會變成 0.19 而不是 1/0.19
       ——差 25 倍，而且完全靜默。半填就維持半填，讓提示出來由她自己補。 */
    expect((document.getElementById('rate-twd') as HTMLInputElement).value).toBe('');
    expect(screen.getByText('還差一欄，兩邊都填才換算得出來')).toBeInTheDocument();
  });

  it('填任一欄 → 另一欄自動變 1；清空來源 → 那個 1 也消失', async () => {
    const { nextRate } = await import('./TripFormSheet');
    let r = { twd: '', for: '', auto: null as 'twd' | 'for' | null };
    /* ① 在台幣欄輸入 → 外幣欄自動帶 1 */
    r = nextRate(r, 'twd', '0.21');
    expect(r).toEqual({ twd: '0.21', for: '1', auto: 'for' });
    /* ② 清空來源 → 自動的 1 跟著清掉，不留殘值 */
    r = nextRate(r, 'twd', '');
    expect(r).toEqual({ twd: '', for: '', auto: null });
    /* ③ 改在外幣欄輸入 → 台幣欄自動帶 1（哪一邊都行） */
    r = nextRate(r, 'for', '45');
    expect(r).toEqual({ twd: '1', for: '45', auto: 'twd' });
    /* ④ 使用者自己動過那個 1 → 它就不再是自動的，之後不會被清掉 */
    r = nextRate(r, 'twd', '2');
    expect(r.auto).toBeNull();
    r = nextRate(r, 'for', '');
    expect(r, '動過的值不該被當成自動值清掉').toEqual({ twd: '2', for: '', auto: null });
  });

  it('畫面上真的會自動帶：在台幣欄打字，外幣欄變 1', async () => {
    render(<TripFormSheet onClose={() => {}} onCreated={() => {}} />);
    await waitFor(() => expect(screen.getByText('這趟去哪？')).toBeInTheDocument());
    const twd = document.getElementById('rate-twd') as HTMLInputElement;
    const forr = document.getElementById('rate-for') as HTMLInputElement;
    expect(twd.value, '建立頁兩欄一開始都要空').toBe('');
    expect(forr.value).toBe('');
    fireEvent.change(twd, { target: { value: '0.21' } });
    expect((document.getElementById('rate-for') as HTMLInputElement).value).toBe('1');
  });

  it('placeholder 跟著 oneSideOf 走，不是寫死「台幣那欄是 1」', async () => {
    render(<TripFormSheet tripId="t1" onClose={() => {}} onCreated={() => {}} />);
    await waitFor(() => expect(
      (document.getElementById('rate-twd') as HTMLInputElement)?.placeholder).toBe('1'));
    const twd = document.getElementById('rate-twd') as HTMLInputElement;
    const forr = document.getElementById('rate-for') as HTMLInputElement;
    /* KRW：1 在台幣側 → 台幣 placeholder 是 1、外幣側不是 */
    expect(twd.placeholder).toBe('1');
    expect(forr.placeholder).not.toBe('1');
  });

  it('只填一欄時出提示；兩欄都有值或都空時不出', async () => {
    render(<TripFormSheet tripId="t1" onClose={() => {}} onCreated={() => {}} />);
    await waitFor(() => expect(
      (document.getElementById('rate-for') as HTMLInputElement)?.value).toBe('0.19'));

    /* 載入既有資料：外幣 0.19、台幣空 → 只填一欄 → 要有提示 */
    expect(screen.getByText('還差一欄，兩邊都填才換算得出來')).toBeInTheDocument();

    /* 一動它，另一欄就自動補 1 → 提示消失 */
    fireEvent.change(document.getElementById('rate-for')!, { target: { value: '0.21' } });
    expect(screen.queryByText('還差一欄，兩邊都填才換算得出來'),
      '兩欄都有值就不該再提示').toBeNull();

    /* 兩欄都空是還沒開始填，不提示 */
    fireEvent.change(document.getElementById('rate-for')!, { target: { value: '' } });
    expect(screen.queryByText('還差一欄，兩邊都填才換算得出來')).toBeNull();
  });

  it('`oneSideOf` 只剩下決定 placeholder 與排序，不再決定「1」放哪一欄', async () => {
    render(<TripFormSheet onClose={() => {}} onCreated={() => {}} />);
    await waitFor(() => expect(screen.getByText('這趟去哪？')).toBeInTheDocument());
    const { oneSideOf } = await import('@/lib/currencyTable');
    expect(oneSideOf('JPY')).toBe('for');
    expect(oneSideOf('KRW')).toBe('twd');
    /* 建立頁預設 JPY：實作-N 會在外幣欄預先填 1，現在**兩欄都要空** */
    expect((document.getElementById('rate-for') as HTMLInputElement).value).toBe('');
    expect((document.getElementById('rate-twd') as HTMLInputElement).value).toBe('');
    /* 但 placeholder 仍照 oneSideOf 走：JPY 的 1 在外幣側 */
    expect((document.getElementById('rate-for') as HTMLInputElement).placeholder).toBe('1');
  });
});
