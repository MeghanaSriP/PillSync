/*
# MediTrack — Intelligent Medication Management Platform (Initial Schema)

This migration establishes the complete database foundation for a medication
reminder, adherence tracking, and refill prediction platform. It supports
patients and caregivers managing medication schedules for chronic disease
management, elderly care, and family medication tracking.

## 1. New Tables

### medicines_db (reference database — validates that a medicine is real)
- `id` (uuid, PK)
- `name` (text, unique) — canonical medicine name
- `generic_name` (text) — active ingredient / generic name
- `category` (text) — e.g. Antibiotic, Analgesic, Antihypertensive
- `form` (text) — e.g. Tablet, Capsule, Syrup, Injection, Inhaler
- `common_dosages` (text[]) — typical dosage strengths
- `side_effects` (text[]) — common side effects
- `controlled` (boolean) — whether it is a controlled substance
- `description` (text)
- `created_at` (timestamptz)

### caregiver_relations
- `id` (uuid, PK)
- `caregiver_id` (uuid, FK -> auth.users) — the caregiver user
- `patient_id` (uuid, FK -> auth.users) — the patient being monitored
- `relation` (text) — e.g. "Son", "Nurse", "Spouse"
- `status` (text) — 'pending' | 'accepted' | 'declined'
- `can_log_doses` (boolean, default true)
- `can_refill` (boolean, default false)
- `created_at` (timestamptz)

### profiles
- `id` (uuid, PK, FK -> auth.users) — one row per user
- `full_name` (text)
- `email` (text, unique)
- `role` (text) — 'patient' | 'caregiver'
- `phone` (text)
- `date_of_birth` (date)
- `emergency_contact` (text)
- `avatar_url` (text)
- `timezone` (text, default 'UTC')
- `created_at` (timestamptz)

### medications
- `id` (uuid, PK)
- `user_id` (uuid, FK -> auth.users) — owner of the medication
- `medicine_db_id` (uuid, FK -> medicines_db, nullable) — link to validated medicine
- `name` (text) — display name
- `generic_name` (text)
- `dosage` (text) — e.g. "500mg"
- `form` (text) — Tablet, Capsule, etc.
- `instructions` (text) — take with food, etc.
- `color` (text) — UI pill color
- `stock_quantity` (int) — current pills on hand
- `initial_stock` (int) — stock at last refill
- `refill_threshold` (int) — low-stock alert level
- `refill_date` (date) — predicted/next refill date
- `prescription_date` (date)
- `prescribing_doctor` (text)
- `condition` (text) — what it treats
- `start_date` (date)
- `end_date` (date) — nullable for ongoing
- `active` (boolean, default true)
- `notes` (text)
- `created_at` (timestamptz)

### schedules
- `id` (uuid, PK)
- `medication_id` (uuid, FK -> medications ON DELETE CASCADE)
- `user_id` (uuid, FK -> auth.users)
- `times` (text[]) — times of day e.g. ['08:00','20:00']
- `frequency` (text) — daily, weekly, specific_days
- `days_of_week` (int[]) — 0=Sun..6=Sat; nullable for daily
- `with_food` (boolean) — take with food
- `dose_amount` (text) — e.g. "1 tablet"
- `created_at` (timestamptz)

### dose_logs
- `id` (uuid, PK)
- `medication_id` (uuid, FK -> medications)
- `user_id` (uuid, FK -> auth.users)
- `scheduled_time` (timestamptz) — when it was supposed to be taken
- `taken_time` (timestamptz, nullable) — when actually taken
- `status` (text) — 'taken' | 'missed' | 'skipped' | 'pending'
- `dose_amount` (text)
- `notes` (text)
- `logged_by` (uuid, FK -> auth.users, nullable) — who recorded it (caregiver)
- `created_at` (timestamptz)

### refill_logs
- `id` (uuid, PK)
- `medication_id` (uuid, FK -> medications)
- `user_id` (uuid, FK -> auth.users)
- `refilled_at` (timestamptz)
- `quantity` (int) — pills added
- `new_total` (int) — stock after refill
- `notes` (text)
- `created_at` (timestamptz)

### prescriptions
- `id` (uuid, PK)
- `user_id` (uuid, FK -> auth.users)
- `medication_name` (text)
- `extracted_text` (text) — raw OCR text
- `doctor` (text)
- `date` (date)
- `image_url` (text) — stored in Supabase Storage
- `status` (text) — 'pending' | 'processed'
- `created_at` (timestamptz)

### notifications
- `id` (uuid, PK)
- `user_id` (uuid, FK -> auth.users)
- `type` (text) — 'reminder' | 'refill' | 'missed' | 'caregiver' | 'system'
- `title` (text)
- `message` (text)
- `medication_id` (uuid, nullable)
- `read` (boolean, default false)
- `created_at` (timestamptz)

## 2. Security (RLS)
- Enable RLS on all tables.
- medicines_db: readable by all authenticated users (reference data).
- profiles: owner can CRUD their own profile; caregivers can read profiles of patients they monitor.
- medications, schedules, dose_logs, refill_logs, prescriptions: owner CRUD; caregivers with accepted relation can SELECT and (for dose_logs) INSERT/UPDATE.
- caregiver_relations: caregiver can create/read their relations; patient can read/update incoming requests.
- notifications: owner CRUD only.

## 3. Indexes
- Indexes on user_id foreign keys and frequently-queried date/status columns.

## 4. Important Notes
1. This app uses Supabase email/password auth. Owner columns default to auth.uid() so client inserts that omit user_id still satisfy WITH CHECK policies.
2. medicines_db is seeded with ~40 common medicines in a follow-up migration so the "is this a valid medicine?" check works out of the box.
3. A trigger auto-creates a profile row when a new auth.users row is inserted.
*/

