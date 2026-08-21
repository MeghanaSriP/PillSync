import { useEffect, useState, useCallback } from 'react';
import { CalendarClock, Plus, Trash2, Clock, Pill, CheckCircle2, X } from 'lucide-react';
import { supabase, Medication, Schedule, DoseLog } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { usePatientContext } from '@/context/PatientContext';
import { Card, CardBody } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Input, Select, Field } from '@/components/ui/FormField';
import { Modal } from '@/components/ui/Modal';
import { EmptyState } from '@/components/ui/EmptyState';
import { Spinner } from '@/components/ui/Spinner';
import { getPillColor } from '@/lib/theme';
import { fmtTime, fmtDate } from '@/lib/dates';
import { TimeInput } from '@/components/ui/TimeInput';

import { format } from 'date-fns';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function SchedulePage() {
  const { user } = useAuth();
  const { effectiveUserId, canLogDoses, isManagingPatient } = usePatientContext();
  const [loading, setLoading] = useState(true);
  const [medications, setMedications] = useState<Medication[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [doseLogs, setDoseLogs] = useState<DoseLog[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState<Schedule | null>(null);
  const [loggingId, setLoggingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user || !effectiveUserId) return;
    setLoading(true);
    const { data: meds } = await supabase.from('medications').select('*').eq('user_id', effectiveUserId).eq('active', true).order('name');
    const { data: joinedScheds, error: schedErr } = await supabase.from('schedules').select('*, medication(*)').eq('user_id', effectiveUserId);
    let scheds = joinedScheds as Schedule[] | null;
    if (schedErr) {
      const { data: plainScheds } = await supabase.from('schedules').select('*').eq('user_id', effectiveUserId);
      const medMap = new Map((meds as Medication[] || []).map((m) => [m.id, m]));
      scheds = (plainScheds as Schedule[] | null) || [];
      scheds = scheds.map((s) => ({ ...s, medication: medMap.get(s.medication_id) }));
    }
    const { data: joinedLogs, error: logErr } = await supabase.from('dose_logs').select('*, medication(*)').eq('user_id', effectiveUserId).order('scheduled_time', { ascending: false }).limit(300);
    let logs = joinedLogs as DoseLog[] | null;
    if (logErr) {
      const { data: plainLogs } = await supabase.from('dose_logs').select('*').eq('user_id', effectiveUserId).order('scheduled_time', { ascending: false }).limit(300);
      const medMap = new Map((meds as Medication[] || []).map((m) => [m.id, m]));
      logs = ((plainLogs as DoseLog[] | null) || []).map((l) => ({ ...l, medication: medMap.get(l.medication_id) }));
    }
    setMedications((meds as Medication[]) || []);
    setSchedules(scheds || []);
    setDoseLogs(logs || []);
    setLoading(false);
  }, [user, effectiveUserId]);

  useEffect(() => { load(); }, [load]);

  const logDose = async (med: Medication, time: string, date: string, status: 'taken' | 'skipped') => {
    if (!user || !effectiveUserId) return;
    if (isManagingPatient && !canLogDoses) return;
    setLoggingId(`${med.id}-${time}-${date}`);
    const scheduledTime = `${date}T${time}:00`;
    const existing = doseLogs.find((l) => l.medication_id === med.id && l.scheduled_time.startsWith(date) && l.scheduled_time.includes(time));
    if (existing) {
      await supabase.from('dose_logs').update({
        status, taken_time: status === 'taken' ? new Date().toISOString() : null, logged_by: user.id,
      }).eq('id', existing.id);
    } else {
      await supabase.from('dose_logs').insert({
        medication_id: med.id, user_id: effectiveUserId, scheduled_time: scheduledTime,
        taken_time: status === 'taken' ? new Date().toISOString() : null, status, logged_by: user.id,
      });
    }
    if (status === 'taken' && med.stock_quantity > 0) {
      await supabase.from('medications').update({ stock_quantity: Math.max(0, med.stock_quantity - 1) }).eq('id', med.id);
    }
    setLoggingId(null);
    load();
  };

  const deleteSchedule = async (sched: Schedule) => {
    if (!confirm('Remove this schedule?')) return;
    await supabase.from('schedules').delete().eq('id', sched.id);
    load();
  };

  // Build week view
  const today = new Date();
  const weekStart = new Date(today);
  weekStart.setDate(today.getDate() - today.getDay());
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    return d;
  });

  const getScheduledForDay = (dayDow: number) =>
    schedules.filter((s) => s.frequency === 'daily' || (s.frequency === 'specific_days' && s.days_of_week?.includes(dayDow)));

  if (loading) {
    return <div className="flex justify-center py-20"><Spinner className="w-8 h-8 text-teal-600" /></div>;
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Schedule</h1>
          <p className="text-sm text-slate-500 mt-0.5">Your medication schedule for the week</p>
        </div>
        <Button onClick={() => { setEditingSchedule(null); setShowAdd(true); }} disabled={medications.length === 0}>
          <Plus className="w-4 h-4" /> Add schedule
        </Button>
      </div>

      {schedules.length === 0 && medications.length === 0 ? (
        <Card>
          <EmptyState
            icon={<CalendarClock className="w-7 h-7" />}
            title="No schedules yet"
            description="Add a medication first, then create a schedule to set reminder times."
          />
        </Card>
      ) : (
        <>
          {/* Week view */}
          <div className="grid grid-cols-1 md:grid-cols-7 gap-3">
            {weekDays.map((day, dowIdx) => {
              const daySchedules = getScheduledForDay(dowIdx);
              const dateStr = format(day, 'yyyy-MM-dd');
              const isToday = dateStr === format(today, 'yyyy-MM-dd');
              return (
                <Card key={dowIdx} className={isToday ? 'border-teal-300 ring-1 ring-teal-200' : ''}>
                  <CardBody className="!p-3">
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <p className={`text-xs font-medium ${isToday ? 'text-teal-600' : 'text-slate-500'}`}>{DAYS[dowIdx]}</p>
                        <p className={`text-lg font-bold ${isToday ? 'text-teal-700' : 'text-slate-800'}`}>{day.getDate()}</p>
                      </div>
                      {isToday && <Badge color="teal">Today</Badge>}
                    </div>
                    <div className="space-y-2">
                      {daySchedules.length === 0 ? (
                        <p className="text-xs text-slate-300 text-center py-4">No doses</p>
                      ) : (
                        daySchedules.flatMap((s) => s.times.map((time) => {
                          const med = s.medication!;
                          const color = getPillColor(med.color);
                          const log = doseLogs.find((l) => l.medication_id === med.id && l.scheduled_time.startsWith(dateStr) && l.scheduled_time.includes(time));
                          const status = log?.status;
                          return (
                            <div key={`${s.id}-${time}`} className={`rounded-lg p-2 border ${status === 'taken' ? 'border-emerald-100 bg-emerald-50/40' : 'border-slate-200'}`}>
                              <div className="flex items-center gap-1.5 mb-1">
                                <div className={`w-1.5 h-1.5 rounded-full ${color.dot}`} />
                                <span className="text-xs font-medium text-slate-700">{fmtTime(time)}</span>
                                {status === 'taken' && <CheckCircle2 className="w-3 h-3 text-emerald-500 ml-auto" />}
                              </div>
                              <p className="text-xs text-slate-600 truncate">{med.name}</p>
                              {isToday && (!status || status === 'pending') && (
                                <button
                                  onClick={() => logDose(med, time, dateStr, 'taken')}
                                  disabled={loggingId === `${med.id}-${time}-${dateStr}`}
                                  className="mt-1.5 w-full text-[11px] py-1 rounded-md bg-teal-600 text-white hover:bg-teal-700 transition-colors disabled:opacity-50"
                                >
                                  Take
                                </button>
                              )}
                            </div>
                          );
                        }))
                      )}
                    </div>
                  </CardBody>
                </Card>
              );
            })}
          </div>

          {/* All schedules list */}
          <Card>
            <CardBody>
              <h3 className="font-semibold text-slate-900 mb-4">All schedules</h3>
              <div className="space-y-2">
                {schedules.map((s) => {
                  const med = s.medication!;
                  const color = getPillColor(med.color);
                  return (
                    <div key={s.id} className="flex items-center gap-3 p-3 rounded-xl border border-slate-200">
                      <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${color.gradient} flex items-center justify-center text-white flex-shrink-0`}>
                        <Pill className="w-5 h-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-800">{med.name}</p>
                        <div className="flex items-center flex-wrap gap-1.5 mt-1">
                          {s.times.map((t) => <Badge key={t} color="slate">{fmtTime(t)}</Badge>)}
                          {s.frequency === 'specific_days' && s.days_of_week?.map((d) => <Badge key={d} color="blue">{DAYS[d]}</Badge>)}
                          {s.frequency === 'daily' && <Badge color="teal">Daily</Badge>}
                          {s.with_food && <Badge color="amber">With food</Badge>}
                        </div>
                      </div>
                      <Button size="sm" variant="ghost" onClick={() => { setEditingSchedule(s); setShowAdd(true); }}>
                        <Clock className="w-3.5 h-3.5" />
                      </Button>
                      <Button size="sm" variant="ghost" className="text-rose-500 hover:bg-rose-50" onClick={() => deleteSchedule(s)}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  );
                })}
              </div>
            </CardBody>
          </Card>
        </>
      )}

      <ScheduleFormModal
        open={showAdd}
        onClose={() => { setShowAdd(false); setEditingSchedule(null); }}
        editing={editingSchedule}
        medications={medications}
        onSaved={() => { setShowAdd(false); setEditingSchedule(null); load(); }}
      />
    </div>
  );
}

function ScheduleFormModal({
  open, onClose, editing, medications, onSaved,
}: {
  open: boolean; onClose: () => void; editing: Schedule | null; medications: Medication[]; onSaved: () => void;
}) {
  const { user } = useAuth();
  const { effectiveUserId } = usePatientContext();
  const [medicationId, setMedicationId] = useState('');
  const [times, setTimes] = useState<string[]>(['08:00']);
  const [frequency, setFrequency] = useState('daily');
  const [daysOfWeek, setDaysOfWeek] = useState<number[]>([]);
  const [withFood, setWithFood] = useState(false);
  const [doseAmount, setDoseAmount] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      if (editing) {
        setMedicationId(editing.medication_id);
        setTimes(editing.times.length ? editing.times : ['08:00']);
        setFrequency(editing.frequency);
        setDaysOfWeek(editing.days_of_week || []);
        setWithFood(editing.with_food);
        setDoseAmount(editing.dose_amount || '');
      } else {
        setMedicationId(medications[0]?.id || '');
        setTimes(['08:00']); setFrequency('daily'); setDaysOfWeek([]); setWithFood(false);
        setDoseAmount(medications[0]?.dosage || '1 dose');
      }
      setError(null);
    }
  }, [open, editing, medications]);

  const addTime = () => setTimes((t) => [...t, '12:00']);
  const removeTime = (i: number) => setTimes((t) => t.filter((_, idx) => idx !== i));
  const updateTime = (i: number, val: string) => setTimes((t) => t.map((x, idx) => idx === i ? val : x));

  const toggleDay = (d: number) => setDaysOfWeek((prev) => prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]);

  const handleSave = async () => {
    if (!user || !effectiveUserId) return;
    if (!medicationId) { setError('Select a medication'); return; }
    if (times.length === 0) { setError('Add at least one time'); return; }
    setSaving(true);
    setError(null);

    const payload = {
      medication_id: medicationId,
      user_id: effectiveUserId,
      times: times.sort(),
      frequency,
      days_of_week: frequency === 'specific_days' ? daysOfWeek : [],
      with_food: withFood,
      dose_amount: doseAmount || '1 dose',
    };

    let saveError = false;
    if (editing) {
      const { error: err } = await supabase.from('schedules').update(payload).eq('id', editing.id);
      if (err) { setError(err.message); saveError = true; }
    } else {
      const { error: err } = await supabase.from('schedules').insert(payload);
      if (err) { setError(err.message); saveError = true; }
    }
    setSaving(false);
    if (!saveError) onSaved();
  };

  return (
    <Modal open={open} onClose={onClose} title={editing ? 'Edit schedule' : 'Add schedule'} size="md">
      <div className="space-y-5">
        {error && <div className="p-3 rounded-xl bg-rose-50 text-rose-700 text-sm border border-rose-200">{error}</div>}
        <Select label="Medication" value={medicationId} onChange={(e) => setMedicationId(e.target.value)}>
          {medications.map((m) => <option key={m.id} value={m.id}>{m.name} ({m.dosage})</option>)}
        </Select>

        <div>
          <span className="block text-sm font-medium text-slate-700 mb-1.5">Times</span>
          <div className="space-y-2">
            {times.map((t, i) => (
              <div key={i} className="flex items-center gap-2">
                <TimeInput value={t} onChange={(v) => updateTime(i, v)} className="flex-1" />
                {times.length > 1 && (
                  <button onClick={() => removeTime(i)} className="p-2 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-rose-500">
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
          <button onClick={addTime} className="mt-2 text-sm text-teal-600 font-medium hover:underline flex items-center gap-1">
            <Plus className="w-4 h-4" /> Add time
          </button>
        </div>

        <Select label="Frequency" value={frequency} onChange={(e) => setFrequency(e.target.value)}>
          <option value="daily">Every day</option>
          <option value="specific_days">Specific days</option>
        </Select>

        {frequency === 'specific_days' && (
          <div>
            <span className="block text-sm font-medium text-slate-700 mb-1.5">Days of week</span>
            <div className="flex flex-wrap gap-2">
              {DAYS.map((d, i) => (
                <button key={i} type="button" onClick={() => toggleDay(i)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${daysOfWeek.includes(i) ? 'bg-teal-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                  {d}
                </button>
              ))}
            </div>
          </div>
        )}

        <Input label="Dose amount" value={doseAmount} onChange={(e) => setDoseAmount(e.target.value)} placeholder="e.g. 1 tablet" />
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={withFood} onChange={(e) => setWithFood(e.target.checked)} className="w-4 h-4 rounded text-teal-600 focus:ring-teal-500" />
          <span className="text-sm text-slate-700">Take with food</span>
        </label>

        <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button loading={saving} onClick={handleSave}>{editing ? 'Save' : 'Add schedule'}</Button>
        </div>
      </div>
    </Modal>
  );
}
