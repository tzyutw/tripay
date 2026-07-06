import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

// 型別由 @/types/database.ts 手動維護；之後以 supabase gen types 替換 Database generic
export const supabase = createClient(supabaseUrl, supabaseAnonKey);
