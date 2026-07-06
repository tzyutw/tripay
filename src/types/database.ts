export type TripStatus        = 'planned' | 'active' | 'settled' | 'archived';
export type ExpenseType       = 'shared' | 'individual' | 'personal';
export type PaymentMethod     = 'cash' | 'credit_card' | 'stored_value';
export type SettlementStatus  = 'draft' | 'confirmed' | 'superseded';
export type DisplayStatus     = 'planned' | 'active' | 'settled' | 'archived';

export interface Trip {
  id: string;
  owner_id: string;
  name: string;
  emoji: string;
  currency: string;
  start_date: string;   // ISO date "YYYY-MM-DD"
  end_date: string;
  status: TripStatus;
  share_token: string;
  owner_member_id: string | null;
  collab_enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface TripMember {
  id: string;
  trip_id: string;
  name: string;
  emoji: string;
  sort_order: number;
  linked_profile_id: string | null;
  created_at: string;
}

export interface Expense {
  id: string;
  trip_id: string;
  payer_member_id: string;
  created_by: string;
  title: string;
  category_emoji: string;
  expense_date: string;   // ISO date
  foreign_amount: number | null;
  twd_amount: number | null;
  exchange_rate: number | null;
  foreign_pending: boolean;
  twd_pending: boolean;
  payment_method: PaymentMethod;
  expense_type: ExpenseType;
  card_id: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ExpenseSplit {
  id: string;
  expense_id: string;
  member_id: string;
  is_participating: boolean;
  split_amount: number | null;
  split_pending: boolean;
  created_at: string;
}

export interface Settlement {
  id: string;
  trip_id: string;
  created_by: string;
  status: SettlementStatus;
  settled_at: string | null;
  created_at: string;
}

export interface SettlementItem {
  id: string;
  settlement_id: string;
  from_member_id: string;
  to_member_id: string;
  amount: number;
  is_cleared: boolean;
  cleared_at: string | null;
}

export interface ShareToken {
  id: string;
  trip_id: string;
  token: string;
  created_at: string;
  expires_at: string | null;
}

// ── Extended types with relations ──────────────────────────────────────────────

export type TripWithMembers = Trip & { trip_members: TripMember[] };
export type ExpenseWithSplits = Expense & { expense_splits: ExpenseSplit[] };

// ── Supabase Database shape ────────────────────────────────────────────────────

export type Database = {
  public: {
    Tables: {
      trips: {
        Row: Trip;
        Insert: Omit<Trip, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<Trip, 'id' | 'created_at'>>;
      };
      trip_members: {
        Row: TripMember;
        Insert: Omit<TripMember, 'id' | 'created_at'>;
        Update: Partial<Omit<TripMember, 'id' | 'created_at'>>;
      };
      expenses: {
        Row: Expense;
        Insert: Omit<Expense, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<Expense, 'id' | 'created_at'>>;
      };
      expense_splits: {
        Row: ExpenseSplit;
        Insert: Omit<ExpenseSplit, 'id' | 'created_at'>;
        Update: Partial<Omit<ExpenseSplit, 'id' | 'created_at'>>;
      };
      settlements: {
        Row: Settlement;
        Insert: Omit<Settlement, 'id' | 'created_at'>;
        Update: Partial<Omit<Settlement, 'id' | 'created_at'>>;
      };
      settlement_items: {
        Row: SettlementItem;
        Insert: Omit<SettlementItem, 'id'>;
        Update: Partial<Omit<SettlementItem, 'id'>>;
      };
      share_tokens: {
        Row: ShareToken;
        Insert: Omit<ShareToken, 'id' | 'created_at'>;
        Update: Partial<Omit<ShareToken, 'id' | 'created_at'>>;
      };
    };
  };
};
