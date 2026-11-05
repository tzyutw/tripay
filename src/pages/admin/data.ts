/* 後台的資料層。只有讀取，沒有任何寫入。
 *
 * 所有跨行程的資料都走資料庫的 `admin_*` 函式（migration 018）。
 * 那些函式第一行就檢查呼叫者是不是管理者，不是就拋 42501——
 * **前端藏不藏入口不影響安全**，這裡的 gate 只是讓非管理者不要看到空白頁。 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import type { ExpenseWithSplits, TripWithMembers } from '@/types/database';
import type { ConfirmedSettlement } from '@/lib/admin/settlementView';
import type { AuditRow } from '@/lib/admin/audit';

export type AdminTrip = TripWithMembers & {
  last_activity_at: string | null;
  deleted_expense_count: number;
  recent_error_count: number;
};

export interface AdminUser {
  id: string;
  email: string | null;
  display_name: string | null;
  created_at: string;
  last_sign_in_at: string | null;
  last_active_at: string | null;
  is_admin: boolean;
}

export interface Snapshot {
  audit_started_at: string | null;
  trips: AdminTrip[];
  expenses: ExpenseWithSplits[];
  settlements: ConfirmedSettlement[];
  users: AdminUser[];
}

export interface ErrorRow {
  id: number;
  at: string;
  occurred_at: string | null;
  user_id: string;
  trip_id: string | null;
  screen: string | null;
  path: string | null;
  kind: 'save' | 'sync' | 'other' | null;
  message: string | null;
  user_agent: string | null;
  app_version: string | null;
}

/** 這個帳號是不是管理者。函式不存在（migration 還沒套）或任何錯誤一律當「不是」。 */
export function useIsAdmin() {
  return useQuery<boolean>({
    queryKey: ['admin', 'check'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('admin_check');
      if (error) return false;
      return data === true;
    },
    staleTime: 5 * 60_000,
    retry: false,
  });
}

export function useSnapshot(enabled: boolean) {
  return useQuery<Snapshot>({
    queryKey: ['admin', 'snapshot'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('admin_snapshot');
      if (error) throw error;
      return data as Snapshot;
    },
    enabled,
    staleTime: 30_000,
  });
}

export function useAudit(enabled: boolean, f: { trip?: string | null; actor?: string | null; limit?: number }) {
  return useQuery<AuditRow[]>({
    queryKey: ['admin', 'audit', f.trip ?? null, f.actor ?? null, f.limit ?? 200],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('admin_audit', {
        p_trip: f.trip ?? null, p_actor: f.actor ?? null, p_limit: f.limit ?? 200,
      });
      if (error) throw error;
      return (data ?? []) as AuditRow[];
    },
    enabled,
    staleTime: 30_000,
  });
}

export function useErrors(enabled: boolean, f: { trip?: string | null; user?: string | null; limit?: number }) {
  return useQuery<ErrorRow[]>({
    queryKey: ['admin', 'errors', f.trip ?? null, f.user ?? null, f.limit ?? 200],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('admin_errors', {
        p_trip: f.trip ?? null, p_user: f.user ?? null, p_limit: f.limit ?? 200,
      });
      if (error) throw error;
      return (data ?? []) as ErrorRow[];
    },
    enabled,
    staleTime: 30_000,
  });
}
