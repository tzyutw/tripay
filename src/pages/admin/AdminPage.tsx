/* 後台管理儀表板（唯讀）。
 *
 * 目的只有一個：家人說「怪怪的」時，1 分鐘內看出是哪一趟、哪個人、哪一筆。
 *
 *   /admin                 A 行程總覽（有異常的排最上面）
 *   /admin/trips/:tripId   B 行程詳情：成員／健康檢查／帳目／結算／這趟的紀錄
 *   /admin/log             C 操作紀錄
 *   /admin/errors          D 錯誤紀錄
 *   /admin/people[/:id]    E 用人查
 *
 * ⚠️ 這一頁**沒有任何寫入**：沒有 insert／update／delete、沒有 mutation。
 *    `AdminPage.test.tsx` 會斷言整個 /admin 走一圈之後 supabase 的寫入次數是 0。
 * ⚠️ 安全不靠這裡：資料只能從 `admin_*` 函式拿，函式在資料庫端檢查身分。
 *    這裡的 gate 只是讓不是管理者的人直接回到行程列表，不要看到空白頁。
 */
import { useMemo, useState } from 'react';
import { Navigate, NavLink, Route, Routes, useNavigate, useParams } from 'react-router-dom';
import { Icon } from '@/components/Icon';
import { calc, toSharedExpense } from '@/lib/summary';
import { memberLabel } from '@/lib/format';
import { familySettlementView, PAGE_STATE_LABEL } from '@/lib/admin/settlementView';
import { describeAudit, namesFromAudit, payLabel, type AuditEntry, type AuditRow } from '@/lib/admin/audit';
import {
  accountStats, ago, boundUserId, buildTrips, fmtTime, involves, recorderOf, sortForOverview, type ModelTrip,
} from '@/lib/admin/model';
import type { ExpenseWithSplits, TripMember } from '@/types/database';
import {
  useAudit, useErrors, useIsAdmin, useSnapshot,
  type AdminTrip, type AdminUser, type ErrorRow, type Snapshot,
} from './data';

type Trip = ModelTrip<AdminTrip>;

const KIND_LABEL: Record<string, string> = { save: '存檔失敗', sync: '讀取／同步失敗', other: '其他錯誤' };
const money = (v: number) =>
  `${v < 0 ? '−' : ''}$${Math.abs(Math.round(v)).toLocaleString('en-US')}`;
const fnum = (v: number) => Math.round(v * 100) / 100 === Math.round(v)
  ? Math.round(v).toLocaleString('en-US')
  : v.toLocaleString('en-US', { maximumFractionDigits: 2 });

// ── 外殼 ──────────────────────────────────────────────────────────────────────

export default function AdminPage() {
  const check = useIsAdmin();
  if (check.isLoading) return <div className="spin"><i /></div>;
  /* 不是管理者（或 migration 還沒套）：當作這個網址不存在，回行程列表 */
  if (!check.data) return <Navigate to="/" replace />;
  return <AdminShell />;
}

function AdminShell() {
  const snap = useSnapshot(true);
  const navigate = useNavigate();
  const model = useMemo(() => snap.data ? buildModel(snap.data) : null, [snap.data]);

  return (
    <div className="min-h-screen bg-bg" data-admin>
      <div className="bar">
        <button className="ic2" aria-label="回到 Tripay" onClick={() => navigate('/')}>
          <Icon name="back" size={20} />
        </button>
        <span className="ttl">後台（唯讀）</span>
        <span style={{ width: 40 }} />
      </div>
      <nav className="flex gap-2 px-[14px] py-2 flex-wrap" aria-label="後台分頁">
        <Tab to="/admin" end>行程</Tab>
        <Tab to="/admin/log">操作紀錄</Tab>
        <Tab to="/admin/errors">錯誤紀錄</Tab>
        <Tab to="/admin/people">用人查</Tab>
      </nav>
      {snap.isError && <p className="px-[14px] text-sub text-dg">讀不到後台資料：{String((snap.error as Error)?.message ?? '')}</p>}
      {!model && !snap.isError && <div className="spin"><i /></div>}
      {model && (
        <Routes>
          <Route index element={<Overview model={model} />} />
          <Route path="trips/:tripId" element={<TripDetail model={model} />} />
          <Route path="log" element={<LogPage model={model} />} />
          <Route path="errors" element={<ErrorsPage model={model} />} />
          <Route path="people" element={<PeoplePage model={model} />} />
          <Route path="people/:userId" element={<PeoplePage model={model} />} />
          <Route path="*" element={<Navigate to="/admin" replace />} />
        </Routes>
      )}
    </div>
  );
}

