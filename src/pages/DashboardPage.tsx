import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Pill, Activity, TrendingUp, AlertTriangle, CheckCircle2, Clock, Plus, Calendar } from 'lucide-react';
import { supabase, Medication, DoseLog, Schedule } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { useNotifications } from '@/context/NotificationContext';
import { Card, CardBody } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { Spinner } from '@/components/ui/Spinner';
import { getPillColor } from '@/lib/theme';
import { fmtTime, fmtDate } from '@/lib/dates';
import { predictRefill, getAdherenceRate } from '@/lib/refill';

type TodayDose = {
  medication: Medication;
  time: string;
  doseLog: DoseLog | null;
};

export function DashboardPage() {
  const { user, profile } = useAuth();
  const { addNotification } = useNotifications();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [medications, setMedications] = useState<Medication[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [doseLogs, setDoseLogs] = useState<DoseLog[]>([]);
  const [refillAlerts, setRefillAlerts] = useState<{ med: Medication; days: number | null; critical: boolean }[]>([]);
  const [loggingId, setLoggingId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (!user) return;
    setLoading(true);

    const { data: joinedMeds, error: medErr } = await supabase
      .from('medications')
      .select('*, medicine_db(*)')
      .eq('user_id', user.id)
      .eq('active', true)
      .order('created_at', { ascending: false });
    let meds: Medication[] | null = joinedMeds as Medication[] | null;
    if (medErr) {
      const { data: plainMeds } = await supabase
        .from('medications')
        .select('*')
        .eq('user_id', user.id)
        .eq('active', true)
        .order('created_at', { ascending: false });
      meds = plainMeds as Medication[] | null;
    }
    const { data: scheds } = await supabase.from('schedules').select('*, medication(*)').eq('user_id', user.id);
    const { data: logs } = await supabase.from('dose_logs').select('*, medication(*)').eq('user_id', user.id).order('scheduled_time', { ascending: false }).limit(200);

    setMedications(meds || []);
    setSchedules((scheds as Schedule[]) || []);
    setDoseLogs((logs as DoseLog[]) || []);
    setLoading(false);
  }, [user]);

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

  const todayDoses: TodayDose[] = schedules
    .filter((s) => {
      if (s.frequency === 'daily') return true;
      if (s.frequency === 'specific_days') return s.days_of_week?.includes(todayDow);
      return true;
    })
    .flatMap((s) =>
      s.times.map((time) => {
        const todayStr = today.toISOString().split('T')[0];
        const scheduledTime = `${todayStr}T${time}:00`;
        const doseLog =
          doseLogs.find(
            (log) =>
              log.medication_id === s.medication_id &&
              log.scheduled_time.startsWith(todayStr) &&
              log.scheduled_time.includes(time)
          ) || null;
        return { medication: s.medication!, time, doseLog };
      })
    )
    .sort((a, b) => a.time.localeCompare(b.time));

  const takenToday = todayDoses.filter((d) => d.doseLog?.status === 'taken').length;
  const totalToday = todayDoses.length;
  const todayRate = totalToday > 0 ? Math.round((takenToday / totalToday) * 100) : 0;
  const overallAdherence = getAdherenceRate(doseLogs, 30);
  const activeMeds = medications.filter((m) => m.active).length;

  const logDose = async (dose: TodayDose, status: 'taken' | 'skipped') => {
    if (!user) return;
    setLoggingId(`${dose.medication.id}-${dose.time}`);
    const todayStr = today.toISOString().split('T')[0];
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
        user_id: user.id,
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
            Welcome back, {profile?.full_name?.split(' ')[0] || 'there'}
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">{fmtDate(new Date(), 'EEEE, MMMM d, yyyy')}</p>
        </div>
        <Button onClick={() => navigate('/app/medications')} size="md">
          <Plus className="w-4 h-4" /> Add medication
        </Button>
      </div>

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
        <div className="lg:col-span-2">
          <Card>
            <CardBody>
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-slate-900 flex items-center gap-2">
                  <Clock className="w-5 h-5 text-teal-600" /> Today's schedule
                </h3>
                <Button variant="ghost" size="sm" onClick={() => navigate('/app/schedule')}>
                  <Calendar className="w-4 h-4" /> View all
                </Button>
              </div>

              {todayDoses.length === 0 ? (
                <EmptyState
                  icon={<Calendar className="w-7 h-7" />}
                  title="No doses scheduled today"
                  description="Add a medication and set up a schedule to see your daily reminders here."
                  action={<Button size="sm" onClick={() => navigate('/app/medications')}><Plus className="w-4 h-4" /> Add medication</Button>}
                />
              ) : (
                <div className="space-y-2">
                  {todayDoses.map((dose, i) => {
                    const color = getPillColor(dose.medication.color);
                    const status = dose.doseLog?.status;
                    const isPending = !status || status === 'pending';
                    return (
                      <div
                        key={`${dose.medication.id}-${dose.time}-${i}`}
                        className={`flex items-center gap-3 rounded-xl border p-3 transition-all ${
                          status === 'taken'
                            ? 'border-emerald-100 bg-emerald-50/40'
                            : status === 'skipped'
                            ? 'border-slate-100 bg-slate-50/60 opacity-60'
                            : 'border-slate-200 bg-white hover:border-slate-300'
                        }`}
                      >
                        <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${color.gradient} flex items-center justify-center text-white flex-shrink-0`}>
                          <Pill className="w-5 h-5" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-slate-800 truncate">{dose.medication.name}</p>
                          <p className="text-xs text-slate-500">
                            {fmtTime(dose.time)} · {dose.medication.dosage || '1 dose'}
                            {dose.medication.instructions && ` · ${dose.medication.instructions}`}
                          </p>
                        </div>
                        {status === 'taken' && <Badge color="emerald"><CheckCircle2 className="w-3 h-3" /> Taken</Badge>}
                        {status === 'skipped' && <Badge color="slate">Skipped</Badge>}
                        {status === 'missed' && <Badge color="rose">Missed</Badge>}
                        {isPending && (
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
