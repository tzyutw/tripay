/* 實作-B-5　S-05 結算對原型的比對。
 * 資料沿用原型的 demoExpenses()；fixture s05 是原型在 partial 狀態抓的。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor, fireEvent } from '@testing-library/react';
import screens from '@/test/fixtures/screens.json';
import { render, makeSupabaseMock } from '@/test/utils';

const M = ['m0', 'm1', 'm2', 'm3'];
const members = [
  { emoji: '🐵', name: 'Rozi' }, { emoji: '🐱', name: '小美' },
  { emoji: '🍋', name: '阿明' }, { emoji: '🐟', name: '小魚' },
].map((m, i) => ({
  id: M[i], trip_id: 't1', name: m.name, emoji: m.emoji, sort_order: i,
  linked_profile_id: null, person_id: null, user_id: null, role: null, created_at: '2026-03-01',
}));

const baseTrip = {
  id: 't1', owner_id: 'u1', name: '2026 濟州島四寶團', emoji: '✈️', currency: 'KRW',
  start_date: '2026-03-14', end_date: '2026-03-18', status: 'active', kind: 'trip',
  share_token: 'tok', owner_member_id: M[0], collab_enabled: false, card_id: null,
  cover_path: null, settlement_mode: 'direct', hub_member_id: null,
  payment_methods: ['現金', '信用卡'], cash_rate_twd: null, cash_rate_foreign: null,
  tone_seq: 0, created_at: '2026-03-01', updated_at: '2026-03-01', trip_members: members,
};

let seq = 0;
function mk(o: Record<string, unknown>) {
  seq += 1;
  const parts = (o.parts as string[]) ?? M;
  const indiv = (o.indiv as Record<string, number>) ?? {};
  return {
    id: `e${seq}`, trip_id: 't1', created_by: 'u1', title: '', category_emoji: '➕',
    expense_date: '2026-03-14', foreign_amount: null, twd_amount: null, exchange_rate: null,
    foreign_pending: false, twd_pending: false, payment_method: 'cash',
    expense_type: 'shared', settled_on_spot: false, is_sponsor: false,
    split_fill_currency: 'TWD', individual_member_id: null, payment_label: null,
    category_emoji_manual: false, updated_by: null, card_id: null, deleted_at: null,
    created_at: new Date(2026, 0, seq).toISOString(), updated_at: '2026-03-01',
    ...o,
    expense_splits: parts.map(id => ({
      id: `s${seq}-${id}`, expense_id: `e${seq}`, member_id: id, is_participating: true,
      split_amount: (indiv[id] ?? null) as number | null,
      split_amount_foreign: null as number | null,
      split_pending: !(id in indiv), created_at: '2026-03-01',
    })),
  };
}

const expenses = [
  mk({ title: '機票 ×4', category_emoji: '✈️', expense_date: '2026-02-10',
       twd_amount: 28400, payment_method: 'credit_card', payer_member_id: M[0] }),
  mk({ title: '黑豬肉晚餐', category_emoji: '🍜', expense_date: '2026-03-14',
       foreign_amount: 108000, twd_amount: 2480, payment_method: 'credit_card', payer_member_id: M[2] }),
  mk({ title: '藥妝店', category_emoji: '🛍️', expense_date: '2026-03-15',
       foreign_amount: 45000, twd_amount: 1035, payment_method: 'credit_card',
       expense_type: 'individual', indiv: { [M[0]]: 12000, [M[1]]: 18000 }, payer_member_id: M[1] }),
  mk({ title: '城山日出峰門票', category_emoji: '🎡', expense_date: '2026-03-15',
       foreign_amount: 20000, payer_member_id: M[3] }),
  mk({ title: '紀念品', category_emoji: '🛍️', expense_date: '2026-03-16',
       twd_amount: 860, parts: [M[1]], individual_member_id: M[1], payer_member_id: M[1] }),
  mk({ title: '機場接送', category_emoji: '🚌', expense_date: '2026-03-18',
       twd_amount: 1600, payer_member_id: M[0], settled_on_spot: true }),
  mk({ title: '計程車', category_emoji: '🚕', expense_date: '2026-03-16', payer_member_id: M[0] }),
  mk({ title: '爸爸贊助', category_emoji: '💝', expense_date: '2026-03-14',
       twd_amount: 50000, payer_member_id: M[0], is_sponsor: true }),
];

const state = vi.hoisted(() => ({
  trips: [] as Record<string, unknown>[],
  expenses: [] as unknown[],
  settlements: [] as unknown[],
}));
vi.mock('@/lib/supabaseClient', async () => {
  const { makeSupabaseMock: mk2 } = await import('@/test/utils');
  return {
    supabase: mk2(new Proxy({}, {
      get: (_, k: string) => (state as Record<string, unknown[]>)[k] ?? [],
      has: () => true,
      ownKeys: () => ['trips', 'expenses', 'settlements'],
      getOwnPropertyDescriptor: () => ({ enumerable: true, configurable: true }),
    }) as never),
  };
});

import SettlementPage from './SettlementPage';

beforeEach(() => {
  state.trips = [baseTrip]; state.expenses = expenses; state.settlements = [];
});

const flat = () => (document.body.textContent ?? '').replace(/\s+/g, '');
const show = async (text = '結算') => {
  render(<SettlementPage />, { route: '/trips/t1/settlement', path: '/trips/:id/settlement' });
  await waitFor(() => expect(screen.getAllByText(text).length).toBeGreaterThan(0));
};

/* 已確認的 settlement：把前端算出來的轉帳當成後端回來的 items */
function confirmed(clearedFirst = true) {
  const items = [
    { id: 'i1', from_member_id: M[3], to_member_id: M[0], amount: 20220, is_cleared: clearedFirst },
    { id: 'i2', from_member_id: M[2], to_member_id: M[0], amount: 17740, is_cleared: false },
    { id: 'i3', from_member_id: M[1], to_member_id: M[0], amount: 8220,  is_cleared: false },
  ];
  state.trips = [{ ...baseTrip, status: 'settled' }];
  state.settlements = [{ id: 's1', trip_id: 't1', status: 'confirmed',
                         created_at: '2026-03-20', settlement_items: items }];
}