function Tab({ to, end, children }: { to: string; end?: boolean; children: React.ReactNode }) {
  return (
    <NavLink to={to} end={end} className={({ isActive }) => `chip${isActive ? ' on' : ''}`}>
      {children}
    </NavLink>
  );
}

// ── 模型 ──────────────────────────────────────────────────────────────────────

export interface Model {
  snap: Snapshot;
  trips: Trip[];
  tripById: Map<string, Trip>;
  userById: Map<string, AdminUser>;
  userName: (id: string | null | undefined) => string;
  knownUser: (id: string) => boolean;
}

export function buildModel(snap: Snapshot): Model {
  const trips = buildTrips<AdminTrip>(snap.trips ?? [], snap.expenses ?? [], snap.settlements ?? []);
  const tripById = new Map(trips.map(t => [t.trip.id, t]));
  const userById = new Map((snap.users ?? []).map(u => [u.id, u]));
  const userName = (id: string | null | undefined) => {
    if (!id) return '系統';
    const u = userById.get(id);
    return u?.display_name || u?.email || '（不明帳號）';
  };
  const knownUser = (id: string) => userById.has(id);
  return { snap, trips, tripById, userById, userName, knownUser };
}

// ── 共用小元件 ────────────────────────────────────────────────────────────────

function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-white border ${className.includes('border-dg') ? '' : 'border-ln '}rounded-base px-[14px] py-[10px] min-w-0 break-words ${className}`}>
      {children}
    </div>
  );
}

function Section({ title, right, children }: { title: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="mb-2">
      <div className="sec">{title}{right != null && <span className="secright">{right}</span>}</div>
      <div className="px-[14px] flex flex-col gap-2">{children}</div>
    </section>
  );
}

function RedDot({ n }: { n: number }) {
  if (!n) return null;
  return (
    <span className="inline-flex items-center gap-1 text-sub font-semibold text-dg" aria-label={`${n} 個異常`}>
      <span className="inline-block w-2 h-2 rounded-icon bg-dg" />{n}
    </span>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  /* 放在 Section 裡用（Section 已經有左右內距），不再自己加 */
  return <p className="text-sub text-gr py-2">{children}</p>;
}

function AuditStart({ at }: { at: string | null }) {
  return (
    <p className="text-sub text-gr pb-1">
      {at ? `操作紀錄從 ${fmtTime(at)} 開始，之前的沒有紀錄。` : '操作紀錄還沒開始（資料庫還沒套用設定）。'}
    </p>
  );
}

// ── A 行程總覽 ────────────────────────────────────────────────────────────────

function Overview({ model }: { model: Model }) {
  const rows = sortForOverview(model.trips);
  const navigate = useNavigate();
  return (
    <Section title={`全部行程 ${rows.length} 趟`} right="紅點＝資料問題＋近 7 天錯誤">
      {rows.length === 0 && <Empty>還沒有任何行程。</Empty>}
      {rows.map(r => (
        <button key={r.trip.id} className="rowb flex-col !items-stretch gap-1"
                onClick={() => navigate(`/admin/trips/${r.trip.id}`)}>
          <span className="flex items-center gap-2 min-w-0">
            <span className="flex-1 min-w-0 trunc text-body font-semibold text-ink">{r.trip.name}</span>
            <RedDot n={r.anomalyCount} />
            <Icon name="next" size={16} />
          </span>
          <span className="flex flex-wrap gap-x-3 gap-y-0.5 text-sub text-gr">
            <span>{r.statusLabel}</span>
            <span>{r.members.length} 人</span>
            <span>{r.expenses.length} 筆帳</span>
            <span>建立者 {model.userName(r.trip.owner_id)}</span>
            <span>最後動作 {ago(r.trip.last_activity_at)}</span>
          </span>
        </button>
      ))}
    </Section>
  );
}

// ── B 行程詳情 ────────────────────────────────────────────────────────────────

function TripDetail({ model }: { model: Model }) {
  const { tripId } = useParams<{ tripId: string }>();
  const r = tripId ? model.tripById.get(tripId) : undefined;
  if (!r) return <div className="px-[14px]"><Empty>找不到這趟行程（可能已經被刪除）。</Empty></div>;
  return <TripDetailBody model={model} r={r} />;
}

function TripDetailBody({ model, r }: { model: Model; r: Trip }) {
  const [filter, setFilter] = useState<string | null>(null);
  const audit = useAudit(true, { trip: r.trip.id, limit: 100 });
  const errors = useErrors(true, { trip: r.trip.id, limit: 50 });
  const memberName = (id: string) =>
    r.members.find(m => m.id === id)?.name ?? '（已不在行程裡的成員）';

  const filtered = useMemo(() => {
    const list = filter
      ? r.expenses.filter(e => involves(e, filter,
          boundUserId(r.members.find(m => m.id === filter)!, r.trip)))
      : r.expenses;
    return [...list].sort((a, b) =>
      a.expense_date !== b.expense_date ? (a.expense_date < b.expense_date ? 1 : -1)
        : (a.created_at < b.created_at ? 1 : -1));
  }, [r, filter]);

  const issuesByExpense = useMemo(() => {
    const m = new Map<string, number>();
    for (const i of r.health) if (i.expenseId && i.level === 'problem') m.set(i.expenseId, (m.get(i.expenseId) ?? 0) + 1);
    return m;
  }, [r.health]);

  return (
    <div className="pb-8">
      <div className="px-[14px] pt-1 pb-2">
        <div className="text-title font-semibold text-ink break-words">{r.trip.name}</div>
        <div className="flex flex-wrap gap-x-3 text-sub text-gr">
          <span>{r.statusLabel}</span>
          <span>{r.trip.start_date} – {r.trip.end_date}</span>
          <span>幣別 {r.trip.currency}</span>
          <span>現金匯率 {r.trip.cash_rate_twd && r.trip.cash_rate_foreign
            ? `${fnum(Number(r.trip.cash_rate_twd))} 台幣 ＝ ${fnum(Number(r.trip.cash_rate_foreign))} ${r.trip.currency}`
            : '沒設'}</span>
          <span>建立者 {model.userName(r.trip.owner_id)}</span>
          {(r.trip.deleted_expense_count ?? 0) > 0 && <span>已刪除 {r.trip.deleted_expense_count} 筆</span>}
        </div>
      </div>

      <MembersSection model={model} r={r} />
      <HealthSection r={r} />
      <ExpensesSection model={model} r={r} list={filtered} filter={filter} setFilter={setFilter}
                       memberName={memberName} issuesByExpense={issuesByExpense} />
      <SettlementSection r={r} memberName={memberName} />

      <Section title="這趟的操作紀錄（最近 100 筆）">
        <AuditStart at={model.snap.audit_started_at} />
        <AuditList model={model} rows={audit.data} loading={audit.isLoading} error={audit.isError} showTrip={false} />
      </Section>
      <Section title="這趟的錯誤紀錄">
        <ErrorList model={model} rows={errors.data} loading={errors.isLoading} error={errors.isError} showTrip={false} />
      </Section>
    </div>
  );
}

function MembersSection({ model, r }: { model: Model; r: Trip }) {
  return (
    <Section title={`成員 ${r.members.length} 人`}>
      {/* 產品現況：只有行程建立者能記帳，旅伴只能看分享連結，成員大多沒有帳號。
          沒綁帳號是正常狀態，照實寫、不算異常。 */}
      {r.members.map(m => {
        const uid = boundUserId(m, r.trip);
        const u = uid ? model.userById.get(uid) : undefined;
        const count = uid
          ? r.expenses.filter(e => recorderOf(e, r.trip, model.knownUser) === uid).length : 0;
        return (
          <Card key={m.id}>
            <div className="text-body font-semibold text-ink">{memberLabel(m)}</div>
            {uid ? (
              <div className="flex flex-wrap gap-x-3 text-sub text-gr">
                <span>{uid === r.trip.owner_id ? '行程建立者' : '有帳號'}（{u?.email ?? model.userName(uid)}）</span>
                <span>最後使用 {ago(u?.last_active_at)}</span>
                <span>記了 {count} 筆</span>
              </div>
            ) : (
              <div className="text-sub text-gr">沒有帳號（由建立者代記）</div>
            )}
          </Card>
        );
      })}
    </Section>
  );
}

function HealthSection({ r }: { r: Trip }) {
  const problems = r.health.filter(i => i.level === 'problem');
  const notices = r.health.filter(i => i.level === 'notice');
  return (
    <Section title="資料健康檢查" right={problems.length ? `${problems.length} 個問題` : '沒有問題'}>
      {r.health.length === 0 && <Card><span className="text-sub text-gr">這趟的帳都填完整了。</span></Card>}
      {problems.map((i, k) => (
        <Card key={`p${k}`} className="border-dg">
          <div className="text-sub font-semibold text-dg">問題 · {i.where}</div>
          <div className="text-sub text-ink">{i.text}</div>
        </Card>
      ))}
      {notices.map((i, k) => (
        <Card key={`n${k}`}>
          <div className="text-sub font-semibold text-md">提醒 · {i.where}</div>
          <div className="text-sub text-ink">{i.text}</div>
        </Card>
      ))}
    </Section>
  );
}

function ExpensesSection({ model, r, list, filter, setFilter, memberName, issuesByExpense }: {
  model: Model; r: Trip; list: ExpenseWithSplits[];
  filter: string | null; setFilter: (v: string | null) => void;
  memberName: (id: string) => string; issuesByExpense: Map<string, number>;
}) {
  return (
    <Section title="帳目" right={`${list.length} 筆`}>
      <div className="flex flex-wrap gap-2" role="group" aria-label="依成員篩選">
        <button className={`chip${filter == null ? ' on' : ''}`} onClick={() => setFilter(null)}>全部</button>
        {r.members.map(m => (
          <button key={m.id} className={`chip${filter === m.id ? ' on' : ''}`}
                  onClick={() => setFilter(filter === m.id ? null : m.id)}>{m.name}</button>
        ))}
      </div>
      {list.length === 0 && <Empty>沒有帳目。</Empty>}
      {list.map(e => (
        <ExpenseCard key={e.id} model={model} r={r} e={e} memberName={memberName}
                     problems={issuesByExpense.get(e.id) ?? 0} />
      ))}
    </Section>
  );
}

function ExpenseCard({ model, r, e, memberName, problems }: {
  model: Model; r: Trip; e: ExpenseWithSplits; memberName: (id: string) => string; problems: number;
}) {
  const c = calc(e, r.trip, r.members);
  /* 分給誰：與前台同一個判定（`toSharedExpense().parts`） */
  const parts = toSharedExpense(e, r.members).parts ?? [];
  const tags: string[] = [];
  if (c.twdPending) tags.push('台幣還算不出來');
  if (e.settled_on_spot) tags.push('當場就清了');
  if (e.is_sponsor) tags.push('贊助');
  if (e.expense_type === 'personal') tags.push('自己的');
  if (e.expense_type === 'individual') tags.push('各付各的');
  if (e.individual_member_id) tags.push('只算一個人');

  const amount = [
    Number.isFinite(e.foreign_amount as number) && r.trip.currency !== 'TWD'
      ? `${r.trip.currency} ${fnum(e.foreign_amount!)}` : null,
    c.twdPending ? '台幣 ?' : `${money(c.twdTotal)}${c.twdFromRate ? '（用匯率換算）' : ''}`,
  ].filter(Boolean).join(' ／ ');

  return (
    <Card className={problems ? 'border-dg' : ''}>
      {/* 金額很長時（外幣＋台幣）整段換到下一行靠右，不要把品項擠成一條縫 */}
      <div className="flex flex-wrap items-baseline gap-x-2 min-w-0">
        <span className="flex-1 basis-40 min-w-0 text-body font-semibold text-ink break-words">
          {e.category_emoji} {e.title || '（沒有品項名稱）'}
        </span>
        <span className="ml-auto max-w-full text-body font-semibold text-ink tabular-nums text-right break-words">{amount}</span>
      </div>
      <div className="flex flex-wrap gap-x-3 text-sub text-gr">
        <span>{e.expense_date}</span>
        <span>{memberName(e.payer_member_id)} 付的</span>
        <span>{payLabel(e.payment_method, e.payment_label)}</span>
        <span>{model.userName(recorderOf(e, r.trip, model.knownUser))} 記於 {fmtTime(e.created_at)}</span>
        {e.updated_at && e.updated_at !== e.created_at && <span>最後修改 {fmtTime(e.updated_at)}</span>}
        {problems > 0 && <span className="text-dg font-semibold">{problems} 個問題</span>}
      </div>
      {tags.length > 0 && <div className="text-sub text-md">{tags.join(' · ')}</div>}
      <div className="text-sub text-ink mt-1">
        分給 {parts.length} 人：
        {parts.length === 0 ? '（沒有人）' : parts.map(id => {
          const s = c.shares[id];
          return `${memberName(id)} ${s == null ? '?' : money(s)}`;
        }).join('、')}
      </div>
    </Card>
  );
}

function SettlementSection({ r, memberName }: { r: Trip; memberName: (id: string) => string }) {
  const v = useMemo(() => familySettlementView(r.trip, r.expenses, r.confirmed), [r]);
  return (
    <Section title="結算結果（與家人手機上看到的相同）">
      <Card>
        <div className="text-sub text-gr">
          {PAGE_STATE_LABEL[v.pageState]}
          {v.confirmedAt && ` · 最近一次確認結算 ${fmtTime(v.confirmedAt)}`}
          {' · '}總花費 {money(v.total)}
          {v.unsettledCount > 0 && ` · 有 ${v.unsettledCount} 筆還沒算清楚，不在結算裡`}
        </div>
        {v.stale && (
          <div className="text-sub font-semibold text-dg mt-1">
            確認結算之後帳又被改過，已確認的轉帳金額跟現在的帳對不上
            {v.staleShownToFamily ? '（家人畫面上有提示）' : '（家人畫面上沒有提示）'}
          </div>
        )}
        <div className="mt-2 text-sub font-semibold text-md">誰給誰</div>
        {v.tx.length === 0 && <div className="text-sub text-ink">大家剛好打平，不用轉帳</div>}
        {v.tx.map((t, k) => {
          const item = v.pageState === 'partial'
            ? v.items.find(i => i.from_member_id === t.from && i.to_member_id === t.to) : undefined;
          return (
            <div key={k} className="text-sub text-ink tabular-nums">
              {memberName(t.from)} → {memberName(t.to)} {money(t.amount)}
              {item && (item.is_cleared ? '（已付清）' : '（還沒付）')}
            </div>
          );
        })}
        <div className="mt-2 text-sub font-semibold text-md">每人差額（照現在的帳）</div>
        {r.members.map((m: TripMember) => {
          const n = v.net[m.id] ?? 0;
          return (
            <div key={m.id} className="text-sub text-ink tabular-nums">
              {m.name}：{n > 0 ? `可以拿回 ${money(n)}` : n < 0 ? `要給出 ${money(-n)}` : '打平'}
            </div>
          );
        })}
      </Card>
    </Section>
  );
}

// ── C 操作紀錄 ────────────────────────────────────────────────────────────────

function useAuditContext(model: Model, rows: AuditRow[] | undefined) {
  return useMemo(() => {
    const extra = namesFromAudit(rows ?? []);
    const memberById = new Map<string, string>();
    const expenseById = new Map<string, string>();
    for (const t of model.trips) for (const m of t.members) memberById.set(m.id, m.name);
    for (const e of model.snap.expenses ?? []) expenseById.set(e.id, e.title);
    return {
      memberName: (id: string) => memberById.get(id) ?? extra.member.get(id) ?? '（已刪除的成員）',
      expenseTitle: (id: string) => expenseById.get(id) ?? extra.expense.get(id) ?? null,
      currencyOf: (tripId: string | null) => (tripId && model.tripById.get(tripId)?.trip.currency) || '外幣',
    };
  }, [model, rows]);
}

function AuditList({ model, rows, loading, error, showTrip }: {
  model: Model; rows: AuditRow[] | undefined; loading: boolean; error: boolean; showTrip: boolean;
}) {
  const ctx = useAuditContext(model, rows);
  const entries = useMemo(() => describeAudit(rows ?? [], ctx), [rows, ctx]);
  if (loading) return <div className="spin"><i /></div>;
  if (error) return <Empty>讀不到操作紀錄。</Empty>;
  if (!entries.length) return <Empty>還沒有操作紀錄。</Empty>;
  return <>{entries.map(e => <AuditCard key={e.key} model={model} e={e} showTrip={showTrip} />)}</>;
}

function AuditCard({ model, e, showTrip }: { model: Model; e: AuditEntry; showTrip: boolean }) {
  const trip = e.tripId ? model.tripById.get(e.tripId) : undefined;
  return (
    <Card>
      <div className="text-sub text-gr">
        {fmtTime(e.at)} · {model.userName(e.actor)}
        {showTrip && ` · ${trip?.trip.name ?? '（已刪除的行程）'}`}
      </div>
      <div className="text-body text-ink">
        <span className={`font-semibold ${e.action === '刪除' ? 'text-dg' : ''}`}>{e.action}{e.target}</span>
        {' '}{e.title}
      </div>
      {e.changes.map((c, k) => (
        <div key={k} className="text-sub text-md break-words">
          {c.field}：{c.before} → <span className="text-ink font-semibold">{c.after}</span>
        </div>
      ))}
    </Card>
  );
}

function LogPage({ model }: { model: Model }) {
  const [limit, setLimit] = useState(200);
  const audit = useAudit(true, { limit });
  return (
    <Section title="操作紀錄（全部行程）">
      <AuditStart at={model.snap.audit_started_at} />
      <AuditList model={model} rows={audit.data} loading={audit.isLoading} error={audit.isError} showTrip />
      {(audit.data?.length ?? 0) >= limit && limit < 1000 && (
        <button className="btn qt" onClick={() => setLimit(l => Math.min(1000, l + 200))}>再多看 200 筆</button>
      )}
    </Section>
  );
}

// ── D 錯誤紀錄 ────────────────────────────────────────────────────────────────

function ErrorList({ model, rows, loading, error, showTrip }: {
  model: Model; rows: ErrorRow[] | undefined; loading: boolean; error: boolean; showTrip: boolean;
}) {
  if (loading) return <div className="spin"><i /></div>;
  if (error) return <Empty>讀不到錯誤紀錄。</Empty>;
  if (!rows?.length) return <Empty>沒有錯誤紀錄。</Empty>;
  return <>{rows.map(x => {
    const trip = x.trip_id ? model.tripById.get(x.trip_id) : undefined;
    const late = x.occurred_at && Math.abs(Date.parse(x.at) - Date.parse(x.occurred_at)) > 120_000;
    return (
      <Card key={x.id}>
        <div className="text-sub text-gr">
          {fmtTime(x.occurred_at ?? x.at)} · {model.userName(x.user_id)}
          {showTrip && ` · ${x.trip_id ? (trip?.trip.name ?? '（已刪除的行程）') : '（不在行程裡）'}`}
          {' · '}{x.screen ?? '—'}
        </div>
        <div className="text-body font-semibold text-dg">{KIND_LABEL[x.kind ?? 'other'] ?? '錯誤'}</div>
        <div className="text-sub text-ink break-words">{x.message}</div>
        {late && <div className="text-sub text-gr">當時離線，{fmtTime(x.at)} 才補送上來</div>}
      </Card>
    );
  })}</>;
}

function ErrorsPage({ model }: { model: Model }) {
  const errors = useErrors(true, { limit: 200 });
  return (
    <Section title="錯誤紀錄（最近 200 筆）">
      <ErrorList model={model} rows={errors.data} loading={errors.isLoading} error={errors.isError} showTrip />
    </Section>
  );
}

// ── E 用人查 ──────────────────────────────────────────────────────────────────

function PeoplePage({ model }: { model: Model }) {
  const { userId } = useParams<{ userId: string }>();
  const navigate = useNavigate();
  const users = [...(model.snap.users ?? [])].sort((a, b) =>
    (b.last_active_at ?? '').localeCompare(a.last_active_at ?? ''));
  const picked = userId ? model.userById.get(userId) : undefined;
  return (
    <div className="pb-8">
      <Section title={`登入帳號 ${users.length} 個`}>
        {users.length === 0 && <Empty>還沒有人登入過。</Empty>}
        {users.map(u => {
          const s = accountStats(model.trips, u.id, model.knownUser);
          return (
            <button key={u.id} className={`rowb${userId === u.id ? ' on' : ''}`}
                    aria-pressed={userId === u.id}
                    onClick={() => navigate(`/admin/people/${u.id}`)}>
              <span className="flex-1 min-w-0">
                <span className="trunc text-body font-semibold text-ink">{u.display_name || u.email}</span>
                <span className="trunc text-sub text-gr">{u.email}</span>
                <span className="block text-sub text-gr">
                  建了 {s.created.length} 趟 · 記了 {s.recorded} 筆 · 最後使用 {ago(u.last_active_at)}
                </span>
              </span>
              <Icon name="next" size={16} />
            </button>
          );
        })}
      </Section>
      {picked && <PersonDetail model={model} u={picked} />}
    </div>
  );
}

function TripRow({ r, sub, onOpen }: { r: Trip; sub: string; onOpen: () => void }) {
  return (
    <button className="rowb" onClick={onOpen}>
      <span className="flex-1 min-w-0">
        <span className="trunc text-body font-semibold text-ink">{r.trip.name}</span>
        <span className="trunc text-sub text-gr">{sub}</span>
      </span>
      <RedDot n={r.anomalyCount} />
      <Icon name="next" size={16} />
    </button>
  );
}

function PersonDetail({ model, u }: { model: Model; u: AdminUser }) {
  const s = accountStats(model.trips, u.id, model.knownUser);
  const audit = useAudit(true, { actor: u.id, limit: 20 });
  const errors = useErrors(true, { user: u.id, limit: 20 });
  const navigate = useNavigate();
  return (
    <>
      <Section title={u.display_name || u.email || '（不明帳號）'}>
        <Card>
          <div className="flex flex-wrap gap-x-3 text-sub text-gr">
            <span>{u.email}</span>
            <span>最後使用 {ago(u.last_active_at)}</span>
            <span>記了 {s.recorded} 筆</span>
            <span>最後登入 {fmtTime(u.last_sign_in_at)}</span>
            <span>註冊於 {fmtTime(u.created_at)}</span>
          </div>
        </Card>
      </Section>
      <Section title={`建立的行程 ${s.created.length} 趟`}>
        {s.created.length === 0 && <Empty>這個帳號沒有建立過行程。</Empty>}
        {s.created.map(r => (
          <TripRow key={r.trip.id} r={r} onOpen={() => navigate(`/admin/trips/${r.trip.id}`)}
                   sub={`${r.statusLabel} · ${r.members.length} 人 · ${r.expenses.length} 筆帳 · 最後動作 ${ago(r.trip.last_activity_at)}`} />
        ))}
      </Section>
      {s.joined.length > 0 && (
        <Section title={`被綁為成員的行程 ${s.joined.length} 趟`}>
          {s.joined.map(r => (
            <TripRow key={r.trip.id} r={r} onOpen={() => navigate(`/admin/trips/${r.trip.id}`)}
                     sub={`${r.statusLabel} · 建立者 ${model.userName(r.trip.owner_id)}`} />
          ))}
        </Section>
      )}
      <Section title="最近 20 筆動作">
        <AuditStart at={model.snap.audit_started_at} />
        <AuditList model={model} rows={audit.data} loading={audit.isLoading} error={audit.isError} showTrip />
      </Section>
      <Section title="這個帳號的錯誤紀錄（最近 20 筆）">
        <ErrorList model={model} rows={errors.data} loading={errors.isLoading} error={errors.isError} showTrip />
      </Section>
    </>
  );
}
