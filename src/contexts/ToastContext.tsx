import { createContext, useContext, useState, useRef, type ReactNode } from 'react';

interface ToastCtx {
  toast: (msg: string) => void;
}

const Ctx = createContext<ToastCtx | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [msg, setMsg] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();

  function toast(message: string) {
    if (timer.current) clearTimeout(timer.current);
    setMsg(message);
    timer.current = setTimeout(() => setMsg(null), 2200);
  }

  return (
    <Ctx.Provider value={{ toast }}>
      {children}
      {msg && <ToastBanner msg={msg} />}
    </Ctx.Provider>
  );
}

export function useToast(): ToastCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}

function ToastBanner({ msg }: { msg: string }) {
  return (
    <div className="fixed top-4 inset-x-4 z-[200] flex justify-center pointer-events-none">
      <div
        className="bg-[#292524] text-white text-sm font-semibold px-5 py-[10px] rounded-full animate-toast-in"
        style={{ boxShadow: '0 4px 16px rgba(0,0,0,0.25)' }}
      >
        {msg}
      </div>
    </div>
  );
}
