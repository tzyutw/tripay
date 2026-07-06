import type { Trip, DisplayStatus } from '@/types/database';

export function deriveDisplayStatus(trip: Pick<Trip, 'status' | 'start_date'>): DisplayStatus {
  if (trip.status === 'settled')  return 'settled';
  if (trip.status === 'archived') return 'archived';
  const todayYmd = new Date().toISOString().slice(0, 10);
  return todayYmd < trip.start_date ? 'planned' : 'active';
}

export const STATUS_LABEL: Record<DisplayStatus, string> = {
  planned:  '出發前',
  active:   '旅途中',
  settled:  '✅ 已結算',
  archived: '已封存',
};

export const STATUS_BADGE_CLASS: Record<DisplayStatus, string> = {
  planned:  'bg-white/20 text-white border border-white/30',
  active:   'bg-white/25 text-white border border-white/40',
  settled:  'bg-white/15 text-white/85 border border-white/25',
  archived: 'bg-black/20 text-white/70 border border-white/20',
};
