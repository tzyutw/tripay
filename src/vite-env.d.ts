/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

/** 建置時由 vite `define` 注入的 commit 短碼。設定頁最下面會顯示它——
 *  沒有這一行，「使用者到底拿到哪一版」下一次又要花一輪才查得出來。 */
declare const __BUILD_SHA__: string;
