/* 後台-A／E　總覽排序、綁定帳號、用人查。 */
import { describe, it, expect } from 'vitest';
import { buildTrips, sortForOverview, tripsOfUser, boundUserId, fmtTime, ago } from './model';
import { baseTrip, mk, M } from '@/test/fixtures/adminFixture';
import type { TripWithMembers } from '@/types/database';

const trip = (id: string, o: Record<string, unknown> = {}) =>
  ({ ...baseTrip, id, name: id, trip_members: baseTrip.trip_members.map(m => ({ ...m, trip_id: id })), ...o }) as
  TripWithMembers & { last_activity_at: string; recent_error_count: number };

describe('行程總覽', () => {
  it('有異常的排最上面，越多越上面；其餘照最後動作時間', () => {
    const trips = [
      trip('ok-old', { last_activity_at: '2026-01-01' }),
      trip('ok-new', { last_activity_at: '2026-11-01' }),
      trip('err1', { last_activity_at: '2025-01-01', recent_error_count: 1 }),
      trip('bad2', { last_activity_at: '2025-01-01' }),
    ];
    const ex = [mk({ trip_id: 'bad2' }), mk({ trip_id: 'bad2', parts: [], twd_amount: 1 })];
    const rows = sortForOverview(buildTrips(trips, ex, []));
    expect(rows.map(r => `${r.trip.id}:${r.anomalyCount}`)).toEqual(['bad2:2', 'err1:1', 'ok-new:0', 'ok-old:0']);
  });

  it('狀態用前台同一套字', () => {
    const [r] = buildTrips([trip('t', { status: 'settled' })], [], []);
    expect(r.statusLabel).toBe('已結算');
  });

  it('取這趟最新一次已確認的結算（與結算頁同一個查法）', () => {
    const s = (id: string, at: string) => ({ id, trip_id: 't', status: 'confirmed', created_at: at, settlement_items: [] });
    const [r] = buildTrips([trip('t')], [], [s('old', '2026-01-01'), s('new', '2026-02-01')]);
    expect(r.confirmed?.id).toBe('new');
  });
});

describe('綁定帳號與用人查', () => {
  it('擁有者那一列算綁定（owner_member_id），user_id 也算，其他沒綁', () => {
    expect(boundUserId(baseTrip.trip_members[0], baseTrip)).toBe('u1');
    expect(boundUserId(baseTrip.trip_members[1], baseTrip)).toBe('u2');
    expect(boundUserId(baseTrip.trip_members[2], baseTrip)).toBeNull();
  });

  it('參加的行程：自己建的＋被綁進去的', () => {
    const rows = buildTrips([trip('a'), trip('b', { owner_id: 'u9', owner_member_id: null,
      trip_members: baseTrip.trip_members.map(m => ({ ...m, user_id: null })) })], [], []);
    expect(tripsOfUser(rows, 'u1').map(r => r.trip.id)).toEqual(['a']);
    expect(tripsOfUser(rows, 'u2').map(r => r.trip.id)).toEqual(['a']);
    expect(tripsOfUser(rows, 'u9').map(r => r.trip.id)).toEqual(['b']);
    void M;
  });
});

describe('時間顯示（台灣時間）', () => {
  const now = new Date('2026-11-05T12:00:00Z');
  it('同年不帶年份、跨年帶年份', () => {
    expect(fmtTime('2026-11-05T03:04:00Z', now)).toBe('11/5 11:04');
    expect(fmtTime('2025-12-31T16:30:00Z', now)).toBe('1/1 00:30');
    expect(fmtTime('2025-06-01T00:00:00Z', now)).toBe('2025/6/1 08:00');
  });
  it('多久以前', () => {
    expect(ago('2026-11-05T11:59:30Z', now)).toBe('剛剛');
    expect(ago('2026-11-05T09:00:00Z', now)).toBe('3 小時前');
    expect(ago('2026-11-03T12:00:00Z', now)).toBe('2 天前');
    expect(ago(null, now)).toBe('沒有紀錄');
  });
});
