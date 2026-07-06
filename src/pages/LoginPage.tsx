import { supabase } from '@/lib/supabaseClient';

export default function LoginPage() {
  async function handleGoogleLogin() {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin + import.meta.env.BASE_URL },
    });
  }

  return (
    <div
      className="min-h-screen flex flex-col relative overflow-hidden"
      style={{ background: 'linear-gradient(155deg, #3A1508 0%, #7C2D12 38%, #B45309 72%, #D97706 100%)' }}
    >
      {/* Main content */}
      <div className="flex-1 flex flex-col items-center justify-center px-9 pb-16">

        {/* App icon */}
        <div
          className="w-[76px] h-[76px] rounded-[22px] flex items-center justify-center text-[38px] mb-5"
          style={{
            background: 'rgba(255,255,255,0.14)',
            border: '1px solid rgba(255,255,255,0.22)',
            backdropFilter: 'blur(10px)',
            boxShadow: '0 4px 20px rgba(0,0,0,0.22)',
          }}
        >
          ✈️
        </div>

        {/* Wordmark */}
        <h1
          className="font-sans text-[52px] font-bold text-white leading-none mb-3 tracking-tight"
        >
          Tripay
        </h1>

        {/* Slogan */}
        <p
          className="font-serif text-[17px] italic mb-9 tracking-widest"
          style={{ color: 'rgba(255,255,255,0.78)' }}
        >
          每一趟，都記得
        </p>

        {/* Tagline */}
        <p
          className="text-[15px] text-center leading-relaxed mb-11 max-w-[230px]"
          style={{ color: 'rgba(255,255,255,0.65)' }}
        >
          大家一起出發，帳交給 Tripay。
        </p>

        {/* Google login button */}
        <button
          onClick={handleGoogleLogin}
          className="w-full max-w-[280px] h-[54px] bg-white rounded-xl flex items-center justify-center gap-[10px] text-[15px] font-semibold text-[#292524] active:scale-[0.97] transition-transform duration-100"
          style={{ boxShadow: '0 4px 18px rgba(0,0,0,0.22)' }}
        >
          <GoogleIcon />
          用 Google 帳號繼續
        </button>
      </div>

      {/* G-02 Ghost card */}
      <div className="absolute inset-x-6 bottom-6 pointer-events-none">
        <div
          className="rounded-2xl overflow-hidden animate-ghost-pulse"
          style={{ filter: 'blur(1.8px)', opacity: 0.5 }}
        >
          <div
            className="h-24 flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg, #D6C4B5, #C2AFA0)' }}
          >
            <p
              className="font-serif text-[18px] italic"
              style={{ color: 'rgba(80,55,42,0.5)' }}
            >
              你的下一趟在哪？
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" className="flex-shrink-0">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
  );
}
