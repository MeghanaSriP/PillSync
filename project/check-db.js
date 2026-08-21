import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const envVars = {};
try {
  const envFile = fs.readFileSync('.env', 'utf-8');
  envFile.split('\n').forEach(line => {
    const [key, ...rest] = line.split('=');
    if (key && rest.length > 0) envVars[key.trim()] = rest.join('=').trim();
  });
} catch(e) {}

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || envVars['VITE_SUPABASE_URL'];
const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY || envVars['VITE_SUPABASE_ANON_KEY'];
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || envVars['SUPABASE_SERVICE_ROLE_KEY'] || SUPABASE_KEY;

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

async function check() {
  console.log("--- PROFILES ---");
  const { data: profiles } = await supabase.from('profiles').select('*');
  console.log(profiles);

  console.log("--- REMINDER SETTINGS ---");
  const { data: settings } = await supabase.from('reminder_settings').select('*');
  console.log(settings);

  console.log("--- SCHEDULES ---");
  const { data: schedules } = await supabase.from('schedules').select('*, medication:medications(*)');
  console.log(schedules);

  console.log("--- RECENT EMAIL REMINDERS LOG ---");
  const { data: logs } = await supabase.from('email_reminders').select('*').order('created_at', { ascending: false }).limit(10);
  console.log(logs);
}

check();
