import { useState, useEffect, useCallback } from 'react';
import { Settings as SettingsIcon, User, Heart, Phone, Calendar, Save, LogOut, Shield, Mail, BellRing, Clock, CalendarDays, Users } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase, ReminderSettings } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { Card, CardBody } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/FormField';
import { Badge } from '@/components/ui/Badge';
import { Alert } from '@/components/ui/Alert';
import { Spinner } from '@/components/ui/Spinner';
import { TimeInput } from '@/components/ui/TimeInput';

const TIMEZONES = ['UTC', 'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles', 'Europe/London', 'Europe/Paris', 'Asia/Tokyo', 'Asia/Kolkata', 'Australia/Sydney'];

const OFFSET_OPTIONS = [
  { value: 0, label: 'At the scheduled time' },
  { value: 5, label: '5 minutes before' },
  { value: 10, label: '10 minutes before' },
  { value: 15, label: '15 minutes before' },
  { value: 30, label: '30 minutes before' },
  { value: 60, label: '1 hour before' },
];

type ToggleProps = { checked: boolean; onChange: (v: boolean) => void; label: string; description?: string; icon?: React.ReactNode };

function ToggleRow({ checked, onChange, label, description, icon }: ToggleProps) {
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <div className="flex items-start gap-3 min-w-0">
        {icon && <div className="mt-0.5 text-teal-600 flex-shrink-0">{icon}</div>}
        <div className="min-w-0">
          <p className="text-sm font-medium text-slate-800">{label}</p>
          {description && <p className="text-xs text-slate-500 mt-0.5">{description}</p>}
        </div>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors ${checked ? 'bg-teal-600' : 'bg-slate-200'}`}
      >
        <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-5' : 'translate-x-0.5'}`} />
      </button>
    </div>
  );
}

