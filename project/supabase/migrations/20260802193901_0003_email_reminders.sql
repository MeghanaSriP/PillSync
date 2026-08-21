/*
# Add email reminder preferences and reminder dispatch infrastructure

## Overview
Adds the ability for patients and caregivers to receive medication reminder
emails at times they choose. A server function (edge function) runs every
minute via pg_cron + pg_net, determines whose reminders are due based on each
user's timezone and medication schedule, and sends emails through Resend.

## 1. New Tables

### reminder_settings
Per-user email reminder preferences. One row per user (patient or caregiver).
- `id` (uuid, PK)
- `user_id` (uuid, FK -> auth.users, unique) — whose preferences these are
- `email_reminders_enabled` (boolean, default false) — master toggle
- `per_dose_reminders` (boolean, default true) — send an email before each scheduled dose
- `reminder_offset_minutes` (integer, default 15) — minutes before dose time to send the email
- `daily_summary_enabled` (boolean, default false) — send a once-daily summary email
- `daily_summary_time` (time, default '08:00') — time of day for the daily summary
- `notify_caregivers` (boolean, default false) — also email accepted caregivers (patients only)
- `created_at`, `updated_at` (timestamptz)

### email_reminders
Deduplication log of sent reminder emails. The edge function inserts a row
each time it sends a reminder so the same dose is never emailed twice.
- `id` (uuid, PK)
- `user_id` (uuid, FK -> auth.users) — recipient
- `medication_id` (uuid, FK -> medications, nullable for daily_summary) — which medication
- `reminder_type` (text) — 'per_dose' | 'daily_summary'
- `dose_date` (date) — the date the dose is on (in recipient's timezone)
- `dose_time` (text, nullable) — HH:MM of the dose (null for daily_summary)
- `recipient_email` (text) — email address sent to
- `sent_at` (timestamptz)
- `created_at` (timestamptz)
- Unique constraint on (user_id, medication_id, dose_date, dose_time, reminder_type)

## 2. Extensions
- pg_cron — schedules the per-minute dispatch job
- pg_net — lets the dispatch function call the edge function via HTTP POST

## 3. Security (RLS)
- reminder_settings: owner can CRUD their own row only.
- email_reminders: owner can SELECT/INSERT/UPDATE/DELETE their own rows.
  The edge function uses the service role key (bypasses RLS) for inserts.

## 4. Scheduled Job
- pg_cron job `email-reminder-dispatcher` runs every minute and calls
  `public.dispatch_email_reminders()`, which pings the `send-reminder-email`
  edge function via pg_net. The edge function determines whose reminders are
  due (based on timezone + schedule + offset), sends emails via Resend, and
  logs them in email_reminders.

## 5. Important Notes
1. The edge function `send-reminder-email` is deployed separately via the
   Supabase MCP deploy tool.
2. A Resend API key (`RESEND_API_KEY`) must be configured as an edge function
   secret for emails to actually send. Without it the edge function logs a
   warning and skips sending.
3. Both patients and caregivers can configure their own reminder_settings.
   Caregivers receive reminders about their accepted patients' medications.
4. The pg_cron job runs every minute in UTC; timezone logic is handled in the
   edge function using each user's profile.timezone.
*/

-- ============================================================
-- Extensions
-- ============================================================
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- ============================================================
-- reminder_settings
-- ============================================================
CREATE TABLE IF NOT EXISTS reminder_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  email_reminders_enabled boolean NOT NULL DEFAULT false,
  per_dose_reminders boolean NOT NULL DEFAULT true,
  reminder_offset_minutes integer NOT NULL DEFAULT 15 CHECK (reminder_offset_minutes >= 0 AND reminder_offset_minutes <= 180),
  daily_summary_enabled boolean NOT NULL DEFAULT false,
  daily_summary_time time NOT NULL DEFAULT '08:00',
  notify_caregivers boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE reminder_settings ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_reminder_settings_user_id ON reminder_settings(user_id);
CREATE INDEX IF NOT EXISTS idx_reminder_settings_enabled ON reminder_settings(email_reminders_enabled);

DROP POLICY IF EXISTS "select_own_reminder_settings" ON reminder_settings;
CREATE POLICY "select_own_reminder_settings"
ON reminder_settings FOR SELECT TO authenticated
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_reminder_settings" ON reminder_settings;
CREATE POLICY "insert_own_reminder_settings"
ON reminder_settings FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_reminder_settings" ON reminder_settings;
CREATE POLICY "update_own_reminder_settings"
ON reminder_settings FOR UPDATE TO authenticated
USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_reminder_settings" ON reminder_settings;
CREATE POLICY "delete_own_reminder_settings"
ON reminder_settings FOR DELETE TO authenticated
USING (auth.uid() = user_id);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_reminder_settings_updated_at ON reminder_settings;
CREATE TRIGGER trg_reminder_settings_updated_at
  BEFORE UPDATE ON reminder_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- email_reminders (dedup log)
-- ============================================================
CREATE TABLE IF NOT EXISTS email_reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  medication_id uuid REFERENCES medications(id) ON DELETE CASCADE,
  reminder_type text NOT NULL CHECK (reminder_type IN ('per_dose','daily_summary')),
  dose_date date NOT NULL,
  dose_time text,
  recipient_email text NOT NULL,
  sent_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, medication_id, dose_date, dose_time, reminder_type)
);

ALTER TABLE email_reminders ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_email_reminders_user_id ON email_reminders(user_id);
CREATE INDEX IF NOT EXISTS idx_email_reminders_sent_at ON email_reminders(sent_at);

DROP POLICY IF EXISTS "select_own_email_reminders" ON email_reminders;
CREATE POLICY "select_own_email_reminders"
ON email_reminders FOR SELECT TO authenticated
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_email_reminders" ON email_reminders;
CREATE POLICY "insert_own_email_reminders"
ON email_reminders FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_email_reminders" ON email_reminders;
CREATE POLICY "update_own_email_reminders"
ON email_reminders FOR UPDATE TO authenticated
USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_email_reminders" ON email_reminders;
CREATE POLICY "delete_own_email_reminders"
ON email_reminders FOR DELETE TO authenticated
USING (auth.uid() = user_id);

-- ============================================================
-- Dispatch function — pings the edge function every minute
-- ============================================================
CREATE OR REPLACE FUNCTION public.dispatch_email_reminders()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM net.http_post(
    url := 'https://oymgannohtvteslrvrnd.supabase.co/functions/v1/send-reminder-email',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im95bWdhbm5vaHR2dGVzbHJ2cm5kIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU0Mjk3MTksImV4cCI6MjEwMTAwNTcxOX0.AAodhTdPTynd7rOvyKC85q3DJWtUnNe9uKN6Er20yv8'
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 55000
  );
END;
$$;

-- ============================================================
-- Schedule the cron job (idempotent)
-- ============================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'email-reminder-dispatcher') THEN
    PERFORM cron.unschedule('email-reminder-dispatcher');
  END IF;
END $$;

SELECT cron.schedule('email-reminder-dispatcher', '* * * * *', 'SELECT public.dispatch_email_reminders()');
