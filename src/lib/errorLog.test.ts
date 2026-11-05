/* 後台-D　錯誤紀錄：記得到東西、而且**記錄失敗絕不影響記帳**。 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const insert = vi.hoisted(() => vi.fn());
vi.mock('@/lib/supabaseClient', () => ({
  supabase: { from: vi.fn(() => ({ insert })) },
}));

import { logClientError, flushErrorQueue, screenOf, messageOf } from './errorLog';

const TRIP = '11111111-2222-3333-4444-555555555555';
const KEY = 'tripay.errlog.queue.v1';
const tick = () => new Promise(r => setTimeout(r, 0));

beforeEach(() => {
  localStorage.clear();
  insert.mockReset();
  Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
});

describe('畫面與行程判斷', () => {
  it.each([
    [`/tripay/trips/${TRIP}`, '記帳頁', TRIP],
    [`/trips/${TRIP}/settlement`, '結算', TRIP],
    [`/trips/${TRIP}/edit`, '編輯行程', TRIP],
    ['/tripay/trips/new', '建立行程', null],
    ['/tripay/', '行程列表', null],
    ['/settings', '設定', null],
    ['/trips/not-a-uuid', '記帳頁', null],
  ])('%s → %s', (p, screen, trip) => {
    expect(screenOf(p)).toEqual({ screen, tripId: trip });
  });

  it('Supabase 的錯誤物件也讀得出訊息', () => {
    expect(messageOf({ message: 'new row violates row-level security', code: '42501' }))
      .toBe('new row violates row-level security · code=42501');
    expect(messageOf(new Error('Failed to fetch'))).toBe('Failed to fetch');
  });
});

describe('記一筆', () => {
  it('存檔失敗：送出時間、行程、畫面、訊息；不送 user_id（資料庫用登入身分填）、不加 .select()', async () => {
    insert.mockResolvedValue({ error: null });
    logClientError('save', new Error('Failed to fetch'), `/tripay/trips/${TRIP}`);
    await tick();
    expect(insert).toHaveBeenCalledTimes(1);
    const [rows] = insert.mock.calls[0];
    expect(rows[0]).toMatchObject({ kind: 'save', trip_id: TRIP, screen: '記帳頁', message: 'Failed to fetch' });
    expect(rows[0]).not.toHaveProperty('user_id');
    expect(rows[0].occurred_at).toMatch(/^\d{4}-\d\d-\d\dT/);
    expect(localStorage.getItem(KEY)).toBeNull();     // 送成功就清掉
  });

  it('送不出去（表還沒建、權限不對）：不拋錯，留在佇列等下次', async () => {
    insert.mockResolvedValue({ error: { message: 'relation does not exist' } });
    expect(() => logClientError('save', 'x', '/trips/new')).not.toThrow();
    await tick();
    expect(JSON.parse(localStorage.getItem(KEY)!)).toHaveLength(1);
    insert.mockResolvedValue({ error: null });
    await flushErrorQueue();
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it('網路斷線：不送，留在佇列；連上之後補送，時間是當時發生的時間', async () => {
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
    logClientError('save', 'Failed to fetch', `/trips/${TRIP}`);
    await tick();
    expect(insert).not.toHaveBeenCalled();
    const queued = JSON.parse(localStorage.getItem(KEY)!)[0];
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
    insert.mockResolvedValue({ error: null });
    await flushErrorQueue();
    expect(insert.mock.calls[0][0][0].occurred_at).toBe(queued.occurred_at);
  });

  it('supabase 本身直接拋例外：一樣不會往外拋', async () => {
    insert.mockImplementation(() => { throw new Error('boom'); });
    expect(() => logClientError('sync', 'x', '/')).not.toThrow();
    await tick();
    await expect(flushErrorQueue()).resolves.toBeUndefined();
  });

  it('localStorage 壞掉（無痕模式）：不會往外拋', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota'); });
    expect(() => logClientError('save', 'x', '/')).not.toThrow();
    spy.mockRestore();
  });

  it('佇列最多 20 筆，滿了丟最舊的', async () => {
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
    for (let i = 0; i < 25; i++) logClientError('save', `e${i}`, '/');
    const q = JSON.parse(localStorage.getItem(KEY)!);
    expect(q).toHaveLength(20);
    expect(q[0].message).toBe('e5');
  });

  it('後台自己的錯誤不記', async () => {
    logClientError('sync', 'x', '/tripay/admin/log');
    await tick();
    expect(insert).not.toHaveBeenCalled();
    expect(localStorage.getItem(KEY)).toBeNull();
  });
});
