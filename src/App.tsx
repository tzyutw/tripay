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
              <Route path="/trips/:id/settlement" element={<SettlementPage />} />
              <Route path="/settings"             element={<SettingsPage />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </ToastProvider>
    </QueryClientProvider>
  );
}
