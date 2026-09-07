/* 實作-B-1　S-02（建立）與 S-02b（編輯）對原型的文字比對。
 *
 * 基準是 `src/test/fixtures/screens.json`——原型**操作模式**同一畫面的字串集合。
 * 原型是規格，所以比對對象是原型，不是「上一版的自己」。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor, fireEvent } from '@testing-library/react';
import screens from '@/test/fixtures/screens.json';
import { render, makeSupabaseMock, supabaseWrites } from '@/test/utils';

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

  /* 實作-S-2：這一條原本只測**建立頁沒有成員**的狀態，
     所以成員列那顆 `✕` 從來沒被掃到過。改成**成員列有渲染出來**的狀態下掃整個 sheet。 */
  it('不要用字元充當 icon（✕ ＋ ✓ 都不行）——成員列有渲染出來的狀態', async () => {
    render(<TripFormSheet tripId="t1" onClose={() => {}} onCreated={() => {}} />);
    /* 守門：先確認成員列真的畫出來了，否則這條會因為沒東西可掃而假通過 */
    await waitFor(() => expect(screen.getByText('Rozi')).toBeInTheDocument());
    expect(document.querySelectorAll('.rowb .tap44').length).toBeGreaterThanOrEqual(4);
    const txt = document.body.textContent ?? '';
    for (const ch of ['✕', '＋', '✓', '⠿', '×']) expect(txt).not.toContain(ch);
  });

  it('建立頁（沒有成員）也不得有字元 icon', async () => {
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

  /* 實作-Q-1：兩格改一格（Rozi 拍板方案 C）。placeholder 給該幣別的量級範例，
     KRW 是「1 台幣 = 43 韓元」那個方向，所以是 43 而不是 0.023。 */
  it('現金匯率只有一個輸入框，placeholder 是該幣別的量級範例', async () => {
    open();
    await waitFor(() => expect(screen.getAllByText('KRW').length).toBeGreaterThan(0));
    const inputs = document.querySelectorAll('.ratebox .rateinput');
    expect(inputs).toHaveLength(1);
    expect(document.querySelectorAll('.raterow')[0].getAttribute('data-side')).toBe('one');
    expect((inputs[0] as HTMLInputElement).placeholder).toBe('43');
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
    /* 實作-P：高度改由 `--h-field` 決定，**元件上不得再有字面值**。
       jsdom 量不到 computed height（沒有版面引擎），所以這裡只守
       「不要又把字面值寫回元件」；真正的 40px 由
       `實作_高度階梯與圖示測試.cjs` 在真實 Chrome 上量。 */
    expect(input.className, '高度字面值又寫回元件了').not.toMatch(/h-\[\d+px\]/);
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
   實作-Q-1　匯率改成「一個空格＋系統判方向」（Rozi 2026-09-06 拍板方案 C）

   推翻實作-O 的「填一邊、另一邊自動帶 1」：那讓使用者可以組出**方向相反**
   的兩個數字，而系統無從分辨——308500 日圓被存成 1,469,048 台幣
   （正確 64,785）而且 twd_pending=false，錯的值被當成確定值寫進資料庫。
   ══════════════════════════════════════════════════════════════ */
describe('Q-①b　方向判定：跟幣別量級比，不是跟 1 比', () => {
  it('逐條給值', async () => {
    const { rateDirection } = await import('@/lib/currencyTable');
    /* Rozi 的直覺（小於 1 用乘、大於 1 用除）在這些幣別上是對的 */
    expect(rateDirection('JPY', 0.21)).toBe('for-unit');
    expect(rateDirection('KRW', 45)).toBe('twd-unit');
    /* 但在美元／人民幣這種「1 外幣值很多台幣」的幣別上會反——
       她填「美元匯率 32」，照跟 1 比會變成 1 台幣 = 32 美元 */
    expect(rateDirection('USD', 32)).toBe('for-unit');
    expect(rateDirection('CNY', 4.4)).toBe('for-unit');
    /* 反過來填也要判得出來 */
    expect(rateDirection('JPY', 4.76)).toBe('twd-unit');
    /* 判不出來就不判定，維持「還沒設匯率」——不要猜 */
    expect(rateDirection('JPY', 0)).toBeNull();
    expect(rateDirection('JPY', -1)).toBeNull();
    expect(rateDirection('JPY', NaN)).toBeNull();
    expect(rateDirection('ZZZ', 5)).toBeNull();
  });

  it('N === 1 是平手，沿用既有的 oneSideOf，不另定規則', async () => {
    const { rateDirection, oneSideOf } = await import('@/lib/currencyTable');
    for (const code of ['JPY', 'KRW', 'USD'])
      expect(rateDirection(code, 1)).toBe(oneSideOf(code) === 'for' ? 'for-unit' : 'twd-unit');
  });

  it('一個數字＋方向 → trips 那兩欄，換算結果與 tripRate() 對得起來', async () => {
    const { rateColumns, rateFromColumns } = await import('@/lib/currencyTable');
    const { tripRate } = await import('@/lib/summary');
    /* JPY 0.21 → 1 日圓 = 0.21 台幣 → 308500 日圓 = 64,785 台幣 */
    const jpy = rateColumns(0.21, 'for-unit');
    expect(jpy).toEqual({ cash_rate_foreign: 1, cash_rate_twd: 0.21 });
    expect(Math.round(308500 / tripRate(jpy as never)!)).toBe(64785);
    /* KRW 45 → 1 台幣 = 45 韓元 → 45000 韓元 = 1,000 台幣 */
    const krw = rateColumns(45, 'twd-unit');
    expect(krw).toEqual({ cash_rate_twd: 1, cash_rate_foreign: 45 });
    expect(Math.round(45000 / tripRate(krw as never)!)).toBe(1000);
    /* USD 32 → 1 美元 = 32 台幣 → 3200 美元 = 102,400 台幣 */
    const usd = rateColumns(32, 'for-unit');
    expect(Math.round(3200 / tripRate(usd as never)!)).toBe(102400);
    /* 空值不寫任何東西 */
    expect(rateColumns(null, 'for-unit')).toEqual({ cash_rate_twd: null, cash_rate_foreign: null });
    expect(rateColumns(0.21, null)).toEqual({ cash_rate_twd: null, cash_rate_foreign: null });
    /* 讀回來要還原成同一組 */
    expect(rateFromColumns(jpy)).toEqual({ n: 0.21, dir: 'for-unit' });
    expect(rateFromColumns(krw)).toEqual({ n: 45, dir: 'twd-unit' });
    /* 兩欄都不是 1 的舊資料 → 換算成方向一 */
    expect(rateFromColumns({ cash_rate_twd: 2, cash_rate_foreign: 4 }))
      .toEqual({ n: 0.5, dir: 'for-unit' });
  });
});

describe('Q-①a　畫面：一個空格＋白話那一行＋換個方向', () => {
  it('只有一個輸入框（反向斷言，防兩個空格都留著）', async () => {
    render(<TripFormSheet tripId="t1" onClose={() => {}} onCreated={() => {}} />);
    await waitFor(() => expect(screen.getByText('這趟的現金匯率')).toBeInTheDocument());
    expect(document.querySelectorAll('.rateinput').length).toBe(1);
    expect(document.getElementById('rate-twd'), '舊的兩格還在').toBeNull();
    expect(document.getElementById('rate-for')).toBeNull();
  });

  it('既有資料還原成「一個數字＋方向」', async () => {
    /* fixture：cash_rate_foreign 0.19、cash_rate_twd null → 兩欄湊不成匯率 → 空 */
    render(<TripFormSheet tripId="t1" onClose={() => {}} onCreated={() => {}} />);
    await waitFor(() => expect(screen.getByText('這趟的現金匯率')).toBeInTheDocument());
    expect((document.getElementById('rate-one') as HTMLInputElement).value).toBe('');
  });

  it('填 0.21 → 出現「1 日圓 ＝ 0.21 台幣」；按「換個方向」→ 變成「1 台幣 ＝ 0.21 日圓」', async () => {
    render(<TripFormSheet onClose={() => {}} onCreated={() => {}} />);
    await waitFor(() => expect(screen.getByText('這趟去哪？')).toBeInTheDocument());
    const one = document.getElementById('rate-one') as HTMLInputElement;
    expect(one.value, '一開始要空').toBe('');
    fireEvent.change(one, { target: { value: '0.21' } });
    expect(screen.getByText('1 日圓 ＝ 0.21 台幣')).toBeInTheDocument();
    fireEvent.click(screen.getByText('換個方向'));
    expect(screen.getByText('1 台幣 ＝ 0.21 日圓')).toBeInTheDocument();
  });

  it('按過「換個方向」之後再改數字，不會被自動判定翻回去', async () => {
    const { nextRate, flipRate } = await import('./TripFormSheet');
    let r = nextRate({ n: '', dir: null, flipped: false }, 'JPY', '0.21');
    expect(r.dir).toBe('for-unit');
    r = flipRate(r);
    expect(r).toEqual({ n: '0.21', dir: 'twd-unit', flipped: true });
    r = nextRate(r, 'JPY', '0.22');
    expect(r.dir, '改一個字方向就跳回去的話，使用者救不回來').toBe('twd-unit');
    /* 清空就整組歸零 */
    r = nextRate(r, 'JPY', '');
    expect(r).toEqual({ n: '', dir: null, flipped: false });
  });
});

/* ══════════════════════════════════════════════════════════════
   實作-O-6c　停止條件 18（Cowork 2026-09-06 清點後補上）
   Rozi 明講「這一欄位只要有調整，就改變結算方式」，
   但原本**沒有任何斷言**在守——顯示對了不代表存進去了。
   ══════════════════════════════════════════════════════════════ */
describe('O-⑥c　結算方式改了要真的寫進去', () => {
  const lastWrite = (table: string, op: string) =>
    [...supabaseWrites].reverse().find(w => w.table === table && w.op === op)?.payload as
      Record<string, unknown> | undefined;

  it('建立頁選「都轉給同一個人」＋指定中心人 → 存出 hub ＋ 那個人的 id', async () => {
    supabaseWrites.length = 0;
    render(<TripFormSheet onClose={() => {}} onCreated={() => {}} />);
    await waitFor(() => expect(screen.getByText('這趟去哪？')).toBeInTheDocument());

    /* 必填先填齊，不然按了會被擋下來（O-6d）*/
    fireEvent.change(screen.getByPlaceholderText('例如：沖繩四人行 ☀️'), { target: { value: 'ZZ 結算方式' } });
    fireEvent.change(document.querySelector('input[aria-label="出發"]')!, { target: { value: '2026-05-01' } });
    fireEvent.click(screen.getByText('新增成員'));
    fireEvent.change(screen.getByPlaceholderText('叫什麼名字？'), { target: { value: 'Alex' } });
    fireEvent.click(screen.getByText('加進來'));

    fireEvent.click(screen.getByText('都轉給同一個人'));
    await waitFor(() => expect(document.querySelector('.chips .chip')).not.toBeNull());
    fireEvent.click(document.querySelector('.chips .chip')!);

    fireEvent.click(screen.getByText('出發！'));
    await waitFor(() => expect(lastWrite('trips', 'insert')).toBeTruthy());
    expect(lastWrite('trips', 'insert')!.settlement_mode).toBe('hub');
    /* hub_member_id 要等成員插入拿到真 id 之後才寫得出來，所以是接著的那一次 update */
    await waitFor(() => expect(lastWrite('trips', 'update')?.hub_member_id).toBeTruthy());
    const members2 = lastWrite('trip_members', 'insert') as unknown as unknown[] | undefined;
    expect(Array.isArray(members2) ? members2.length : -1).toBe(1);
  });

  it('建立頁維持預設 → 存出 direct', async () => {
    supabaseWrites.length = 0;
    render(<TripFormSheet onClose={() => {}} onCreated={() => {}} />);
    await waitFor(() => expect(screen.getByText('這趟去哪？')).toBeInTheDocument());
    fireEvent.change(screen.getByPlaceholderText('例如：沖繩四人行 ☀️'), { target: { value: 'ZZ 預設' } });
    fireEvent.change(document.querySelector('input[aria-label="出發"]')!, { target: { value: '2026-05-01' } });
    fireEvent.click(screen.getByText('新增成員'));
    fireEvent.change(screen.getByPlaceholderText('叫什麼名字？'), { target: { value: 'Alex' } });
    fireEvent.click(screen.getByText('加進來'));
    fireEvent.click(screen.getByText('出發！'));
    await waitFor(() => expect(lastWrite('trips', 'insert')).toBeTruthy());
    expect(lastWrite('trips', 'insert')!.settlement_mode).toBe('direct');
  });

  it('編輯頁把 hub 改回 direct → 存出 direct 且 hub_member_id 是 null', async () => {
    render(<TripFormSheet tripId="t1" onClose={() => {}} onCreated={() => {}} />);
    /* **要等 hydration 真的灌完再點**：行程是非同步載入的，
       在灌值之前點下去，`setSettleMode(existingTrip.settlement_mode)` 會把選擇蓋回 direct
       ——那是測試的時序問題，不是功能壞掉。等名稱有值就代表灌完了。 */
    await waitFor(() => expect(
      (screen.getByPlaceholderText('例如：沖繩四人行 ☀️') as HTMLInputElement).value).toBe('2026 濟州島四寶團'));
    fireEvent.click(screen.getByText('都轉給同一個人'));
    await waitFor(() => expect(document.querySelector('.chips .chip')).not.toBeNull());
    fireEvent.click(document.querySelector('.chips .chip')!);
    fireEvent.click(screen.getByText('誰欠誰就轉給誰'));

    supabaseWrites.length = 0;
    fireEvent.click(screen.getByText('儲存'));
    await waitFor(() => expect(lastWrite('trips', 'update')).toBeTruthy());
    const row = lastWrite('trips', 'update')!;
    expect(row.settlement_mode).toBe('direct');
    expect(row.hub_member_id).toBeNull();
  });

  it('編輯頁選 hub ＋ 既有成員 → 存出 hub ＋ 那位的真 id', async () => {
    render(<TripFormSheet tripId="t1" onClose={() => {}} onCreated={() => {}} />);
    /* **要等 hydration 真的灌完再點**：行程是非同步載入的，
       在灌值之前點下去，`setSettleMode(existingTrip.settlement_mode)` 會把選擇蓋回 direct
       ——那是測試的時序問題，不是功能壞掉。等名稱有值就代表灌完了。 */
    await waitFor(() => expect(
      (screen.getByPlaceholderText('例如：沖繩四人行 ☀️') as HTMLInputElement).value).toBe('2026 濟州島四寶團'));
    fireEvent.click(screen.getByText('都轉給同一個人'));
    await waitFor(() => expect(document.querySelector('.chips .chip')).not.toBeNull());
    fireEvent.click([...document.querySelectorAll('.chips .chip')][1]);

    supabaseWrites.length = 0;
    fireEvent.click(screen.getByText('儲存'));
    await waitFor(() => expect(lastWrite('trips', 'update')).toBeTruthy());
    const row = lastWrite('trips', 'update')!;
    expect(row.settlement_mode).toBe('hub');
    expect(row.hub_member_id).toBe('m2');
  });
});