export function SettingsPage() {
  const { profile, user, session, refreshProfile, signOut } = useAuth();
  const navigate = useNavigate();
  const [fullName, setFullName] = useState(profile?.full_name || '');
  const [phone, setPhone] = useState(profile?.phone || '');
  const [dob, setDob] = useState(profile?.date_of_birth || '');
  const [emergency, setEmergency] = useState(profile?.emergency_contact || '');
  const [timezone, setTimezone] = useState(profile?.timezone || 'UTC');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reminder settings state
  const [reminder, setReminder] = useState<ReminderSettings | null>(null);
  const [reminderLoading, setReminderLoading] = useState(true);
  const [reminderSaving, setReminderSaving] = useState(false);
  const [reminderSaved, setReminderSaved] = useState(false);
  const [reminderError, setReminderError] = useState<string | null>(null);

  // Test email states
  const [testLoading, setTestLoading] = useState(false);
  const [testSummaryLoading, setTestSummaryLoading] = useState(false);
  const [testSuccess, setTestSuccess] = useState<string | null>(null);
  const [testError, setTestError] = useState<string | null>(null);

  const getHeaders = () => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (session?.access_token) {
      headers['Authorization'] = `Bearer ${session.access_token}`;
    }
    return headers;
  };

  const sendTestEmail = async () => {
    if (!profile?.email) return;
    setTestLoading(true);
    setTestError(null);
    setTestSuccess(null);

    try {
      const response = await fetch('http://localhost:3002/api/send-test-email', {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({
          email: profile.email,
          name: profile.full_name,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        setTestError(data.error || 'Failed to send test email.');
      } else {
        setTestSuccess('Test email sent successfully! Please check your inbox.');
        setTimeout(() => setTestSuccess(null), 5000);
      }
    } catch (err: any) {
      setTestError(err.message || 'An error occurred connecting to the local email service.');
    } finally {
      setTestLoading(false);
    }
  };

  const sendTestSummary = async () => {
    if (!profile?.email) return;
    setTestSummaryLoading(true);
    setTestError(null);
    setTestSuccess(null);

    try {
      const response = await fetch('http://localhost:3002/api/send-test-summary', {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({
          email: profile.email,
          name: profile.full_name,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        setTestError(data.error || 'Failed to send test summary email.');
      } else {
        setTestSuccess('Test daily summary email sent successfully! Please check your inbox.');
        setTimeout(() => setTestSuccess(null), 5000);
      }
    } catch (err: any) {
      setTestError(err.message || 'An error occurred connecting to the local email service.');
    } finally {
      setTestSummaryLoading(false);
    }
  };

  const loadReminder = useCallback(async () => {
    if (!user) return;
    setReminderLoading(true);
    const { data, error: err } = await supabase
      .from('reminder_settings')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();
    if (err) setReminderError(err.message);
    setReminder((data as ReminderSettings) || null);
    setReminderLoading(false);
  }, [user]);

  useEffect(() => { loadReminder(); }, [loadReminder]);

  const r = reminder;
  const rEnabled = r?.email_reminders_enabled ?? false;
  const rPerDose = r?.per_dose_reminders ?? true;
  const rOffset = r?.reminder_offset_minutes ?? 15;
  const rSummary = r?.daily_summary_enabled ?? false;
  const rSummaryTime = r?.daily_summary_time ?? '08:00';
  const rNotifyCg = r?.notify_caregivers ?? false;

  const updateReminder = (patch: Partial<ReminderSettings>) => {
    setReminder((prev) => ({ ...(prev || defaultReminder(user!.id)), ...prev, ...patch } as ReminderSettings));
  };

  const saveReminder = async () => {
    if (!user || !reminder) return;
    setReminderSaving(true);
    setReminderError(null);
    setReminderSaved(false);
    const payload = {
      user_id: user.id,
      email_reminders_enabled: reminder.email_reminders_enabled,
      per_dose_reminders: reminder.per_dose_reminders,
      reminder_offset_minutes: reminder.reminder_offset_minutes,
      daily_summary_enabled: reminder.daily_summary_enabled,
      daily_summary_time: reminder.daily_summary_time,
      notify_caregivers: reminder.notify_caregivers,
    };
    const { error: err } = await supabase.from('reminder_settings').upsert(payload, { onConflict: 'user_id' });
    if (err) setReminderError(err.message);
    else {
      setReminderSaved(true);
      setTimeout(() => setReminderSaved(false), 3000);
      await loadReminder();
      // Register token & trigger manual scheduler pass
      if (session?.access_token) {
        fetch('http://localhost:3002/api/trigger-scheduler', {
          method: 'POST',
          headers: getHeaders(),
        }).catch(() => {});
      }
    }
    setReminderSaving(false);
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSaved(false);
    const { error: err } = await supabase
      .from('profiles')
      .update({
        full_name: fullName, phone, date_of_birth: dob || null,
        emergency_contact: emergency, timezone,
      })
      .eq('id', user!.id);
    if (err) setError(err.message);
    else { setSaved(true); await refreshProfile(); setTimeout(() => setSaved(false), 3000); }
    setSaving(false);
  };

  const handleSignOut = async () => {
    await signOut();
    navigate('/');
  };

  if (!profile) {
    return <div className="flex justify-center py-20"><Spinner className="w-8 h-8 text-teal-600" /></div>;
  }

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Settings</h1>
        <p className="text-sm text-slate-500 mt-0.5">Manage your profile and preferences</p>
      </div>

      {/* Profile */}
      <Card>
        <CardBody>
          <div className="flex items-center gap-2 mb-5">
            <User className="w-5 h-5 text-teal-600" />
            <h3 className="font-semibold text-slate-900">Profile</h3>
          </div>

          <div className="flex items-center gap-4 mb-6">
            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-teal-400 to-cyan-500 flex items-center justify-center text-white text-xl font-semibold">
              {fullName.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase() || 'U'}
            </div>
            <div>
              <p className="font-medium text-slate-800">{fullName || 'Your name'}</p>
              <p className="text-sm text-slate-500">{profile.email}</p>
              <Badge color={profile.role === 'caregiver' ? 'violet' : 'teal'} className="mt-1 capitalize">{profile.role}</Badge>
            </div>
          </div>

          {error && <div className="mb-4"><Alert tone="error">{error}</Alert></div>}
          {saved && <div className="mb-4"><Alert tone="success">Profile updated successfully</Alert></div>}

          <div className="space-y-4">
            <Input label="Full name" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Jane Doe" />
            <Input label="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+1 555 000 0000" />
            <div className="grid sm:grid-cols-2 gap-4">
              <Input label="Date of birth" type="date" value={dob} onChange={(e) => setDob(e.target.value)} />
              <Select label="Timezone" value={timezone} onChange={(e) => setTimezone(e.target.value)}>
                {TIMEZONES.map((tz) => <option key={tz}>{tz}</option>)}
              </Select>
            </div>
            <Input label="Emergency contact" value={emergency} onChange={(e) => setEmergency(e.target.value)} placeholder="Name & phone of emergency contact" />
          </div>

          <div className="flex justify-end mt-5 pt-4 border-t border-slate-100">
            <Button loading={saving} onClick={handleSave}><Save className="w-4 h-4" /> Save changes</Button>
          </div>
        </CardBody>
      </Card>

      {/* Email Reminders */}
      <Card>
        <CardBody>
          <div className="flex items-center gap-2 mb-1">
            <Mail className="w-5 h-5 text-teal-600" />
            <h3 className="font-semibold text-slate-900">Email reminders</h3>
          </div>
          <p className="text-sm text-slate-500 mb-4">Send medication reminder emails to <span className="font-medium text-slate-700">{profile.email}</span></p>

          {reminderError && <div className="mb-4"><Alert tone="error">{reminderError}</Alert></div>}
          {reminderSaved && <div className="mb-4"><Alert tone="success">Reminder preferences saved</Alert></div>}
          {testError && <div className="mb-4"><Alert tone="error">{testError}</Alert></div>}
          {testSuccess && <div className="mb-4"><Alert tone="success">{testSuccess}</Alert></div>}

          {reminderLoading ? (
            <div className="flex justify-center py-6"><Spinner className="w-6 h-6 text-teal-600" /></div>
          ) : (
            <>
              <ToggleRow
                checked={rEnabled}
                onChange={(v) => updateReminder({ email_reminders_enabled: v })}
                label="Enable email reminders"
                description="Turn on reminder emails for your medication schedule."
                icon={<BellRing className="w-4 h-4" />}
              />

              <div className={`transition-opacity ${rEnabled ? 'opacity-100' : 'opacity-50 pointer-events-none'}`}>
                <div className="divide-y divide-slate-100 border-t border-slate-100">
                  <ToggleRow
                    checked={rPerDose}
                    onChange={(v) => updateReminder({ per_dose_reminders: v })}
                    label="Per-dose reminders"
                    description="Get an email before each scheduled dose."
                    icon={<Clock className="w-4 h-4" />}
                  />
                  <div className="py-3">
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">Send reminder</label>
                    <Select
                      value={String(rOffset)}
                      onChange={(e) => updateReminder({ reminder_offset_minutes: Number(e.target.value) })}
                    >
                      {OFFSET_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </Select>
                  </div>

                  <ToggleRow
                    checked={rSummary}
                    onChange={(v) => updateReminder({ daily_summary_enabled: v })}
                    label="Daily summary email"
                    description="Receive one email each morning listing all your doses for the day."
                    icon={<CalendarDays className="w-4 h-4" />}
                  />
                  <div className="py-3">
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">Summary time</label>
                    <TimeInput
                      value={rSummaryTime.slice(0, 5)}
                      onChange={(v) => updateReminder({ daily_summary_time: v })}
                    />
                  </div>

                  {profile.role === 'patient' && (
                    <ToggleRow
                      checked={rNotifyCg}
                      onChange={(v) => updateReminder({ notify_caregivers: v })}
                      label="Also notify my caregivers"
                      description="Accepted caregivers receive the same per-dose reminders about your medications."
                      icon={<Users className="w-4 h-4" />}
                    />
                  )}
                </div>
              </div>

              <div className="flex flex-col sm:flex-row justify-between items-center gap-3 mt-5 pt-4 border-t border-slate-100">
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    loading={testLoading}
                    onClick={sendTestEmail}
                    disabled={!reminder}
                  >
                    Send Test Email
                  </Button>
                  <Button
                    variant="outline"
                    loading={testSummaryLoading}
                    onClick={sendTestSummary}
                    disabled={!reminder}
                  >
                    Send Test Summary
                  </Button>
                </div>
                <Button loading={reminderSaving} onClick={saveReminder} disabled={!reminder}>
                  <Save className="w-4 h-4" /> Save reminder preferences
                </Button>
              </div>
            </>
          )}
        </CardBody>
      </Card>

      {/* Account info */}
      <Card>
        <CardBody>
          <div className="flex items-center gap-2 mb-4">
            <Shield className="w-5 h-5 text-slate-500" />
            <h3 className="font-semibold text-slate-900">Account</h3>
          </div>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between"><span className="text-slate-500">Email</span><span className="text-slate-800">{profile.email}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">Role</span><span className="text-slate-800 capitalize">{profile.role}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">Member since</span><span className="text-slate-800">{new Date(profile.created_at).toLocaleDateString()}</span></div>
          </div>
        </CardBody>
      </Card>

      {/* Danger zone */}
      <Card className="border-rose-200">
        <CardBody>
          <h3 className="font-semibold text-slate-900 mb-2">Sign out</h3>
          <p className="text-sm text-slate-500 mb-4">You'll need to sign in again to access your medications.</p>
          <Button variant="danger" onClick={handleSignOut}><LogOut className="w-4 h-4" /> Sign out</Button>
        </CardBody>
      </Card>

      <p className="text-center text-xs text-slate-400">
        PillSync is a medication tracking tool and does not replace professional medical advice.
      </p>
    </div>
  );
}

function defaultReminder(userId: string): ReminderSettings {
  return {
    id: '',
    user_id: userId,
    email_reminders_enabled: false,
    per_dose_reminders: true,
    reminder_offset_minutes: 15,
    daily_summary_enabled: false,
    daily_summary_time: '08:00',
    notify_caregivers: false,
    created_at: '',
    updated_at: '',
  };
}
