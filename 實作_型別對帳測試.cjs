/* 實作-A2-①　A-0b：型別欄位集合 == 實際 schema 欄位集合
 *
 * schema 那一側從 supabase/migrations/*.sql 推導（001 建表 ＋ 之後每個 alter add column），
 * 不是手抄的清單——手抄的清單會跟著人一起漏。
 * 產出三欄比對表（型別有／schema 有／是否相符），差異列數必須為 0。
 */
const fs = require('fs'), path = require('path');

const TS = fs.readFileSync('src/types/database.ts', 'utf8');
const MIG_DIR = 'supabase/migrations';
const TABLES = ['trips', 'trip_members', 'expenses', 'expense_splits'];
const IFACE = { trips: 'Trip', trip_members: 'TripMember', expenses: 'Expense', expense_splits: 'ExpenseSplit' };

/* ── schema 側：從 migration 檔推 ───────────────────────────── */
/* ⚠️ 先拿掉 SQL 註解再 parse。migration 檔慣例會把 rollback 語句用 `--` 註解起來
   （010 檔尾就有 `-- alter table trips drop column hub_member_id;`），
   不剝掉的話會被當成真的 drop，把兩個實際存在的欄位從推導結果裡刪掉。 */
const sql = fs.readdirSync(MIG_DIR).filter(f => f.endsWith('.sql')).sort()
  .map(f => fs.readFileSync(path.join(MIG_DIR, f), 'utf8')).join('\n')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n').map(l => l.replace(/--.*$/, '')).join('\n');

const schema = {};
for (const t of TABLES) schema[t] = new Set();

/* create table: 取括號內每一行的第一個識別字 */
for (const m of sql.matchAll(/create table (?:if not exists )?(?:public\.)?(\w+)\s*\(([\s\S]*?)\n\s*\);/gi)) {
  const t = m[1]; if (!schema[t]) continue;
  let depth = 0, line = '';
  for (const raw of m[2].split('\n')) {
    const s = raw.trim();
    if (!s || s.startsWith('--')) continue;
    if (depth === 0) line = s;
    depth += (s.match(/\(/g) || []).length - (s.match(/\)/g) || []).length;
    if (depth > 0) continue;
    const c = line.match(/^"?([a-z_]+)"?\s+/);
    if (c && !/^(primary|foreign|unique|check|constraint|exclude)$/i.test(c[1])) schema[t].add(c[1]);
  }
}
/* alter table … add／drop column。
   ⚠️ 一定要**逐敘述**parse：用 [\s\S]*? 從 `alter table X` 一路吃到下一個
   `add column` 會跨過分號，把別張表的欄位算到 X 頭上——第一版就是這樣把
   settled_on_spot 算進 trips、payment_methods 算進 expenses。 */
for (const stmt of sql.split(';')) {
  const t = stmt.match(/alter table\s+(?:if exists\s+)?(?:public\.)?"?(\w+)"?/i);
  if (!t || !schema[t[1]]) continue;
  for (const m of stmt.matchAll(/add column\s+(?:if not exists\s+)?"?([a-z_]+)"?/gi)) schema[t[1]].add(m[1]);
  for (const m of stmt.matchAll(/drop column\s+(?:if exists\s+)?"?([a-z_]+)"?/gi)) schema[t[1]].delete(m[1]);
}

/* ── 型別側 ─────────────────────────────────────────────────── */
const tsFields = {};
for (const t of TABLES) {
  const m = TS.match(new RegExp(`export interface ${IFACE[t]} \\{([\\s\\S]*?)\\n\\}`));
  if (!m) { tsFields[t] = new Set(); continue; }
  tsFields[t] = new Set([...m[1].matchAll(/^\s{2}([a-z_]+)\??:/gm)].map(x => x[1]));
}

/* ── 比對 ───────────────────────────────────────────────────── */
let pass = 0, fail = 0, diffRows = 0;
const ok = (c, m) => { c ? pass++ : (fail++, console.log('   [X] ' + m)); };
const md = [];
md.push('| 表 | 欄位 | 型別有 | schema 有 | 相符 |');
md.push('|---|---|---|---|---|');

for (const t of TABLES) {
  const all = [...new Set([...schema[t], ...tsFields[t]])].sort();
  console.log(`\n=== ${t}（${IFACE[t]}）schema ${schema[t].size} 欄｜型別 ${tsFields[t].size} 欄 ===`);
  const bad = [];
  for (const f of all) {
    const inTs = tsFields[t].has(f), inDb = schema[t].has(f);
    if (!inTs || !inDb) { bad.push(`${f}(型別${inTs ? '有' : '無'}/schema${inDb ? '有' : '無'})`); diffRows++;
      md.push(`| ${t} | \`${f}\` | ${inTs ? '✅' : '❌'} | ${inDb ? '✅' : '❌'} | ❌ |`); }
  }
  console.log('   差異:', bad.length ? bad.join('　') : '（無）');
  ok(bad.length === 0, `${t} 有 ${bad.length} 欄對不起來：${bad.join('　')}`);
  /* 下限：目標不存在時不得算通過 */
  ok(schema[t].size >= 6, `${t} 只從 migration 推出 ${schema[t].size} 欄，太少——推導八成壞了`);
  ok(tsFields[t].size >= 6, `${IFACE[t]} 只有 ${tsFields[t].size} 欄，太少`);
}

console.log('\n=== 012 的十二個欄位逐欄確認 ===');
const NEW12 = [['expense_splits','split_amount_foreign'],['expenses','split_fill_currency'],
  ['expenses','individual_member_id'],['trips','payment_methods'],['expenses','payment_label'],
  ['trips','cash_rate_twd'],['trips','cash_rate_foreign'],['expenses','category_emoji_manual'],
  ['trips','tone_seq'],['trip_members','user_id'],['expenses','updated_by'],['trip_members','role']];
for (const [t, f] of NEW12) {
  const okk = tsFields[t].has(f) && schema[t].has(f);
  if (!okk) console.log(`   [X] ${t}.${f}`);
  ok(okk, `012 的 ${t}.${f} 沒有同時出現在型別與 schema`);
}
console.log(`   十二欄全部到位: ${NEW12.every(([t,f]) => tsFields[t].has(f) && schema[t].has(f))}`);

console.log('\n=== 命名陷阱 ===');
/* 只看程式碼，不看註解——註解裡寫「不是 rate_twd」會誤觸自己的斷言 */
const TS_CODE = TS.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
ok(!/\brate_twd\b|\brate_for\b/.test(TS_CODE), '現金匯率要叫 cash_rate_twd／cash_rate_foreign，不是舊寫法');
ok(/split_fill_currency: SplitFillCurrency/.test(TS), 'split_fill_currency 要用 check 約束的值域型別，不是 string');
ok(/'TWD' \| 'FOR'/.test(TS), 'SplitFillCurrency 的值域照 production 實查是 TWD／FOR');
ok(/'editor' \| 'viewer'/.test(TS), 'MemberRole 的值域照 production 實查是 editor／viewer');

fs.writeFileSync('Claude outputs/_型別對帳表.md',
  `# A-0b 型別 vs schema 三欄比對\n\n差異列數：**${diffRows}**\n\n` +
  (diffRows ? md.join('\n') : '（四張表的欄位集合完全相符，沒有差異列）\n') + '\n');
console.log(`\n三欄比對表已寫到 Claude outputs/_型別對帳表.md　差異列數 = ${diffRows}`);
ok(diffRows === 0, `差異列數必須為 0，實際 ${diffRows}`);

console.log('\n============================');
console.log(`通過 ${pass}　失敗 ${fail}`);
process.exit(fail ? 1 : 0);
