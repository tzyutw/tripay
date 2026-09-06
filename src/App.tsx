import { BrowserRouter, Routes, Route, Outlet, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '@/contexts/ToastContext';
import AuthLayout from '@/components/AuthLayout';
import LoginPage from '@/pages/LoginPage';
import TripListPage from '@/pages/TripListPage';
import ExpenseListPage from '@/pages/ExpenseListPage';
import SettlementPage from '@/pages/SettlementPage';
import SettingsPage from '@/pages/SettingsPage';
import SharePage from '@/pages/SharePage';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 30_000 },
  },
});

// Animated wrapper keyed on pathname — re-triggers slide-in on route change
function PageSlide({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  return (
    <div key={location.pathname} className="animate-slide-in">
      {children}
    </div>
  );
}

function ProtectedLayout() {
  return (
    <AuthLayout>
      <PageSlide>
        <Outlet />
      </PageSlide>
    </AuthLayout>
  );
}

export default function App() {
  // import.meta.env.BASE_URL = '/tripay/' in production, '/' in dev
  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <BrowserRouter basename={import.meta.env.BASE_URL}>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/share/:token" element={<SharePage />} />
            <Route element={<ProtectedLayout />}>
              {/* /trips/new auto-opens TripFormSheet in TripListPage */}
              <Route path="/"          element={<TripListPage />} />
              <Route path="/trips/new" element={<TripListPage />} />
              <Route path="/trips/:id"           element={<ExpenseListPage />} />
              <Route path="/trips/:id/edit"       element={<ExpenseListPage />} />
              {/* S-03-31 的「⋯」改成獨立頁面（Rozi 2026-09-06） */}
              <Route path="/trips/:id/more"       element={<ExpenseListPage />} />
              {/* ⋯ 裡的三個入口也走 route，**不要用 state**。
                  `/trips/:id` 與 `/trips/:id/more` 是兩個各自帶 element 的 sibling Route，
                  React Router 會卸載一個、掛載另一個新的實例（即使元件型別相同）——
                  所以 `back(); setXxxOpen(true)` 是設在一個正要被卸載的實例上，
                  新實例起來時全部回到 false，按了完全沒反應。
                  「編輯行程」之所以一直是好的，正因為它走 route 不走 state。 */}
              <Route path="/trips/:id/share"      element={<ExpenseListPage />} />
              <Route path="/trips/:id/copy"       element={<ExpenseListPage />} />
              <Route path="/trips/:id/delete"     element={<ExpenseListPage />} />
              <Route path="/trips/:id/settlement" element={<SettlementPage />} />
              <Route path="/settings"             element={<SettingsPage />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </ToastProvider>
    </QueryClientProvider>
  );
}
