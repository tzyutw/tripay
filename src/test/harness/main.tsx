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
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { ToastProvider } from '@/contexts/ToastContext';
import '@/index.css';

import { trip, expenses, members, settlementItems, M } from './fixtures';

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

const SCREENS: Record<string, { route: string; path?: string; el: React.ReactNode }> = {
  s00:  { route: '/login',    el: <LoginPage /> },
  s01:  { route: '/',         el: <TripListPage /> },
  s02:  { route: '/',         el: <TripFormSheet onClose={() => {}} onCreated={() => {}} /> },
  s02b: { route: '/',         el: <TripFormSheet tripId="t1" onClose={() => {}} onCreated={() => {}} /> },
  s03:  { route: '/trips/t1', path: '/trips/:id', el: <ExpenseListPage /> },
  s03d: { route: '/trips/t1', path: '/trips/:id', el: <ExpenseListPage /> },
  s04:  { route: '/trips/t1', path: '/trips/:id',
          el: <ExpenseFormSheet tripId="t1" trip={trip as never} onClose={() => {}} /> },
  s05:  { route: '/trips/t1/settlement', path: '/trips/:id/settlement', el: <SettlementPage /> },
  s06:  { route: '/share/tok', path: '/share/:token', el: <SharePage /> },
  s07:  { route: '/settings', el: <SettingsPage /> },
};

const id = new URLSearchParams(location.search).get('screen') ?? 's01';
const s  = SCREENS[id] ?? SCREENS.s01;
(window as unknown as { __SCREEN__: string }).__SCREEN__ = id;
(window as unknown as { __HUB__: string }).__HUB__ = M[1];

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <MemoryRouter initialEntries={[s.route]}>
          {s.path
            ? <Routes><Route path={s.path} element={s.el} /></Routes>
            : s.el}
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>
  </StrictMode>,
);