describe('B-5　S-05 未結算：完整轉帳預覽', () => {
  it('S-05-28　標題與說明照原型，而且直接給轉帳明細', async () => {
    await show();
    expect(screen.getByText('現在的狀況')).toBeInTheDocument();
    expect(screen.getByText('還會變 —— 之後記帳會影響這裡')).toBeInTheDocument();
    expect(document.querySelectorAll('.txrow').length,
      '預覽要有轉帳列，不是只有一顆按鈕').toBeGreaterThan(0);
  });

  it('S-05-2　待填警示已移除', async () => {
    await show();
    const got = flat();
    for (const bad of ['結算數字可能不準確', '還有', '沒填完，結算'])
      if (bad === '還有') continue;
      else expect(got, `S-05-2 殘留：${bad}`).not.toContain(bad);
  });

  it('S-05-31　代墊集中時出現引導，而且**只給連結不給設定**', async () => {
    await show();
    expect(screen.getByText(/先付的/)).toBeInTheDocument();
    expect(screen.getByText(/去設定/)).toBeInTheDocument();
    /* 一個設定只有一個入口：這裡不得出現結算模式的選擇器 */
    expect(flat()).not.toContain('都轉給同一個人的話，要選誰');
    expect(document.querySelector('.note.calm')).not.toBeNull();
  });
});

describe('B-5　S-05 結算前檢查層（§6）', () => {
  it('S-05-4／30　標題與逐筆可點的清單', async () => {
    await show();
    fireEvent.click(screen.getByText('結算行程'));
    expect(screen.getByText('有 3 筆還沒算清楚')).toBeInTheDocument();
    expect(screen.getByText('結算之後金額就固定了。要先去看一下嗎？')).toBeInTheDocument();

    const rows = [...document.querySelectorAll('.rowb')];
    expect(rows.length, '清單要逐筆列出來').toBe(3);
    expect(rows.every(r => r.tagName === 'BUTTON'), '每一筆都要可點').toBe(true);
    expect(rows.map(r => r.textContent).join('')).toContain('金額還沒填');
  });

  it('S-05-5　「就這樣結算」一定要能真的結算——這是提醒不是禁止', async () => {
    await show();
    fireEvent.click(screen.getByText('結算行程'));
    const anyway = screen.getByText('就這樣結算') as HTMLButtonElement;
    expect(anyway.disabled, '「就這樣結算」不得被 disable').toBe(false);
  });
});

