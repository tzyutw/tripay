-- ============================================================
-- Tripay Phase 1 Initial Schema
-- ============================================================

-- Enums
CREATE TYPE payment_method AS ENUM ('cash', 'credit_card', 'stored_value');
CREATE TYPE expense_type AS ENUM ('shared', 'individual', 'personal');
CREATE TYPE trip_status AS ENUM ('planned', 'active', 'settled', 'archived');
CREATE TYPE settlement_status AS ENUM ('draft', 'confirmed', 'superseded');

-- profiles
CREATE TABLE profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  google_sub text,
  display_name text,
  avatar_url text,
  created_at timestamptz DEFAULT now()
);

-- trips
CREATE TABLE trips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name text NOT NULL,
  emoji text NOT NULL DEFAULT '✈️',
  currency char(3) NOT NULL DEFAULT 'TWD',
  start_date date NOT NULL,
  end_date date NOT NULL,
  status trip_status NOT NULL DEFAULT 'planned',
  share_token text NOT NULL DEFAULT gen_random_uuid()::text,
  owner_member_id uuid,
  collab_enabled bool NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- trip_members
CREATE TABLE trip_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id uuid NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  name text NOT NULL,
  emoji text NOT NULL DEFAULT '🙂',
  sort_order int NOT NULL DEFAULT 0,
  linked_profile_id uuid REFERENCES profiles(id),
  created_at timestamptz DEFAULT now()
);

-- FK for owner_member_id (after trip_members exists)
ALTER TABLE trips ADD CONSTRAINT trips_owner_member_id_fkey
  FOREIGN KEY (owner_member_id) REFERENCES trip_members(id) ON DELETE SET NULL;

-- expenses
CREATE TABLE expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id uuid NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  payer_member_id uuid NOT NULL REFERENCES trip_members(id),
  created_by uuid NOT NULL REFERENCES profiles(id),
  title text NOT NULL,
  category_emoji text NOT NULL DEFAULT '➕',
  expense_date date NOT NULL,
  foreign_amount numeric,
  twd_amount numeric,
  exchange_rate numeric,
  foreign_pending bool NOT NULL DEFAULT false,
  twd_pending bool NOT NULL DEFAULT false,
  payment_method payment_method NOT NULL,
  expense_type expense_type NOT NULL DEFAULT 'shared',
  card_id uuid,
  deleted_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- expense_splits
CREATE TABLE expense_splits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_id uuid NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES trip_members(id) ON DELETE CASCADE,
  is_participating bool NOT NULL DEFAULT true,
  split_amount numeric,
  split_pending bool NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- settlements
CREATE TABLE settlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id uuid NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  created_by uuid NOT NULL REFERENCES profiles(id),
  status settlement_status NOT NULL DEFAULT 'draft',
  settled_at timestamptz,
  created_at timestamptz DEFAULT now()
);

-- settlement_items
CREATE TABLE settlement_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  settlement_id uuid NOT NULL REFERENCES settlements(id) ON DELETE CASCADE,
  from_member_id uuid NOT NULL REFERENCES trip_members(id),
  to_member_id uuid NOT NULL REFERENCES trip_members(id),
  amount numeric NOT NULL,
  is_cleared bool NOT NULL DEFAULT false,
  cleared_at timestamptz
);

-- ============================================================
-- Row Level Security
-- ============================================================

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE trips ENABLE ROW LEVEL SECURITY;
ALTER TABLE trip_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE expense_splits ENABLE ROW LEVEL SECURITY;
ALTER TABLE settlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE settlement_items ENABLE ROW LEVEL SECURITY;

-- profiles
CREATE POLICY "profiles: owner read" ON profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "profiles: owner insert" ON profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "profiles: owner update" ON profiles FOR UPDATE USING (auth.uid() = id);

-- trips
CREATE POLICY "trips: owner read" ON trips FOR SELECT USING (auth.uid() = owner_id);
CREATE POLICY "trips: owner insert" ON trips FOR INSERT WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "trips: owner update" ON trips FOR UPDATE USING (auth.uid() = owner_id);
CREATE POLICY "trips: owner delete" ON trips FOR DELETE USING (auth.uid() = owner_id);
CREATE POLICY "trips: share_token read" ON trips FOR SELECT USING (share_token IS NOT NULL AND share_token != '');

-- trip_members
CREATE POLICY "trip_members: owner read" ON trip_members FOR SELECT USING (EXISTS (SELECT 1 FROM trips WHERE id = trip_id AND owner_id = auth.uid()));
CREATE POLICY "trip_members: owner insert" ON trip_members FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM trips WHERE id = trip_id AND owner_id = auth.uid()));
CREATE POLICY "trip_members: owner update" ON trip_members FOR UPDATE USING (EXISTS (SELECT 1 FROM trips WHERE id = trip_id AND owner_id = auth.uid()));
CREATE POLICY "trip_members: owner delete" ON trip_members FOR DELETE USING (EXISTS (SELECT 1 FROM trips WHERE id = trip_id AND owner_id = auth.uid()));
CREATE POLICY "trip_members: share read" ON trip_members FOR SELECT USING (EXISTS (SELECT 1 FROM trips WHERE id = trip_id AND share_token IS NOT NULL));

