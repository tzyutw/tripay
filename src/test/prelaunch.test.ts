/* 實作-C-5　上線前把關：環境地雷逐條複查（CLAUDE.md 既有清單）。
 *
 * 這幾條都是**咬過的根因**，而且每一條都「不會報錯，只是靜靜地壞掉」——
 * 所以要有東西守著，不能靠每次上線前用眼睛看。
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const SRC: { f: string; s: string }[] = [];
(function walk(d: string) {
  for (const f of fs.readdirSync(d)) {
    const p = path.join(d, f);
    if (fs.statSync(p).isDirectory()) { walk(p); continue; }
    if (/\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f) && !p.includes('/test/'))
      SRC.push({ f: p, s: fs.readFileSync(p, 'utf8') });
  }
})('src');

/** 去掉註解再掃——「禁止 autofocus」這種**寫在註解裡的規則本身**
 *  會被當成違規，於是規則越寫清楚、測試越紅。 */
const noComments = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

describe('C-5-2　環境地雷複查', () => {
  it('掃描範圍本身要有東西', () => {
    expect(SRC.length, `只掃到 ${SRC.length} 個檔`).toBeGreaterThan(15);
  });

  it('trips ↔ trip_members 的 embed 一律寫具名 FK', () => {
    /* 兩條 FK 會讓 PostgREST 回 300／PGRST201，整頁載不出來。
       2026-07-22 的 Blocker #3 就是這個。 */
    const bad: string[] = [];
    let named = 0;
    for (const { f, s } of SRC) {
      for (const m of s.matchAll(/trip_members(!?[a-z_]*)\(/g)) {
        if (m[1] === '!trip_members_trip_id_fkey') named += 1;
        else bad.push(`${f}: trip_members${m[1]}(`);
      }
    }
    /* 掃到幾處要輸出——零處的話這條等於沒驗 */
    expect(named, 'embed 一處都沒掃到，這條等於沒驗').toBeGreaterThanOrEqual(1);
    expect(bad, `沒寫具名 FK：${bad.join('、')}`).toEqual([]);
  });

  it('金額欄位不得用 <input type="number">', () => {
    /* number 不支援 selection API，重繪後 setSelectionRange 拋錯 →
       游標歸 0、字元倒序。回歸：原型_輸入回歸測試.cjs */
    const bad: string[] = [];
    for (const { f, s } of SRC)
      if (/type=["']number["']/.test(s)) bad.push(f);
    expect(bad, `還有 type="number"：${bad.join('、')}`).toEqual([]);
  });

  it('金額欄位用 text ＋ inputMode=decimal', () => {
    const hits = SRC.filter(({ s }) => /inputMode=["']decimal["']/.test(s));
    expect(hits.length, '一處都沒有，這條等於沒驗').toBeGreaterThanOrEqual(1);
  });

  it('sheet／彈窗一律 createPortal 到 document.body', () => {
    /* 頁面根層的 animate-slide-in 帶 transform，會讓 position:fixed 定位錯亂 */
    const sheets = SRC.filter(({ s }) => /animate-sheet-up/.test(s));
    expect(sheets.length, '一個 sheet 都沒掃到').toBeGreaterThanOrEqual(1);
    const bad = sheets.filter(({ s }) => !s.includes('createPortal'));
    expect(bad.map(x => x.f), `sheet 沒有 portal：${bad.map(x => x.f).join('、')}`).toEqual([]);
  });

  it('禁止 autofocus——手機上鍵盤會關掉又跳出來', () => {
    const bad = SRC.filter(({ s }) => /autoFocus|autofocus/.test(noComments(s))).map(x => x.f);
    expect(bad, `還有 autofocus：${bad.join('、')}`).toEqual([]);
  });

  it('每個 DELETE 都要斷言影響列數（RLS 會靜默過濾成 0 列而仍回 200）', () => {
    const bad: string[] = [];
    let deletes = 0;
    for (const { f, s } of SRC) {
      for (const m of s.matchAll(/\.delete\(\)([^\n;]*)/g)) {
        deletes += 1;
        /* 後面必須接 .select()，才拿得到影響列數 */
        if (!m[1].includes('.select()')) bad.push(`${f}: .delete()${m[1].slice(0, 50)}`);
      }
    }
    expect(deletes, '一個 DELETE 都沒掃到，這條等於沒驗').toBeGreaterThanOrEqual(1);
    expect(bad, `DELETE 沒斷言影響列數：${bad.join(' ｜ ')}`).toEqual([]);
  });
});

describe('C-5　停止條件 #3：transferView 兩個檔案都要引用', () => {
  it('SettlementPage 與 SharePage 都用同一份 TransferView', () => {
    const users = SRC.filter(({ s }) => s.includes("shared/TransferView")).map(x => x.f);
    expect(users, `引用 TransferView 的檔案：${users.join('、')}`)
      .toEqual(expect.arrayContaining([
        'src/pages/SettlementPage.tsx',
        'src/pages/SharePage.tsx',
      ]));
  });
});

describe('C-5-3　分享頁的 token 契約（RPC 這一側）', () => {
  const sql = fs.readFileSync('supabase/migrations/013_rls_consolidation_and_share_rpc.sql', 'utf8');

  it('token 不符就回 null——不是回別人的行程', () => {
    expect(sql).toContain('share_token = p_token');
    /* 空字串與 null 都不得當成有效 token，否則「沒設 token 的行程」會全被撈出來 */
    expect(sql).toContain("share_token is not null");
    expect(sql).toContain("share_token <> ''");
    expect(sql).toMatch(/when not exists \(select 1 from t\) then null::jsonb/);
  });

  it('RPC 只授權給 anon／authenticated，不是 public', () => {
    expect(sql).toContain('revoke execute on function public.get_shared_trip(text) from public');
    expect(sql).toContain('grant  execute on function public.get_shared_trip(text) to anon, authenticated');
  });

  it('前端只走 RPC，沒有任何直接查 trips 的分享路徑', () => {
    const share = SRC.find(x => x.f === 'src/pages/SharePage.tsx')!;
    expect(share.s).toContain("rpc('get_shared_trip'");
    expect(share.s, '分享頁不得直接查表——013 已把 anon 讀取收掉')
      .not.toMatch(/\.from\(['"]trips['"]\)/);
  });
});
