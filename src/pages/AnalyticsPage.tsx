import { useEffect, useState, useCallback, useMemo } from 'react';
import { BarChart3, TrendingUp, TrendingDown, Activity, Pill, Calendar } from 'lucide-react';
import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { supabase, DoseLog, Medication } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { Card, CardBody } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { Spinner } from '@/components/ui/Spinner';
import { Select } from '@/components/ui/FormField';
import { getPillColor } from '@/lib/theme';
import { fmtDate } from '@/lib/dates';
import { getAdherenceRate } from '@/lib/refill';
import { format, parseISO, subDays, eachDayOfInterval } from 'date-fns';

const STATUS_COLORS: Record<string, string> = {
  taken: '#10b981', missed: '#f43f5e', skipped: '#94a3b8', pending: '#f59e0b',
};

export function AnalyticsPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [logs, setLogs] = useState<DoseLog[]>([]);
  const [medications, setMedications] = useState<Medication[]>([]);
  const [period, setPeriod] = useState('30');

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const days = parseInt(period, 10);
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    const [{ data: logData }, { data: medData }] = await Promise.all([
      supabase.from('dose_logs').select('*, medication(*)').eq('user_id', user.id).gte('scheduled_time', cutoff.toISOString()).order('scheduled_time'),
      supabase.from('medications').select('*').eq('user_id', user.id),
    ]);
    setLogs((logData as DoseLog[]) || []);
    setMedications((medData as Medication[]) || []);
    setLoading(false);
  }, [user, period]);

  useEffect(() => { load(); }, [load]);

  const adherence7 = getAdherenceRate(logs, 7);
  const adherence30 = getAdherenceRate(logs, 30);
  const adherence90 = getAdherenceRate(logs, 90);

  const trend = adherence30 >= adherence90 ? 'up' : 'down';

  // Daily adherence chart data
  const dailyData = useMemo(() => {
    const days = parseInt(period, 10);
    const end = new Date();
    const start = subDays(end, days - 1);
    const range = eachDayOfInterval({ start, end });
    return range.map((d) => {
      const dateStr = d.toISOString().split('T')[0];
      const dayLogs = logs.filter((l) => l.scheduled_time.startsWith(dateStr) && l.status !== 'pending');
      const taken = dayLogs.filter((l) => l.status === 'taken').length;
      const total = dayLogs.length;
      const rate = total > 0 ? Math.round((taken / total) * 100) : 0;
      return { date: format(d, 'MMM d'), rate, taken, total };
    });
  }, [logs, period]);

  // Per-medication adherence
  const perMedData = useMemo(() => {
    return medications.map((med) => {
      const medLogs = logs.filter((l) => l.medication_id === med.id && l.status !== 'pending');
      const taken = medLogs.filter((l) => l.status === 'taken').length;
      const rate = medLogs.length > 0 ? Math.round((taken / medLogs.length) * 100) : 0;
      const color = getPillColor(med.color);
      return { name: med.name, rate, total: medLogs.length, taken, color: med.color };
    }).filter((d) => d.total > 0).sort((a, b) => b.rate - a.rate);
  }, [logs, medications]);

  // Status distribution pie
  const pieData = useMemo(() => {
    const counts: Record<string, number> = {};
    logs.forEach((l) => { counts[l.status] = (counts[l.status] || 0) + 1; });
    return Object.entries(counts).map(([status, count]) => ({ name: status, value: count }));
  }, [logs]);

  // Day of week adherence
  const dowData = useMemo(() => {
    const dows = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const data = dows.map((d) => ({ day: d, rate: 0, total: 0, taken: 0 }));
    logs.forEach((l) => {
      if (l.status === 'pending') return;
      const dow = new Date(l.scheduled_time).getDay();
      data[dow].total++;
      if (l.status === 'taken') data[dow].taken++;
    });
    return data.map((d) => ({ ...d, rate: d.total > 0 ? Math.round((d.taken / d.total) * 100) : 0 }));
  }, [logs]);

  if (loading) {
    return <div className="flex justify-center py-20"><Spinner className="w-8 h-8 text-teal-600" /></div>;
  }

  if (logs.length === 0) {
    return (
      <div className="max-w-4xl mx-auto">
        <h1 className="text-2xl font-bold text-slate-900 mb-6">Analytics</h1>
        <Card>
          <EmptyState
            icon={<BarChart3 className="w-7 h-7" />}
            title="No data to analyze yet"
            description="Start logging your doses and you'll see adherence trends, per-medication stats, and patterns here."
          />
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Analytics</h1>
          <p className="text-sm text-slate-500 mt-0.5">Adherence insights and medication trends</p>
        </div>
        <Select value={period} onChange={(e) => setPeriod(e.target.value)} className="!w-auto">
          <option value="7">Last 7 days</option>
          <option value="30">Last 30 days</option>
          <option value="90">Last 90 days</option>
        </Select>
      </div>

      {/* Adherence summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardBody>
            <div className="flex items-center justify-between mb-2">
              <Activity className="w-5 h-5 text-teal-600" />
              {trend === 'up' ? <TrendingUp className="w-4 h-4 text-emerald-500" /> : <TrendingDown className="w-4 h-4 text-rose-500" />}
            </div>
            <p className="text-3xl font-bold text-slate-900">{adherence30}%</p>
            <p className="text-xs text-slate-500 mt-1">30-day adherence</p>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <Calendar className="w-5 h-5 text-blue-600 mb-2" />
            <p className="text-3xl font-bold text-slate-900">{adherence7}%</p>
            <p className="text-xs text-slate-500 mt-1">7-day adherence</p>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <TrendingUp className="w-5 h-5 text-violet-600 mb-2" />
            <p className="text-3xl font-bold text-slate-900">{adherence90}%</p>
            <p className="text-xs text-slate-500 mt-1">90-day adherence</p>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <Pill className="w-5 h-5 text-amber-600 mb-2" />
            <p className="text-3xl font-bold text-slate-900">{medications.filter((m) => m.active).length}</p>
            <p className="text-xs text-slate-500 mt-1">Active medications</p>
          </CardBody>
        </Card>
      </div>

      {/* Daily adherence trend */}
      <Card>
        <CardBody>
          <h3 className="font-semibold text-slate-900 mb-4">Daily adherence rate</h3>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={dailyData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#94a3b8' }} interval="preserveStartEnd" />
              <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: '#94a3b8' }} />
              <Tooltip contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '12px' }} />
              <Line type="monotone" dataKey="rate" stroke="#0d9488" strokeWidth={2.5} dot={{ fill: '#0d9488', r: 3 }} activeDot={{ r: 5 }} name="Adherence %" />
            </LineChart>
          </ResponsiveContainer>
        </CardBody>
      </Card>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Per-medication adherence */}
        <Card>
          <CardBody>
            <h3 className="font-semibold text-slate-900 mb-4">Per-medication adherence</h3>
            {perMedData.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-8">No dose data yet</p>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={perMedData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11, fill: '#94a3b8' }} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: '#64748b' }} width={90} />
                  <Tooltip contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '12px' }} />
                  <Bar dataKey="rate" fill="#0d9488" radius={[0, 6, 6, 0]} name="Adherence %" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardBody>
        </Card>

        {/* Status distribution */}
        <Card>
          <CardBody>
            <h3 className="font-semibold text-slate-900 mb-4">Dose status distribution</h3>
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} innerRadius={50} paddingAngle={3}>
                  {pieData.map((entry, i) => <Cell key={i} fill={STATUS_COLORS[entry.name] || '#94a3b8'} />)}
                </Pie>
                <Tooltip contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '12px' }} />
                <Legend wrapperStyle={{ fontSize: '12px' }} />
              </PieChart>
            </ResponsiveContainer>
          </CardBody>
        </Card>
      </div>

      {/* Day of week pattern */}
      <Card>
        <CardBody>
          <h3 className="font-semibold text-slate-900 mb-4">Adherence by day of week</h3>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={dowData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="day" tick={{ fontSize: 11, fill: '#94a3b8' }} />
              <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: '#94a3b8' }} />
              <Tooltip contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '12px' }} />
              <Bar dataKey="rate" fill="#0d9488" radius={[6, 6, 0, 0]} name="Adherence %" />
            </BarChart>
          </ResponsiveContainer>
        </CardBody>
      </Card>

      {/* Per-medication detail list */}
      {perMedData.length > 0 && (
        <Card>
          <CardBody>
            <h3 className="font-semibold text-slate-900 mb-4">Medication breakdown</h3>
            <div className="space-y-3">
              {perMedData.map((d) => {
                const color = getPillColor(d.color);
                return (
                  <div key={d.name} className="flex items-center gap-3">
                    <div className={`w-3 h-3 rounded-full ${color.dot} flex-shrink-0`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-medium text-slate-700 truncate">{d.name}</span>
                        <span className="text-sm font-semibold text-slate-900">{d.rate}%</span>
                      </div>
                      <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full ${d.rate >= 80 ? 'bg-emerald-500' : d.rate >= 50 ? 'bg-amber-500' : 'bg-rose-500'}`} style={{ width: `${d.rate}%` }} />
                      </div>
                      <p className="text-xs text-slate-400 mt-1">{d.taken} of {d.total} doses taken</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardBody>
        </Card>
      )}
    </div>
  );
}
