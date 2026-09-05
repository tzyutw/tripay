import { supabase } from '@/lib/supabaseClient';

/* 實作-B-2　S-00 登入（4 項）
 *   S-00-1 App icon — 已移除：App 未設計 logo，不放代用圖示
 *   S-00-2 Tripay 字標／S-00-3 Slogan／S-00-4 Tagline
 *   S-00-5 Google 登入鈕 — 官方四色 G（gstatic 釋出檔原樣內嵌，
 *          **不套 currentColor**，是全站 icon 規則的唯一例外）；文案「用 Google 繼續」
 *   S-00-6 G-02 幽靈卡 — 已移除：不可點卻長得可點，稀釋唯一動作
 * 版面（.s00*）定義在 src/index.css，整段搬自原型。
 */
export default function LoginPage() {
  async function handleGoogleLogin() {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin + import.meta.env.BASE_URL },
    });
  }

  return (
    <div className="s00wrap">
      <div className="s00pad" style={{ flex: 1 }} />

      <div className="s00brand">
        <div className="s00logo">Tripay</div>
        <div className="s00slogan">每一趟，都記得</div>
        {/* 標語與登入鈕共用同一個 240px 欄，單行不折 */}
        <div className="s00col">
          <div className="s00tag">大家一起出發，帳交給 Tripay。</div>
        </div>
      </div>

      <div className="s00pad" style={{ flex: 1.35 }} />

      <div className="s00col s00act">
        <button
          onClick={handleGoogleLogin}
          className="gbtn active:scale-[0.97] transition-transform duration-100"
        >
          <GoogleMark /> 用 Google 繼續
        </button>
      </div>
    </div>
  );
}

/* Google 官方四色 G。品牌識別，四個 fill 是規定的顏色，不得改成 currentColor。 */
function GoogleMark() {
  return (
    <svg viewBox="0 0 118 120" width="18" height="18" aria-hidden="true" style={{ flex: 'none' }}>
      <path fill="#4285F4" d="M117.6,61.3636364 C117.6,57.1090909 117.218182,53.0181818 116.509091,49.0909091 L60,49.0909091 L60,72.3 L92.2909091,72.3 C90.9,79.8 86.6727273,86.1545455 80.3181818,90.4090909 L80.3181818,105.463636 L99.7090909,105.463636 C111.054545,95.0181818 117.6,79.6363636 117.6,61.3636364 L117.6,61.3636364 Z" />
      <path fill="#34A853" d="M60,120 C76.2,120 89.7818182,114.627273 99.7090909,105.463636 L80.3181818,90.4090909 C74.9454545,94.0090909 68.0727273,96.1363636 60,96.1363636 C44.3727273,96.1363636 31.1454545,85.5818182 26.4272727,71.4 L6.38181818,71.4 L6.38181818,86.9454545 C16.2545455,106.554545 36.5454545,120 60,120 L60,120 Z" />
      <path fill="#FBBC05" d="M26.4272727,71.4 C25.2272727,67.8 24.5454545,63.9545455 24.5454545,60 C24.5454545,56.0454545 25.2272727,52.2 26.4272727,48.6 L26.4272727,33.0545455 L6.38181818,33.0545455 C2.31818182,41.1545455 0,50.3181818 0,60 C0,69.6818182 2.31818182,78.8454545 6.38181818,86.9454545 L26.4272727,71.4 L26.4272727,71.4 Z" />
      <path fill="#EA4335" d="M60,23.8636364 C68.8090909,23.8636364 76.7181818,26.8909091 82.9363636,32.8363636 L100.145455,15.6272727 C89.7545455,5.94545455 76.1727273,0 60,0 C36.5454545,0 16.2545455,13.4454545 6.38181818,33.0545455 L26.4272727,48.6 C31.1454545,34.4181818 44.3727273,23.8636364 60,23.8636364 L60,23.8636364 Z" />
    </svg>
  );
}
