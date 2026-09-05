import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

/* 每個測試之間清乾淨，否則上一個測試的 DOM 會被下一個 getByText 找到，
   造成「查了但沒查到」的相反面：查到的是別人的東西。 */
afterEach(() => { cleanup(); vi.clearAllMocks(); });

/* jsdom 沒有這幾個，元件用到就會炸 */
if (!window.matchMedia) {
  window.matchMedia = ((q: string) => ({
    matches: false, media: q, onchange: null,
    addListener: () => {}, removeListener: () => {},
    addEventListener: () => {}, removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}
if (!window.scrollTo) window.scrollTo = (() => {}) as typeof window.scrollTo;