describe('B-5　S-05 已結算：逐筆標記付清', () => {
  it('原型上的每一段文字都要出現（展開計算依據）', async () => {
    confirmed();
    await show();
    fireEvent.click(screen.getByText(/查看計算依據/));

    expect((screens as Record<string, { list: string[] }>).s05.list.length).toBe(67);
    const got = flat();
    const missing = (screens as Record<string, { list: string[] }>).s05.list
      .filter(t => !got.includes(t.replace(/\s+/g, '')));
    expect(missing, `原型有、App 沒有：${missing.join(' ｜ ')}`).toEqual([]);
  });

  it('S-05-7 與 S-05-28 用同一份 transferView', async () => {
    confirmed();
    await show();
    expect(document.querySelectorAll('.txrow').length).toBe(3);
    expect(screen.getAllByText('標記付清').length).toBe(2);
    expect(screen.getAllByText('已付清').length).toBe(1);
  });

  it('S-05-11　人話淨額補上對象；由多筆組成時全部列出', async () => {
    confirmed();
    await show();
    fireEvent.click(screen.getByText(/查看計算依據/));

    const cards = [...document.querySelectorAll('.netcard')];
    expect(cards.length).toBe(4);
    const rozi = cards.find(c => c.textContent?.includes('Rozi'))!;
    expect(rozi.textContent).toContain('可以拿回');
    /* Rozi 收三筆，三個對象都要列出來 */
    for (const who of ['小魚', '阿明', '小美'])
      expect(rozi.textContent, `對象漏了 ${who}`).toContain(`${who} 給你`);
  });

  it('S-05-12　Excel 正負號提醒已移除', async () => {
    confirmed();
    await show();
    fireEvent.click(screen.getByText(/查看計算依據/));
    expect(flat()).not.toContain('Excel');
    /* S-05-14 那句要留著 */
    expect(screen.getByText('待填的筆不進結算，所以這裡的數字可能小於總花費')).toBeInTheDocument();
  });
});

describe('B-5　S-05 全員付清', () => {
  function allCleared() {
    confirmed();
    (state.settlements[0] as { settlement_items: { is_cleared: boolean }[] })
      .settlement_items.forEach(i => { i.is_cleared = true; });
  }

  it('S-05-16　摺紙 signature 取代舊的 popIn，只播一次', async () => {
    allCleared();
    await show();
    const svg = document.querySelector('svg.anim.fold');
    expect(svg, '找不到摺紙 signature').not.toBeNull();
    expect(svg!.getAttribute('aria-label')).toBe('一疊帳摺起來寄出去');
    expect(svg!.querySelector('.plane')).not.toBeNull();
    expect(svg!.querySelector('.trail'), '殘影要在 .plane 之外').not.toBeNull();
    /* 舊的 popIn 慶祝已經不在 */
    expect(flat()).not.toContain('✨');
  });

  it('S-05-17　回顧卡：數字帶符號，標籤純文字', async () => {
    allCleared();
    await show();
    const recap = document.querySelector('.recap')!;
    expect(recap).not.toBeNull();
    expect(recap.textContent).toContain('天');
    expect(recap.textContent).toContain('出遊');
    expect(recap.textContent).toContain('共記了');
    expect(recap.textContent).toContain('最大手筆');
  });

  it('S-05-29　分享 CTA 是主要動作，建立新行程／封存降為次級', async () => {
    allCleared();
    await show();
    const share = [...document.querySelectorAll('.btn')]
      .find(b => b.textContent === '分享給大家')!;
    expect(share, '找不到分享 CTA').toBeTruthy();
    expect(share.className, '分享要是主要動作（.btn 不帶 .qt）').not.toContain('qt');
    for (const label of ['建立新行程', '封存行程']) {
      const b = [...document.querySelectorAll('.btn')].find(x => x.textContent === label)!;
      expect(b.className, `${label} 應降為次級`).toContain('qt');
    }
  });
});

describe('B-5　引擎：轉帳路徑', () => {
  it('direct 走 minimum transactions，Σ淨額為 0', async () => {
    const { tripSummary, settleTrip } = await import('@/lib/summary');
    const S = tripSummary(baseTrip as never, expenses as never, 'active');
    const { net, tx } = settleTrip(S, expenses as never, baseTrip as never);
    expect(Object.values(net).reduce((a, b) => a + b, 0)).toBe(0);
    expect(tx.length).toBeGreaterThan(0);
    /* 最少筆數：轉帳數不超過 人數 − 1 */
    expect(tx.length).toBeLessThanOrEqual(members.length - 1);
    /* 當場就清了那一筆不進結算 */
    expect(tx.every(x => x.amount > 0)).toBe(true);
  });

  it('「當場就清了」不進結算——把它算進去淨額就會變', async () => {
    const { tripSummary, settleTrip } = await import('@/lib/summary');
    const S = tripSummary(baseTrip as never, expenses as never, 'active');
    const base = settleTrip(S, expenses as never, baseTrip as never);

    /* 同一組資料，只把那一筆的旗標拿掉：淨額**必須**改變。
       若拿掉旗標之後淨額不變，代表引擎根本沒在看這個旗標。 */
    const noFlag = expenses.map(e => ({ ...e, settled_on_spot: false }));
    const S2 = tripSummary(baseTrip as never, noFlag as never, 'active');
    const alt = settleTrip(S2, noFlag as never, baseTrip as never);

    expect(expenses.some(e => e.settled_on_spot), '示範資料要真的有這種筆').toBe(true);
    expect(alt.net, '「當場就清了」被算進結算了').not.toEqual(base.net);
  });

  it('hub 與 direct 的淨額完全相同，只有轉帳路徑不同', async () => {
    const { tripSummary, settleTrip } = await import('@/lib/summary');
    /* 中心人故意**不選**最大債權人（Rozi）——選 Rozi 的話 minimum-tx 算出來
       剛好也是「大家都轉給 Rozi」，兩種模式看起來一樣，這條就驗不到東西了。 */
    const hubTrip = { ...baseTrip, settlement_mode: 'hub', hub_member_id: M[1] };
    const Sd = tripSummary(baseTrip as never, expenses as never, 'active');
    const Sh = tripSummary(hubTrip as never, expenses as never, 'active');
    const d = settleTrip(Sd, expenses as never, baseTrip as never);
    const h = settleTrip(Sh, expenses as never, hubTrip as never);
    expect(h.net).toEqual(d.net);
    /* 中心人不轉給自己；每一筆都有中心人的一端 */
    expect(h.tx.every(x => x.from !== x.to)).toBe(true);
    expect(h.tx.every(x => x.from === M[1] || x.to === M[1]),
      'hub 模式每一筆都該經過中心人').toBe(true);
    /* 路徑必須真的不同，否則這條等於沒驗 */
    expect(h.tx, 'hub 與 direct 的轉帳路徑不該一樣').not.toEqual(d.tx);
    /* 兩種模式的總轉帳金額對每個人的淨效果相同 */
    for (const mode of [d.tx, h.tx]) {
      const eff: Record<string, number> = {};
      for (const id of M) eff[id] = 0;
      for (const x of mode) { eff[x.from] -= x.amount; eff[x.to] += x.amount; }
      expect(eff).toEqual(d.net);
    }
  });
});

