import React from 'react';
import ReactDOM from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App';
import { installUpdater, installChunkRecovery } from '@/lib/swUpdate';
import { installErrorLogFlush } from '@/lib/errorLog';
import './index.css';

/* 新版一部署好就換掉，並在 chunk 載不到時自救。
   規則與理由全部寫在 `@/lib/swUpdate`——這裡只負責把真正的 `registerSW` 注進去
   （`virtual:pwa-register` 是建置期的虛擬模組，測試環境解析不到）。 */
installUpdater(registerSW);
installChunkRecovery(window as never);
/* 後台-D　補送上次離線時沒送出的錯誤紀錄。永不拋錯。 */
installErrorLogFlush();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