-- ============================================================
-- medicines_db — reference database of real medicines (created first, no deps)
-- ============================================================
CREATE TABLE IF NOT EXISTS medicines_db (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text UNIQUE NOT NULL,
  generic_name text,
  category text,
  form text,
  common_dosages text[] DEFAULT '{}',
  side_effects text[] DEFAULT '{}',
  controlled boolean NOT NULL DEFAULT false,
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE medicines_db ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read_medicines_db" ON medicines_db;
CREATE POLICY "read_medicines_db"
ON medicines_db FOR SELECT
TO authenticated USING (true);

-- ============================================================
-- caregiver_relations (created before profiles, which references it in policy)
-- ============================================================
CREATE TABLE IF NOT EXISTS caregiver_relations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  caregiver_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  patient_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  relation text DEFAULT 'Caregiver',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','declined')),
  can_log_doses boolean NOT NULL DEFAULT true,
  can_refill boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(caregiver_id, patient_id)
);
ALTER TABLE caregiver_relations ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_caregiver_relations_caregiver ON caregiver_relations(caregiver_id);
CREATE INDEX IF NOT EXISTS idx_caregiver_relations_patient ON caregiver_relations(patient_id);

DROP POLICY IF EXISTS "select_caregiver_relations" ON caregiver_relations;
CREATE POLICY "select_caregiver_relations"
ON caregiver_relations FOR SELECT TO authenticated
USING (auth.uid() = caregiver_id OR auth.uid() = patient_id);

DROP POLICY IF EXISTS "insert_caregiver_relations" ON caregiver_relations;
CREATE POLICY "insert_caregiver_relations"
ON caregiver_relations FOR INSERT TO authenticated
WITH CHECK (auth.uid() = caregiver_id);

DROP POLICY IF EXISTS "update_caregiver_relations" ON caregiver_relations;
CREATE POLICY "update_caregiver_relations"
ON caregiver_relations FOR UPDATE TO authenticated
USING (auth.uid() = caregiver_id OR auth.uid() = patient_id)
WITH CHECK (auth.uid() = caregiver_id OR auth.uid() = patient_id);

