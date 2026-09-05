export type TripStatus        = 'planned' | 'active' | 'settled' | 'archived';
export type ExpenseType       = 'shared' | 'individual' | 'personal';
export type PaymentMethod     = 'cash' | 'credit_card' | 'stored_value';
export type SettlementStatus  = 'draft' | 'confirmed' | 'superseded';
export type DisplayStatus     = 'planned' | 'active' | 'settled' | 'archived';
/* 實作-A-0a：以下兩個型別對應 production 的實際定義（用 MCP 查出來的，不是照文件抄）
   trip_kind 是 enum；settlement_mode 是 text ＋ check 約束，不是 enum。 */
export type TripKind          = 'trip' | 'statement';
export type SettlementMode    = 'direct' | 'hub';

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
  /* 實作-A-0a：007／008／010 上線後型別一直沒補，TripListPage 早就在查 kind 了 */
  kind: TripKind;                     // 007　trip＝一般行程，statement＝帳單
  card_id: string | null;             // 007　kind='statement' 時必填，'trip' 時必為 null
  cover_path: string | null;          // 008　Storage 上的封面路徑
  settlement_mode: SettlementMode;    // 010　direct＝誰欠誰就轉給誰，hub＝都轉給同一個人
  hub_member_id: string | null;       // 010　settlement_mode='hub' 時的中心人
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
  person_id: string | null;           // 006　people 層：跨行程認得同一個人
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
  settled_on_spot: boolean;   // 共同但當場各付各的：記錄但不進結算
  is_sponsor: boolean;        // 外部贊助/回饋：負額共同項，平均扣進每人應付
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
