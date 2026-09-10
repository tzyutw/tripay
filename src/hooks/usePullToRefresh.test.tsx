/* 🔴 修-6／修-7　下拉重新整理的手感與逾時。
 *
 * ⚠️ jsdom 沒有 `TouchEvent` 建構子，所以自己造一個帶 `touches` 的 Event——
 * hook 讀的只有 `e.touches[0].clientY`，形狀對得上就量得到。
 * （真機手感仍要 Rozi 自己拉一次，這裡守的是**數值與狀態機**。）
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { ToastProvider } from '@/contexts/ToastContext';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';
import { MSG_SAVE_OFFLINE } from '@/lib/messages';

function Harness({ onRefresh }: { onRefresh: (s: AbortSignal) => Promise<unknown> | void }) {
  const ptr = usePullToRefresh(onRefresh);
  return (
    <div data-testid="scroller" ref={ptr.ref}>
      {ptr.visible && <div data-testid="ind" style={ptr.indicatorStyle} />}
      <span data-testid="pull">{Math.round(ptr.pull)}</span>
      <span data-testid="refreshing">{String(ptr.refreshing)}</span>
    </div>
  );
}

function mount(onRefresh: (s: AbortSignal) => Promise<unknown> | void) {
  render(<ToastProvider><Harness onRefresh={onRefresh} /></ToastProvider>);
  return screen.getByTestId('scroller');
}

function touch(el: HTMLElement, type: string, clientY: number) {
  const e = new Event(type, { bubbles: true, cancelable: true });
  (e as unknown as { touches: { clientY: number }[] }).touches = [{ clientY }];
  el.dispatchEvent(e);
}

/** 手指從 0 拉到 dy，回傳畫面上的位移量 */
function drag(el: HTMLElement, dy: number) {
  act(() => { touch(el, 'touchstart', 0); touch(el, 'touchmove', dy); });
  return Number(screen.getByTestId('pull').textContent);
}

const pullNow = () => Number(screen.getByTestId('pull').textContent);
const refreshingNow = () => screen.getByTestId('refreshing').textContent === 'true';
const transitionNow = () => screen.getByTestId('ind').style.transition;

beforeEach(() => vi.useFakeTimers());
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe('修-6　iOS 橡皮筋曲線', () => {
  it('前段幾乎 1:1 跟手——拉 20px 不是舊的 10，而是 19', () => {
    const el = mount(() => {});
    expect(drag(el, 20)).toBe(19);
  });

  it('拉越遠越黏：60→54、70→62、200 被 MAX_PULL 收在 120', () => {
    const el = mount(() => {});
    expect(drag(el, 60)).toBe(54);
    expect(drag(el, 70)).toBe(62);
    expect(drag(el, 200)).toBe(120);          // 公式本身算出 146，上限收在 120
    /* 反向：不得再是固定比例——固定 0.5 的話 200px 會是 100 */
    expect(drag(el, 200)).not.toBe(100);
  });

  it('拉 70px 放開 → 觸發；拉 40px 放開 → 不觸發', async () => {
    const onRefresh = vi.fn(() => Promise.resolve());
    const el = mount(onRefresh);

    drag(el, 40);
    await act(async () => { touch(el, 'touchend', 40); });
    expect(onRefresh, '40px 不該觸發').not.toHaveBeenCalled();

    drag(el, 70);
    await act(async () => { touch(el, 'touchend', 70); });
    expect(onRefresh, '70px 要觸發').toHaveBeenCalledTimes(1);
  });

  it('放開的那一刻才有 transition，拖曳過程中一定是 none', async () => {
    const el = mount(() => {});
    drag(el, 70);
    expect(transitionNow(), '拖曳中不得有 transition（會跟手指脫節）').toBe('none');

    await act(async () => { touch(el, 'touchend', 70); });
    /* 指示器要留在畫面上，不然沒有東西可以跑回彈動畫 */
    expect(screen.queryByTestId('ind'), '回彈期間指示器不得直接消失').not.toBeNull();
    expect(transitionNow()).toMatch(/280ms\s+cubic-bezier\(0\.23,\s*1,\s*0\.32,\s*1\)/);
    expect(pullNow(), '回彈的終點是 0').toBe(0);

    await act(async () => { vi.advanceTimersByTime(300); });
    expect(screen.queryByTestId('ind'), '回彈跑完就收起來').toBeNull();
  });
});

describe('修-7　轉太久要講話', () => {
  it('10 秒沒回應：停止轉圈、跳「現在連不上網路」、中止那個請求', async () => {
    let signal: AbortSignal | undefined;
    const el = mount(s => { signal = s; return new Promise(() => {}); });   // 永不 resolve

    drag(el, 70);
    await act(async () => { touch(el, 'touchend', 70); });
    expect(refreshingNow(), '一開始要轉').toBe(true);

    await act(async () => { vi.advanceTimersByTime(9_000); });
    expect(screen.queryByText(MSG_SAVE_OFFLINE), '九秒還不能放棄').toBeNull();

    await act(async () => { vi.advanceTimersByTime(1_500); });
    expect(refreshingNow(), '轉圈要停').toBe(false);
    expect(screen.getByText(MSG_SAVE_OFFLINE)).toBeInTheDocument();
    expect(signal!.aborted, '請求要真的被中止，不能放著背景跑完').toBe(true);
  });

  it('反向：正常回應的時候不得出現那句話，也不得中止請求', async () => {
    let signal: AbortSignal | undefined;
    const el = mount(s => { signal = s; return Promise.resolve(); });

    drag(el, 70);
    await act(async () => { touch(el, 'touchend', 70); });
    await act(async () => { vi.advanceTimersByTime(12_000); });

    expect(screen.queryByText(MSG_SAVE_OFFLINE)).toBeNull();
    expect(refreshingNow()).toBe(false);
    expect(signal!.aborted).toBe(false);
  });

  it('沒到門檻就放開：不觸發，也就不會有逾時提示', async () => {
    const onRefresh = vi.fn(() => new Promise(() => {}));
    const el = mount(onRefresh);
    drag(el, 40);
    await act(async () => { touch(el, 'touchend', 40); });
    await act(async () => { vi.advanceTimersByTime(12_000); });
    expect(onRefresh).not.toHaveBeenCalled();
    expect(screen.queryByText(MSG_SAVE_OFFLINE)).toBeNull();
  });
});