DROP POLICY IF EXISTS "delete_caregiver_relations" ON caregiver_relations;
CREATE POLICY "delete_caregiver_relations"
ON caregiver_relations FOR DELETE TO authenticated
USING (auth.uid() = caregiver_id OR auth.uid() = patient_id);

-- ============================================================
-- profiles
-- ============================================================
CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text NOT NULL DEFAULT '',
  email text UNIQUE,
  role text NOT NULL DEFAULT 'patient' CHECK (role IN ('patient','caregiver')),
  phone text,
  date_of_birth date,
  emergency_contact text,
  avatar_url text,
  timezone text NOT NULL DEFAULT 'UTC',
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_profile" ON profiles;
CREATE POLICY "select_own_profile"
ON profiles FOR SELECT TO authenticated
USING (auth.uid() = id);

DROP POLICY IF EXISTS "insert_own_profile" ON profiles;
CREATE POLICY "insert_own_profile"
ON profiles FOR INSERT TO authenticated
WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "update_own_profile" ON profiles;
CREATE POLICY "update_own_profile"
ON profiles FOR UPDATE TO authenticated
USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "caregiver_read_patient_profile" ON profiles;
CREATE POLICY "caregiver_read_patient_profile"
ON profiles FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM caregiver_relations
    WHERE caregiver_relations.caregiver_id = auth.uid()
      AND caregiver_relations.patient_id = profiles.id
      AND caregiver_relations.status = 'accepted'
  )
);

-- ============================================================
-- medications
-- ============================================================
CREATE TABLE IF NOT EXISTS medications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  medicine_db_id uuid REFERENCES medicines_db(id) ON DELETE SET NULL,
  name text NOT NULL,
  generic_name text,
  dosage text,
  form text,
  instructions text,
  color text DEFAULT 'emerald',
  stock_quantity integer NOT NULL DEFAULT 0,
  initial_stock integer NOT NULL DEFAULT 0,
  refill_threshold integer NOT NULL DEFAULT 10,
  refill_date date,
  prescription_date date,
  prescribing_doctor text,
  condition text,
  start_date date DEFAULT CURRENT_DATE,
  end_date date,
  active boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE medications ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_medications_user_id ON medications(user_id);
CREATE INDEX IF NOT EXISTS idx_medications_active ON medications(active);

DROP POLICY IF EXISTS "select_own_medications" ON medications;
CREATE POLICY "select_own_medications"
ON medications FOR SELECT TO authenticated
USING (
  auth.uid() = user_id
  OR EXISTS (
    SELECT 1 FROM caregiver_relations
    WHERE caregiver_relations.caregiver_id = auth.uid()
      AND caregiver_relations.patient_id = medications.user_id
      AND caregiver_relations.status = 'accepted'
  )
);

DROP POLICY IF EXISTS "insert_own_medications" ON medications;
CREATE POLICY "insert_own_medications"
ON medications FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_medications" ON medications;
CREATE POLICY "update_own_medications"
ON medications FOR UPDATE TO authenticated
USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_medications" ON medications;
CREATE POLICY "delete_own_medications"
ON medications FOR DELETE TO authenticated
USING (auth.uid() = user_id);

