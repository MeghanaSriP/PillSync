import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

export type Profile = {
  id: string;
  full_name: string;
  email: string | null;
  role: 'patient' | 'caregiver';
  phone: string | null;
  date_of_birth: string | null;
  emergency_contact: string | null;
  avatar_url: string | null;
  timezone: string;
  created_at: string;
};

export type MedicineDb = {
  id: string;
  name: string;
  generic_name: string | null;
  category: string | null;
  form: string | null;
  common_dosages: string[];
  side_effects: string[];
  controlled: boolean;
  description: string | null;
  created_at: string;
};

export type Medication = {
  id: string;
  user_id: string;
  medicine_db_id: string | null;
  name: string;
  generic_name: string | null;
  dosage: string | null;
  form: string | null;
  instructions: string | null;
  color: string;
  stock_quantity: number;
  initial_stock: number;
  refill_threshold: number;
  refill_date: string | null;
  prescription_date: string | null;
  prescribing_doctor: string | null;
  condition: string | null;
  start_date: string;
  end_date: string | null;
  active: boolean;
  notes: string | null;
  created_at: string;
  medicine_db?: MedicineDb | null;
};

export type Schedule = {
  id: string;
  medication_id: string;
  user_id: string;
  times: string[];
  frequency: string;
  days_of_week: number[];
  with_food: boolean;
  dose_amount: string | null;
  created_at: string;
  medication?: Medication;
};

export type DoseStatus = 'taken' | 'missed' | 'skipped' | 'pending';

export type DoseLog = {
  id: string;
  medication_id: string;
  user_id: string;
  scheduled_time: string;
  taken_time: string | null;
  status: DoseStatus;
  dose_amount: string | null;
  notes: string | null;
  logged_by: string | null;
  created_at: string;
  medication?: Medication;
};

export type RefillLog = {
  id: string;
  medication_id: string;
  user_id: string;
  refilled_at: string;
  quantity: number;
  new_total: number;
  notes: string | null;
  created_at: string;
  medication?: Medication;
};

export type Prescription = {
  id: string;
  user_id: string;
  medication_name: string | null;
  extracted_text: string | null;
  doctor: string | null;
  date: string | null;
  image_url: string | null;
  status: 'pending' | 'processed';
  created_at: string;
};

export type CaregiverRelation = {
  id: string;
  caregiver_id: string;
  patient_id: string;
  relation: string;
  status: 'pending' | 'accepted' | 'declined';
  can_log_doses: boolean;
  can_refill: boolean;
  created_at: string;
  patient?: Profile;
  caregiver?: Profile;
};

export type NotificationType = 'reminder' | 'refill' | 'missed' | 'caregiver' | 'system';

export type AppNotification = {
  id: string;
  user_id: string;
  type: NotificationType;
  title: string;
  message: string | null;
  medication_id: string | null;
  read: boolean;
  created_at: string;
};

export type ReminderSettings = {
  id: string;
  user_id: string;
  email_reminders_enabled: boolean;
  per_dose_reminders: boolean;
  reminder_offset_minutes: number;
  daily_summary_enabled: boolean;
  daily_summary_time: string;
  notify_caregivers: boolean;
  created_at: string;
  updated_at: string;
};

export type EmailReminderLog = {
  id: string;
  user_id: string;
  medication_id: string | null;
  reminder_type: "per_dose" | "daily_summary";
  dose_date: string;
  dose_time: string | null;
  recipient_email: string;
  sent_at: string;
  created_at: string;
};