-- expenses
CREATE POLICY "expenses: owner read" ON expenses FOR SELECT USING (EXISTS (SELECT 1 FROM trips WHERE id = trip_id AND owner_id = auth.uid()));
CREATE POLICY "expenses: owner insert" ON expenses FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM trips WHERE id = trip_id AND owner_id = auth.uid()));
CREATE POLICY "expenses: owner update" ON expenses FOR UPDATE USING (EXISTS (SELECT 1 FROM trips WHERE id = trip_id AND owner_id = auth.uid()));
CREATE POLICY "expenses: share read" ON expenses FOR SELECT USING (EXISTS (SELECT 1 FROM trips WHERE id = trip_id AND share_token IS NOT NULL));

-- expense_splits
CREATE POLICY "expense_splits: owner read" ON expense_splits FOR SELECT USING (EXISTS (SELECT 1 FROM expenses e JOIN trips t ON t.id = e.trip_id WHERE e.id = expense_id AND t.owner_id = auth.uid()));
CREATE POLICY "expense_splits: owner insert" ON expense_splits FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM expenses e JOIN trips t ON t.id = e.trip_id WHERE e.id = expense_id AND t.owner_id = auth.uid()));
CREATE POLICY "expense_splits: owner update" ON expense_splits FOR UPDATE USING (EXISTS (SELECT 1 FROM expenses e JOIN trips t ON t.id = e.trip_id WHERE e.id = expense_id AND t.owner_id = auth.uid()));
CREATE POLICY "expense_splits: share read" ON expense_splits FOR SELECT USING (EXISTS (SELECT 1 FROM expenses e JOIN trips t ON t.id = e.trip_id WHERE e.id = expense_id AND t.share_token IS NOT NULL));

-- settlements
CREATE POLICY "settlements: owner read" ON settlements FOR SELECT USING (EXISTS (SELECT 1 FROM trips WHERE id = trip_id AND owner_id = auth.uid()));
CREATE POLICY "settlements: owner insert" ON settlements FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM trips WHERE id = trip_id AND owner_id = auth.uid()));
CREATE POLICY "settlements: owner update" ON settlements FOR UPDATE USING (EXISTS (SELECT 1 FROM trips WHERE id = trip_id AND owner_id = auth.uid()));
CREATE POLICY "settlements: share read" ON settlements FOR SELECT USING (EXISTS (SELECT 1 FROM trips WHERE id = trip_id AND share_token IS NOT NULL));

-- settlement_items
CREATE POLICY "settlement_items: owner read" ON settlement_items FOR SELECT USING (EXISTS (SELECT 1 FROM settlements s JOIN trips t ON t.id = s.trip_id WHERE s.id = settlement_id AND t.owner_id = auth.uid()));
CREATE POLICY "settlement_items: owner insert" ON settlement_items FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM settlements s JOIN trips t ON t.id = s.trip_id WHERE s.id = settlement_id AND t.owner_id = auth.uid()));
CREATE POLICY "settlement_items: owner update" ON settlement_items FOR UPDATE USING (EXISTS (SELECT 1 FROM settlements s JOIN trips t ON t.id = s.trip_id WHERE s.id = settlement_id AND t.owner_id = auth.uid()));
CREATE POLICY "settlement_items: share read" ON settlement_items FOR SELECT USING (EXISTS (SELECT 1 FROM settlements s JOIN trips t ON t.id = s.trip_id WHERE s.id = settlement_id AND t.share_token IS NOT NULL));

-- ============================================================
-- Auto-create profile on Google signup
-- ============================================================
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO profiles (id, google_sub, display_name, avatar_url)
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data->>'sub',
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'avatar_url'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ============================================================
-- confirm_settlement RPC (transactional, CR Issue #3)
-- ============================================================
CREATE OR REPLACE FUNCTION confirm_settlement(
  p_settlement_id uuid,
  p_user_id uuid
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_trip_id uuid;
BEGIN
  SELECT s.trip_id INTO v_trip_id
  FROM settlements s
  JOIN trips t ON t.id = s.trip_id
  WHERE s.id = p_settlement_id
    AND s.status = 'draft'
    AND t.owner_id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'settlement_not_found_or_unauthorized';
  END IF;

  IF EXISTS (
    SELECT 1 FROM settlements
    WHERE trip_id = v_trip_id
      AND status = 'draft'
      AND id != p_settlement_id
      AND created_at > (SELECT created_at FROM settlements WHERE id = p_settlement_id)
  ) THEN
    RAISE EXCEPTION 'settlement_superseded';
  END IF;

  UPDATE settlements SET status = 'confirmed', settled_at = now()
  WHERE id = p_settlement_id;

  UPDATE trips SET status = 'settled', updated_at = now()
  WHERE id = v_trip_id;
END;
$$;