-- ============================================================
-- schedules
-- ============================================================
CREATE TABLE IF NOT EXISTS schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  medication_id uuid NOT NULL REFERENCES medications(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  times text[] NOT NULL DEFAULT '{}',
  frequency text NOT NULL DEFAULT 'daily',
  days_of_week int[] DEFAULT '{}',
  with_food boolean DEFAULT false,
  dose_amount text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE schedules ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_schedules_user_id ON schedules(user_id);
CREATE INDEX IF NOT EXISTS idx_schedules_medication_id ON schedules(medication_id);

DROP POLICY IF EXISTS "select_own_schedules" ON schedules;
CREATE POLICY "select_own_schedules"
ON schedules FOR SELECT TO authenticated
USING (
  auth.uid() = user_id
  OR EXISTS (
    SELECT 1 FROM caregiver_relations
    WHERE caregiver_relations.caregiver_id = auth.uid()
      AND caregiver_relations.patient_id = schedules.user_id
      AND caregiver_relations.status = 'accepted'
  )
);

DROP POLICY IF EXISTS "insert_own_schedules" ON schedules;
CREATE POLICY "insert_own_schedules"
ON schedules FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_schedules" ON schedules;
CREATE POLICY "update_own_schedules"
ON schedules FOR UPDATE TO authenticated
USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_schedules" ON schedules;
CREATE POLICY "delete_own_schedules"
ON schedules FOR DELETE TO authenticated
USING (auth.uid() = user_id);

-- ============================================================
-- dose_logs
-- ============================================================
CREATE TABLE IF NOT EXISTS dose_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  medication_id uuid NOT NULL REFERENCES medications(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  scheduled_time timestamptz NOT NULL,
  taken_time timestamptz,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('taken','missed','skipped','pending')),
  dose_amount text,
  notes text,
  logged_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE dose_logs ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_dose_logs_user_id ON dose_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_dose_logs_medication_id ON dose_logs(medication_id);
CREATE INDEX IF NOT EXISTS idx_dose_logs_scheduled_time ON dose_logs(scheduled_time);
CREATE INDEX IF NOT EXISTS idx_dose_logs_status ON dose_logs(status);

DROP POLICY IF EXISTS "select_own_dose_logs" ON dose_logs;
CREATE POLICY "select_own_dose_logs"
ON dose_logs FOR SELECT TO authenticated
USING (
  auth.uid() = user_id
  OR EXISTS (
    SELECT 1 FROM caregiver_relations
    WHERE caregiver_relations.caregiver_id = auth.uid()
      AND caregiver_relations.patient_id = dose_logs.user_id
      AND caregiver_relations.status = 'accepted'
  )
);

DROP POLICY IF EXISTS "insert_own_dose_logs" ON dose_logs;
CREATE POLICY "insert_own_dose_logs"
ON dose_logs FOR INSERT TO authenticated
WITH CHECK (
  auth.uid() = user_id
  OR EXISTS (
    SELECT 1 FROM caregiver_relations
    WHERE caregiver_relations.caregiver_id = auth.uid()
      AND caregiver_relations.patient_id = dose_logs.user_id
      AND caregiver_relations.status = 'accepted'
      AND caregiver_relations.can_log_doses = true
  )
);

DROP POLICY IF EXISTS "update_own_dose_logs" ON dose_logs;
CREATE POLICY "update_own_dose_logs"
ON dose_logs FOR UPDATE TO authenticated
USING (
  auth.uid() = user_id
  OR EXISTS (
    SELECT 1 FROM caregiver_relations
    WHERE caregiver_relations.caregiver_id = auth.uid()
      AND caregiver_relations.patient_id = dose_logs.user_id
      AND caregiver_relations.status = 'accepted'
      AND caregiver_relations.can_log_doses = true
  )
) WITH CHECK (
  auth.uid() = user_id
  OR EXISTS (
    SELECT 1 FROM caregiver_relations
    WHERE caregiver_relations.caregiver_id = auth.uid()
      AND caregiver_relations.patient_id = dose_logs.user_id
      AND caregiver_relations.status = 'accepted'
      AND caregiver_relations.can_log_doses = true
  )
);

DROP POLICY IF EXISTS "delete_own_dose_logs" ON dose_logs;
CREATE POLICY "delete_own_dose_logs"
ON dose_logs FOR DELETE TO authenticated
USING (auth.uid() = user_id);

-- ============================================================
-- refill_logs
-- ============================================================
CREATE TABLE IF NOT EXISTS refill_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  medication_id uuid NOT NULL REFERENCES medications(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  refilled_at timestamptz NOT NULL DEFAULT now(),
  quantity integer NOT NULL,
  new_total integer NOT NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE refill_logs ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_refill_logs_user_id ON refill_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_refill_logs_medication_id ON refill_logs(medication_id);

DROP POLICY IF EXISTS "select_own_refill_logs" ON refill_logs;
CREATE POLICY "select_own_refill_logs"
ON refill_logs FOR SELECT TO authenticated
USING (
  auth.uid() = user_id
  OR EXISTS (
    SELECT 1 FROM caregiver_relations
    WHERE caregiver_relations.caregiver_id = auth.uid()
      AND caregiver_relations.patient_id = refill_logs.user_id
      AND caregiver_relations.status = 'accepted'
  )
);

DROP POLICY IF EXISTS "insert_own_refill_logs" ON refill_logs;
CREATE POLICY "insert_own_refill_logs"
ON refill_logs FOR INSERT TO authenticated
WITH CHECK (
  auth.uid() = user_id
  OR EXISTS (
    SELECT 1 FROM caregiver_relations
    WHERE caregiver_relations.caregiver_id = auth.uid()
      AND caregiver_relations.patient_id = refill_logs.user_id
      AND caregiver_relations.status = 'accepted'
      AND caregiver_relations.can_refill = true
  )
);

DROP POLICY IF EXISTS "update_own_refill_logs" ON refill_logs;
CREATE POLICY "update_own_refill_logs"
ON refill_logs FOR UPDATE TO authenticated
USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_refill_logs" ON refill_logs;
CREATE POLICY "delete_own_refill_logs"
ON refill_logs FOR DELETE TO authenticated
USING (auth.uid() = user_id);

-- ============================================================
-- prescriptions
-- ============================================================
CREATE TABLE IF NOT EXISTS prescriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  medication_name text,
  extracted_text text,
  doctor text,
  date date,
  image_url text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processed')),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE prescriptions ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_prescriptions_user_id ON prescriptions(user_id);

DROP POLICY IF EXISTS "select_own_prescriptions" ON prescriptions;
CREATE POLICY "select_own_prescriptions"
ON prescriptions FOR SELECT TO authenticated
USING (
  auth.uid() = user_id
  OR EXISTS (
    SELECT 1 FROM caregiver_relations
    WHERE caregiver_relations.caregiver_id = auth.uid()
      AND caregiver_relations.patient_id = prescriptions.user_id
      AND caregiver_relations.status = 'accepted'
  )
);

DROP POLICY IF EXISTS "insert_own_prescriptions" ON prescriptions;
CREATE POLICY "insert_own_prescriptions"
ON prescriptions FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_prescriptions" ON prescriptions;
CREATE POLICY "update_own_prescriptions"
ON prescriptions FOR UPDATE TO authenticated
USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_prescriptions" ON prescriptions;
CREATE POLICY "delete_own_prescriptions"
ON prescriptions FOR DELETE TO authenticated
USING (auth.uid() = user_id);

-- ============================================================
-- notifications
-- ============================================================
CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  type text NOT NULL DEFAULT 'system' CHECK (type IN ('reminder','refill','missed','caregiver','system')),
  title text NOT NULL,
  message text,
  medication_id uuid,
  read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(read);

DROP POLICY IF EXISTS "select_own_notifications" ON notifications;
CREATE POLICY "select_own_notifications"
ON notifications FOR SELECT TO authenticated
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_notifications" ON notifications;
CREATE POLICY "insert_own_notifications"
ON notifications FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_notifications" ON notifications;
CREATE POLICY "update_own_notifications"
ON notifications FOR UPDATE TO authenticated
USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_notifications" ON notifications;
CREATE POLICY "delete_own_notifications"
ON notifications FOR DELETE TO authenticated
USING (auth.uid() = user_id);

-- ============================================================
-- Auto-create profile on signup
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', ''))
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
