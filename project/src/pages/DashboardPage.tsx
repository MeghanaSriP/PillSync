import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Pill, Activity, TrendingUp, AlertTriangle, CheckCircle2, Clock, Plus, Calendar, Sparkles } from 'lucide-react';
import { supabase, Medication, DoseLog, Schedule } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { usePatientContext } from '@/context/PatientContext';
import { useNotifications } from '@/context/NotificationContext';
import { Card, CardBody } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { Spinner } from '@/components/ui/Spinner';
import { getPillColor } from '@/lib/theme';
import { fmtTime, fmtDate } from '@/lib/dates';
import { predictRefill, getAdherenceRate } from '@/lib/refill';
import { format } from 'date-fns';

type TodayDose = {
  schedule: Schedule;
  medication: Medication;
  time: string;
  doseLog: DoseLog | null;
  status: 'taken' | 'skipped' | 'missed' | 'pending';
};

export function DashboardPage() {
  const { user, profile } = useAuth();
  const { effectiveUserId, isManagingPatient, activePatient, canLogDoses } = usePatientContext();
  const { addNotification } = useNotifications();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [medications, setMedications] = useState<Medication[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [doseLogs, setDoseLogs] = useState<DoseLog[]>([]);
  const [refillAlerts, setRefillAlerts] = useState<{ med: Medication; days: number | null; critical: boolean }[]>([]);
  const [loggingId, setLoggingId] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'pending' | 'completed'>('all');

  const loadData = useCallback(async () => {
    if (!user || !effectiveUserId) return;
    setLoading(true);

    const { data: joinedMeds, error: medErr } = await supabase
      .from('medications')
      .select('*, medicine_db(*)')
      .eq('user_id', effectiveUserId)
      .eq('active', true)
      .order('created_at', { ascending: false });
    let meds: Medication[] | null = joinedMeds as Medication[] | null;
    if (medErr) {
      const { data: plainMeds } = await supabase
        .from('medications')
        .select('*')
        .eq('user_id', effectiveUserId)
        .eq('active', true)
        .order('created_at', { ascending: false });
      meds = plainMeds as Medication[] | null;
    }
    const medList = meds || [];
    const medMap = new Map(medList.map((m) => [m.id, m]));

    const { data: joinedScheds, error: schedErr } = await supabase.from('schedules').select('*, medication(*)').eq('user_id', effectiveUserId);
    let scheds = joinedScheds as Schedule[] | null;
    if (schedErr || !scheds) {
      const { data: plainScheds } = await supabase.from('schedules').select('*').eq('user_id', effectiveUserId);
      scheds = (plainScheds as Schedule[] | null) || [];
    }

    const resolvedScheds = (scheds || [])
      .map((s) => ({
        ...s,
        medication: s.medication && typeof s.medication === 'object' && s.medication.id ? s.medication : medMap.get(s.medication_id),
      }))
      .filter((s) => !!s.medication && s.medication.active) as Schedule[];

    const { data: joinedLogs, error: logErr } = await supabase.from('dose_logs').select('*, medication(*)').eq('user_id', effectiveUserId).order('scheduled_time', { ascending: false }).limit(300);
    let logs = joinedLogs as DoseLog[] | null;
    if (logErr || !logs) {
      const { data: plainLogs } = await supabase.from('dose_logs').select('*').eq('user_id', effectiveUserId).order('scheduled_time', { ascending: false }).limit(300);
      logs = ((plainLogs as DoseLog[] | null) || []).map((l) => ({
        ...l,
        medication: l.medication || medMap.get(l.medication_id),
      }));
    } else {
      logs = logs.map((l) => ({
        ...l,
        medication: l.medication || medMap.get(l.medication_id),
      }));
    }

    setMedications(medList);
    setSchedules(resolvedScheds);
    setDoseLogs(logs || []);
    setLoading(false);
  }, [user, effectiveUserId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    const alerts: { med: Medication; days: number | null; critical: boolean }[] = [];
    medications.forEach((med) => {
      const pred = predictRefill(med, doseLogs);
      if (pred.isLowStock) {
        alerts.push({ med, days: pred.daysRemaining, critical: pred.isCritical });
        if (pred.isCritical) {
          addNotification({
            type: 'refill',
            title: `Critical: ${med.name} is running low`,
            message: `Only ${med.stock_quantity} ${med.form?.toLowerCase() || 'pills'} left. Refill soon.`,
            medication_id: med.id,
          });
        }
      }
    });
    setRefillAlerts(alerts);
  }, [medications, doseLogs, addNotification]);

  const today = new Date();
  const todayDow = today.getDay();
  const todayStr = format(today, 'yyyy-MM-dd');
  const currentTimeStr = format(today, 'HH:mm');

  const todayDoses: TodayDose[] = schedules
    .filter((s) => {
      if (!s.medication || !s.medication.active) return false;
      if (s.frequency === 'daily') return true;
      if (s.frequency === 'specific_days') return s.days_of_week?.includes(todayDow);
      return true;
    })
    .flatMap((s) =>
      s.times.map((time) => {
        const doseLog =
          doseLogs.find(
            (log) =>
              log.medication_id === s.medication_id &&
              log.scheduled_time.startsWith(todayStr) &&
              log.scheduled_time.includes(time)
          ) || null;

        let status: 'taken' | 'skipped' | 'missed' | 'pending' = 'pending';
        if (doseLog?.status === 'taken') status = 'taken';
        else if (doseLog?.status === 'skipped') status = 'skipped';
        else if (doseLog?.status === 'missed') status = 'missed';
        else if (time < currentTimeStr) status = 'missed';

        return {
          schedule: s,
          medication: s.medication!,
          time,
          doseLog,
          status,
        };
      })
    )
    .sort((a, b) => a.time.localeCompare(b.time));

  const takenToday = todayDoses.filter((d) => d.status === 'taken').length;
  const totalToday = todayDoses.length;
  const todayRate = totalToday > 0 ? Math.round((takenToday / totalToday) * 100) : 0;
  const overallAdherence = getAdherenceRate(doseLogs, 30);
  const activeMeds = medications.filter((m) => m.active).length;

  const nextUpcomingDose = todayDoses.find((d) => d.status === 'pending' || d.status === 'missed');

  const filteredDoses = todayDoses.filter((d) => {
    if (filter === 'pending') return d.status === 'pending' || d.status === 'missed';
    if (filter === 'completed') return d.status === 'taken' || d.status === 'skipped';
    return true;
  });

  const logDose = async (dose: TodayDose, status: 'taken' | 'skipped') => {
    if (!user || !effectiveUserId) return;
    if (isManagingPatient && !canLogDoses) return;
    setLoggingId(`${dose.medication.id}-${dose.time}`);
    const scheduledTime = `${todayStr}T${dose.time}:00`;

    if (dose.doseLog) {
      await supabase.from('dose_logs').update({
        status,
        taken_time: status === 'taken' ? new Date().toISOString() : null,
        logged_by: user.id,
      }).eq('id', dose.doseLog.id);
    } else {
      await supabase.from('dose_logs').insert({
        medication_id: dose.medication.id,
        user_id: effectiveUserId,
        scheduled_time: scheduledTime,
        taken_time: status === 'taken' ? new Date().toISOString() : null,
        status,
        dose_amount: dose.medication.dosage,
        logged_by: user.id,
      });
    }

    if (status === 'taken' && dose.medication.stock_quantity > 0) {
      const newStock = Math.max(0, dose.medication.stock_quantity - 1);
      await supabase.from('medications').update({ stock_quantity: newStock }).eq('id', dose.medication.id);
    }

    setLoggingId(null);
    loadData();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Spinner className="w-8 h-8 text-teal-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            {isManagingPatient
              ? `Managing ${activePatient?.full_name?.split(' ')[0] || 'patient'}`
              : `Welcome back, ${profile?.full_name?.split(' ')[0] || 'there'}`}
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">{fmtDate(new Date(), 'EEEE, MMMM d, yyyy')}</p>
        </div>
        <Button onClick={() => navigate('/app/medications')} size="md">
          <Plus className="w-4 h-4" /> Add medication
        </Button>
      </div>

      {isManagingPatient && (
        <div className="rounded-xl border border-teal-200 bg-teal-50 px-4 py-3 text-sm text-teal-800">
          You are viewing and editing <strong>{activePatient?.full_name}</strong>&apos;s medication data. Switch patients from the header or Patients page.
        </div>
      )}

      {/* Stats grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={Pill} label="Active medications" value={activeMeds} color="teal" />
        <StatCard icon={CheckCircle2} label="Taken today" value={`${takenToday}/${totalToday}`} color="emerald" />
        <StatCard icon={Activity} label="Today's rate" value={`${todayRate}%`} color="blue" />
        <StatCard icon={TrendingUp} label="30-day adherence" value={`${overallAdherence}%`} color="violet" />
      </div>

      {/* Refill alerts */}
      {refillAlerts.length > 0 && (
        <Card className="border-amber-200 bg-amber-50/50">
          <CardBody>
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle className="w-5 h-5 text-amber-600" />
              <h3 className="font-semibold text-slate-900">Refill alerts</h3>
              <Badge color="amber">{refillAlerts.length}</Badge>
            </div>
            <div className="space-y-2">
              {refillAlerts.map(({ med, days, critical }) => {
                const color = getPillColor(med.color);
                return (
                  <div key={med.id} className="flex items-center justify-between bg-white rounded-xl px-4 py-3 border border-amber-100">
                    <div className="flex items-center gap-3">
                      <div className={`w-3 h-3 rounded-full ${color.dot}`} />
                      <div>
                        <p className="text-sm font-medium text-slate-800">{med.name}</p>
                        <p className="text-xs text-slate-500">{med.stock_quantity} {med.form?.toLowerCase() || 'pills'} left</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {critical ? (
                        <Badge color="rose">Critical</Badge>
                      ) : (
                        <Badge color="amber">Low stock</Badge>
                      )}
                      {days !== null && (
                        <span className="text-xs text-slate-500">{days === 0 ? 'Refill today' : `${days} days left`}</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardBody>
        </Card>
      )}

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Today's schedule */}
        <div className="lg:col-span-2 space-y-4">
          <Card>
            <CardBody>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                <div>
                  <h3 className="font-semibold text-slate-900 flex items-center gap-2 text-base">
                    <Clock className="w-5 h-5 text-teal-600" /> Today's schedule
                    {totalToday > 0 && (
                      <Badge color="teal" className="ml-1">
                        {takenToday}/{totalToday} Doses
                      </Badge>
                    )}
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {totalToday === 0
                      ? 'No doses scheduled for today'
                      : `${todayRate}% completed for today`}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex bg-slate-100 p-0.5 rounded-lg text-xs font-medium">
                    <button
                      onClick={() => setFilter('all')}
                      className={`px-2.5 py-1 rounded-md transition-all ${filter === 'all' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
                    >
                      All ({totalToday})
                    </button>
                    <button
                      onClick={() => setFilter('pending')}
                      className={`px-2.5 py-1 rounded-md transition-all ${filter === 'pending' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
                    >
                      Pending ({totalToday - takenToday})
                    </button>
                    <button
                      onClick={() => setFilter('completed')}
                      className={`px-2.5 py-1 rounded-md transition-all ${filter === 'completed' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
                    >
                      Taken
                    </button>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => navigate('/app/schedule')}>
                    <Calendar className="w-4 h-4" /> View all
                  </Button>
                </div>
              </div>

              {/* Progress bar */}
              {totalToday > 0 && (
                <div className="mb-5 bg-slate-100 rounded-full h-2 overflow-hidden">
                  <div
                    className="bg-gradient-to-r from-teal-500 to-emerald-500 h-full transition-all duration-500 ease-out"
                    style={{ width: `${todayRate}%` }}
                  />
                </div>
              )}

              {/* Next due highlight card */}
              {nextUpcomingDose && filter === 'all' && (
                <div className="mb-4 p-3.5 rounded-xl bg-gradient-to-r from-teal-500/10 via-emerald-500/10 to-transparent border border-teal-200/60 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-teal-600 text-white flex items-center justify-center">
                      <Sparkles className="w-4 h-4" />
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-teal-900 uppercase tracking-wider">Next up</p>
                      <p className="text-sm font-medium text-slate-900">
                        {nextUpcomingDose.medication.name} ({nextUpcomingDose.medication.dosage || '1 dose'}) at{' '}
                        <span className="font-semibold">{fmtTime(nextUpcomingDose.time)}</span>
                      </p>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    loading={loggingId === `${nextUpcomingDose.medication.id}-${nextUpcomingDose.time}`}
                    onClick={() => logDose(nextUpcomingDose, 'taken')}
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" /> Mark taken
                  </Button>
                </div>
              )}

              {todayDoses.length === 0 ? (
                <EmptyState
                  icon={<Calendar className="w-7 h-7" />}
                  title="No doses scheduled today"
                  description="Add a medication and set up a schedule to see your daily reminders here."
                  action={<Button size="sm" onClick={() => navigate('/app/medications')}><Plus className="w-4 h-4" /> Add medication</Button>}
                />
              ) : filteredDoses.length === 0 ? (
                <div className="text-center py-8 text-slate-500 text-sm">
                  No {filter} doses for today.
                </div>
              ) : (
                <div className="space-y-2.5">
                  {filteredDoses.map((dose, i) => {
                    const color = getPillColor(dose.medication.color);
                    const isPending = dose.status === 'pending';
                    const isMissed = dose.status === 'missed';

                    return (
                      <div
                        key={`${dose.medication.id}-${dose.time}-${i}`}
                        className={`flex items-center gap-3 rounded-xl border p-3.5 transition-all ${
                          dose.status === 'taken'
                            ? 'border-emerald-200 bg-emerald-50/40'
                            : dose.status === 'skipped'
                            ? 'border-slate-200 bg-slate-50/60 opacity-60'
                            : isMissed
                            ? 'border-rose-200 bg-rose-50/30'
                            : 'border-slate-200 bg-white hover:border-slate-300 shadow-xs'
                        }`}
                      >
                        <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${color.gradient} flex items-center justify-center text-white flex-shrink-0 shadow-xs`}>
                          <Pill className="w-5 h-5" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-semibold text-slate-900 truncate">{dose.medication.name}</p>
                            {dose.schedule.with_food && (
                              <Badge color="amber" className="!text-[10px] !py-0 !px-1.5">With food</Badge>
                            )}
                          </div>
                          <p className="text-xs text-slate-500 mt-0.5">
                            <span className="font-semibold text-slate-700">{fmtTime(dose.time)}</span>
                            {' · '}
                            {dose.medication.dosage || '1 dose'}
                            {dose.medication.instructions && ` · ${dose.medication.instructions}`}
                          </p>
                        </div>

                        {dose.status === 'taken' && (
                          <Badge color="emerald" className="gap-1">
                            <CheckCircle2 className="w-3 h-3" /> Taken
                          </Badge>
                        )}
                        {dose.status === 'skipped' && <Badge color="slate">Skipped</Badge>}
                        {isMissed && <Badge color="rose">Overdue</Badge>}

                        {(isPending || isMissed) && (
                          <div className="flex gap-1.5">
                            <Button
                              size="sm"
                              variant="primary"
                              loading={loggingId === `${dose.medication.id}-${dose.time}`}
                              onClick={() => logDose(dose, 'taken')}
                              className="!px-2.5"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" /> Take
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              loading={loggingId === `${dose.medication.id}-${dose.time}`}
                              onClick={() => logDose(dose, 'skipped')}
                              className="!px-2.5"
                            >
                              Skip
                            </Button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </CardBody>
          </Card>
        </div>

        {/* Active medications quick view */}
        <div>
          <Card>
            <CardBody>
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-slate-900">Your medications</h3>
                <Button variant="ghost" size="sm" onClick={() => navigate('/app/medications')}>View all</Button>
              </div>
              {medications.length === 0 ? (
                <EmptyState
                  icon={<Pill className="w-7 h-7" />}
                  title="No medications yet"
                  description="Add your first medication to start tracking."
                />
              ) : (
                <div className="space-y-2">
                  {medications.slice(0, 5).map((med) => {
                    const color = getPillColor(med.color);
                    return (
                      <button
                        key={med.id}
                        onClick={() => navigate('/app/medications')}
                        className="w-full flex items-center gap-3 p-2.5 rounded-xl hover:bg-slate-50 transition-colors text-left"
                      >
                        <div className={`w-9 h-9 rounded-lg bg-gradient-to-br ${color.gradient} flex items-center justify-center text-white flex-shrink-0`}>
                          <Pill className="w-4 h-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-slate-800 truncate">{med.name}</p>
                          <p className="text-xs text-slate-500">{med.dosage} · {med.stock_quantity} left</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, color }: { icon: typeof Pill; label: string; value: string | number; color: string }) {
  const colors: Record<string, string> = {
    teal: 'bg-teal-50 text-teal-600',
    emerald: 'bg-emerald-50 text-emerald-600',
    blue: 'bg-blue-50 text-blue-600',
    violet: 'bg-violet-50 text-violet-600',
  };
  return (
    <Card>
      <CardBody className="!p-4">
        <div className={`w-10 h-10 rounded-xl ${colors[color]} flex items-center justify-center mb-3`}>
          <Icon className="w-5 h-5" />
        </div>
        <p className="text-2xl font-bold text-slate-900">{value}</p>
        <p className="text-xs text-slate-500 mt-0.5">{label}</p>
      </CardBody>
    </Card>
  );
}

