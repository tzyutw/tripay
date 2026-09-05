/* jsonb 欄位的型別。Supabase 產生的型別也是長這樣。 */
export type Json = string | number | boolean | null | { [k: string]: Json } | Json[];

export type TripStatus        = 'planned' | 'active' | 'settled' | 'archived';
export type ExpenseType       = 'shared' | 'individual' | 'personal';
export type PaymentMethod     = 'cash' | 'credit_card' | 'stored_value';
export type SettlementStatus  = 'draft' | 'confirmed' | 'superseded';
export type DisplayStatus     = 'planned' | 'active' | 'settled' | 'archived';
/* 實作-A-0a：以下兩個型別對應 production 的實際定義（用 MCP 查出來的，不是照文件抄）
   trip_kind 是 enum；settlement_mode 是 text ＋ check 約束，不是 enum。 */
export type TripKind          = 'trip' | 'statement';
export type SettlementMode    = 'direct' | 'hub';
/* 012 加的三個受 check 約束的欄位。值域照 production 實查，不照文件抄。 */
export type SplitFillCurrency = 'TWD' | 'FOR';   // 各自金額是用哪種幣別填的
export type MemberRole        = 'editor' | 'viewer';   // 共編前置，Phase 2 才用

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
  /* 012 */
  payment_methods: Json | null;       // 這趟的支付方式清單（S-02b-11）
  cash_rate_twd: number | null;       // 這趟的現金匯率。⚠️ 依規格 §2A.5 命名，
  cash_rate_foreign: number | null;   //    不是 rate_twd／rate_for（那是舊寫法）
  tone_seq: number | null;            // 建立當下算出的循環色號 0–7。
                                      // 存起來才不會刪掉一趟就讓後面的顏色集體位移
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
  /* 012　共編前置（Phase 2 才用，現在加最便宜）*/
  user_id: string | null;             // unique (trip_id, user_id)
  role: MemberRole | null;            // null＝沿用既有行為（owner 全權）
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
  /* 012 */
  split_fill_currency: SplitFillCurrency;  // not null default 'TWD'。
                                           // 一定要有 default——既有 404 筆若是 NULL，
                                           // 就多一個「NULL 當成什麼」的未定義分支
  individual_member_id: string | null;     // 「只算一個人」選的人（S-04-17）。
                                           // FK on delete restrict：有帳款紀錄的成員不能刪
  payment_label: string | null;            // 行程自訂的支付方式（Linepay），enum 塞不下
  category_emoji_manual: boolean;          // 手動改過的類別 emoji 不被標題覆蓋（S-04-3）
  updated_by: string | null;               // 共編前置，之後才加補不回歷史
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
  /* 012　P1-0：唯一一條會靜默算錯帳的。各自金額原本只有台幣語意，
     填外幣會被當台幣加總，而且不報錯 */
  split_amount_foreign: number | null;
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