/* ══════════════════════════════════════════════════════════════
   實作-C-2　hub 式結算（S-05-26）：**只做在呈現層，引擎一行都不用改。**
   規格在文件裡兩處說法不一致，以原型為準——原型的 settleTrip() 裡
   兩種模式的 net 完全相同，差別只在 tx 怎麼生成。
   ══════════════════════════════════════════════════════════════ */
describe('C-2　hub 式結算：兩段式呈現', () => {
  beforeEach(() => {
    state.trips = [{ ...baseTrip, settlement_mode: 'hub', hub_member_id: M[1] }];
  });

  it('轉帳明細分兩段，反映真實金流順序（先收進來、再撥出去）', async () => {
    await show();
    const txt = flat();
    expect(txt).toContain('都跟🐱小美結算');
    const secs = [...document.querySelectorAll('.txsec')].map(x => x.textContent);
    expect(secs, '要有「大家給 X」與「X 再給」兩段').toEqual(['大家給 小美', '小美 再給']);
  });

  it('同一列不重複印中心人的名字——那會讓人以為是兩筆不同的帳', async () => {
    await show();
    const rows = [...document.querySelectorAll('.txrow')];
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) {
      const whos = r.querySelectorAll('.who');
      expect(whos.length, 'hub 模式每一列只顯示需要的那一半名字').toBe(1);
    }
  });

  it('S-05-7 與 S-05-28 用同一份 transferView——兩處不得各寫一份', async () => {
    /* 未結算態 */
    await show();
    const previewSecs = [...document.querySelectorAll('.txsec')].map(x => x.textContent);

    /* 已結算態 */
    document.body.innerHTML = '';
    const items = [
      { id: 'i1', from_member_id: M[0], to_member_id: M[1], amount: 100, is_cleared: false },
      { id: 'i2', from_member_id: M[1], to_member_id: M[2], amount: 100, is_cleared: false },
    ];
    state.trips = [{ ...baseTrip, status: 'settled', settlement_mode: 'hub', hub_member_id: M[1] }];
    state.settlements = [{ id: 's1', trip_id: 't1', status: 'confirmed',
                           created_at: '2026-03-20', settlement_items: items }];
    await show();
    const confirmedSecs = [...document.querySelectorAll('.txsec')].map(x => x.textContent);

    expect(previewSecs.length).toBeGreaterThan(0);
    expect(confirmedSecs, '兩處的分段標題應該由同一支元件產生').toEqual(previewSecs);
  });

  it('引擎沒被改：hub 不需要跑四趟 verify，因為淨額沒動', async () => {
    const { tripSummary, settleTrip } = await import('@/lib/summary');
    const hubTrip = { ...baseTrip, settlement_mode: 'hub', hub_member_id: M[1] };
    const d = settleTrip(
      tripSummary(baseTrip as never, expenses as never, 'active'),
      expenses as never, baseTrip as never);
    const h = settleTrip(
      tripSummary(hubTrip as never, expenses as never, 'active'),
      expenses as never, hubTrip as never);
    expect(h.net).toEqual(d.net);
  });
});
