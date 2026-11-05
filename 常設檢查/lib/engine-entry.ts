/* C7／C8 用：把**正式的**計算程式打包給 node 跑（不是另寫一套 SQL 近似）。
   `breakdownFor` 就是 S-05「查看計算依據」每人卡片用的那一支。 */
export { calc, tripSummary, settleTrip } from '@/lib/summary';
export { breakdownFor } from '@/pages/SettlementPage';
