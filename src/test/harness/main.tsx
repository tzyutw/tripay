/* 實作-C-3　版面回歸的量測靶。
 *
 * **為什麼需要它**：橫向捲動、文字貼邊、可點區這幾件事 **jsdom 量不出來**
 * （CLAUDE.md：「真實瀏覽器量測，不用 jsdom」），而真正的 App 進得去要先過 Google 登入。
 * 所以把十個畫面用**真實元件 ＋ 真實 CSS ＋ 真實資料形狀**掛在一頁上，
 * 由 Chrome 量。這一頁只在測試時建置，不會進 production bundle。
 *
 * `?screen=s03` 一次只掛一個畫面，量測時彼此不互相影響。
 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import { ToastProvider } from '@/contexts/ToastContext';
import '@/index.css';

import { trip, expenses, members, settlementItems, allSettlementItems, settlements, CONFIRMED_ID, M } from './fixtures';

/* 樁必須在任何畫面模組被 evaluate 之前掛上 window——
   所以它住在獨立的模組裡，並且排在所有畫面 import 之前。 */
import './installStub';

import LoginPage from '@/pages/LoginPage';
import TripListPage from '@/pages/TripListPage';
import TripFormSheet from '@/components/TripFormSheet';
import ExpenseListPage from '@/pages/ExpenseListPage';
import ExpenseFormSheet from '@/components/ExpenseFormSheet';
import SettlementPage from '@/pages/SettlementPage';
import SharePage from '@/pages/SharePage';
import SettingsPage from '@/pages/SettingsPage';

const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });

/* MemoryRouter 不會動到 window.location，所以「按了之後網址有沒有變」量不到。
   把 router 的 pathname 露出來——實作-O-8 的 bug 正是「網址對了但畫面沒東西」，
   兩件事都要驗，只驗一件會漏。 */
function RouteProbe() {
  const loc = useLocation();
  (window as unknown as { __ROUTE__: string }).__ROUTE__ = loc.pathname;
  return null;
}

/** 同一個元件掛在多條路徑上時要全部註冊——少一條，導過去就是空白畫面 */
const TRIP_PATHS = ['/trips/:id', '/trips/:id/more', '/trips/:id/edit',
                    '/trips/:id/share', '/trips/:id/copy', '/trips/:id/delete'];

const SCREENS: Record<string, { route: string; path?: string; paths?: string[]; el: React.ReactNode }> = {
  s00:  { route: '/login',    el: <LoginPage /> },
  s01:  { route: '/',         el: <TripListPage /> },
  s02:  { route: '/',         el: <TripFormSheet onClose={() => {}} onCreated={() => {}} /> },
  s02b: { route: '/',         el: <TripFormSheet tripId="t1" onClose={() => {}} onCreated={() => {}} /> },
  s03:  { route: '/trips/t1', paths: TRIP_PATHS, el: <ExpenseListPage /> },
  s03d: { route: '/trips/t1', path: '/trips/:id', el: <ExpenseListPage /> },
  s04:  { route: '/trips/t1', path: '/trips/:id',
          el: <ExpenseFormSheet tripId="t1" trip={trip as never} onClose={() => {}} /> },
  s05:  { route: '/trips/t1/settlement', path: '/trips/:id/settlement', el: <SettlementPage /> },
  s06:  { route: '/share/tok', path: '/share/:token', el: <SharePage /> },
  s07:  { route: '/settings', el: <SettingsPage /> },
  /* 實作-L-4　「⋯」改成獨立頁面之後要能單獨量它 */
  s03more: { route: '/trips/t1/more', paths: TRIP_PATHS, el: <ExpenseListPage /> },
};

const id = new URLSearchParams(location.search).get('screen') ?? 's01';
const s  = SCREENS[id] ?? SCREENS.s01;
(window as unknown as { __SCREEN__: string }).__SCREEN__ = id;
(window as unknown as { __HUB__: string }).__HUB__ = M[1];
/* 把當次真正掛上去的假資料露出來給驗收程式查。
   沒有這個出口，「分享頁只畫一組轉帳」是**真的挑對了**還是
   **`settlements=many` 根本沒實作、本來就只有一組**，在斷言的輸出裡長得一模一樣
   ——#29 那條假通過的斷言就是這樣過關的。 */
const served = (window as unknown as { __SERVED__: { trip: unknown; expenses: unknown[]; members: unknown[] } }).__SERVED__;
(window as unknown as { __HARNESS_FIXTURE__: unknown }).__HARNESS_FIXTURE__ = {
  screen: id,
  /* 掛**真正被端出去的那一份**（樁已套用各種 `?` 開關），不是 fixtures 的原始清單 */
  trip: served.trip, members: served.members, expenses: served.expenses,
  settlements, settlement_items: allSettlementItems,
  confirmed_id: CONFIRMED_ID,
  confirmed_items: settlementItems,
};
void trip; void members; void expenses;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <MemoryRouter initialEntries={[s.route]}>
          <RouteProbe />
          {s.paths
            ? <Routes>{s.paths.map(pt => <Route key={pt} path={pt} element={s.el} />)}</Routes>
            : s.path
              ? <Routes><Route path={s.path} element={s.el} /></Routes>
              : s.el}
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>
  </StrictMode>,
);
