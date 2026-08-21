import { useEffect, useState, useCallback } from 'react';
import { FileText, Pill, CheckCircle2, XCircle, MinusCircle, Clock, Filter } from 'lucide-react';
import { supabase, DoseLog, Medication } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { usePatientContext } from '@/context/PatientContext';
import { Card, CardBody } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Select } from '@/components/ui/FormField';
import { EmptyState } from '@/components/ui/EmptyState';
import { Spinner } from '@/components/ui/Spinner';
import { getPillColor } from '@/lib/theme';
import { fmtDateTime, fmtDate } from '@/lib/dates';

const STATUS_CONFIG = {
  taken: { icon: CheckCircle2, color: 'emerald', label: 'Taken' },
  missed: { icon: XCircle, color: 'rose', label: 'Missed' },
  skipped: { icon: MinusCircle, color: 'slate', label: 'Skipped' },
  pending: { icon: Clock, color: 'amber', label: 'Pending' },
};

export function HistoryPage() {
  const { user } = useAuth();
  const { effectiveUserId } = usePatientContext();
  const [loading, setLoading] = useState(true);
  const [logs, setLogs] = useState<DoseLog[]>([]);
  const [filter, setFilter] = useState('all');
  const [period, setPeriod] = useState('30');

  const load = useCallback(async () => {
    if (!user || !effectiveUserId) return;
    setLoading(true);
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - parseInt(period, 10));

    const { data: meds } = await supabase
      .from('medications')
      .select('*')
      .eq('user_id', effectiveUserId);
    const medMap = new Map((meds as Medication[] | null || []).map((m) => [m.id, m]));

    const { data: joinedLogs, error: logErr } = await supabase
      .from('dose_logs')
      .select('*, medication(*)')
      .eq('user_id', effectiveUserId)
      .gte('scheduled_time', cutoff.toISOString())
      .order('scheduled_time', { ascending: false });
    let logs: DoseLog[];
    if (logErr || !joinedLogs) {
      const { data: plainLogs } = await supabase
        .from('dose_logs')
        .select('*')
        .eq('user_id', effectiveUserId)
        .gte('scheduled_time', cutoff.toISOString())
        .order('scheduled_time', { ascending: false });
      logs = ((plainLogs as DoseLog[] | null) || []).map((l) => ({
        ...l,
        medication: medMap.get(l.medication_id) || undefined,
      }));
    } else {
      logs = joinedLogs as DoseLog[];
    }
    setLogs(logs);
    setLoading(false);
  }, [user, period, effectiveUserId]);

  useEffect(() => { load(); }, [load]);

  const filtered = filter === 'all' ? logs : logs.filter((l) => l.status === filter);

  const counts = logs.reduce((acc, l) => { acc[l.status] = (acc[l.status] || 0) + 1; return acc; }, {} as Record<string, number>);

  if (loading) {
    return <div className="flex justify-center py-20"><Spinner className="w-8 h-8 text-teal-600" /></div>;
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Medication History</h1>
        <p className="text-sm text-slate-500 mt-0.5">Complete record of your dose activity</p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {(['taken', 'missed', 'skipped', 'pending'] as const).map((status) => {
          const cfg = STATUS_CONFIG[status];
          const Icon = cfg.icon;
          return (
            <Card key={status}>
              <CardBody className="!p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Icon className={`w-4 h-4 text-${cfg.color === 'slate' ? 'slate' : cfg.color}-500`} />
                  <span className="text-xs text-slate-500">{cfg.label}</span>
                </div>
                <p className="text-2xl font-bold text-slate-900">{counts[status] || 0}</p>
              </CardBody>
            </Card>
          );
        })}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1.5 text-slate-500"><Filter className="w-4 h-4" /></div>
        <Select value={filter} onChange={(e) => setFilter(e.target.value)} className="!w-auto">
          <option value="all">All statuses</option>
          <option value="taken">Taken</option>
          <option value="missed">Missed</option>
          <option value="skipped">Skipped</option>
          <option value="pending">Pending</option>
        </Select>
        <Select value={period} onChange={(e) => setPeriod(e.target.value)} className="!w-auto">
          <option value="7">Last 7 days</option>
          <option value="30">Last 30 days</option>
          <option value="90">Last 90 days</option>
          <option value="365">Last year</option>
        </Select>
      </div>

      {/* Log list */}
      {filtered.length === 0 ? (
        <Card>
          <EmptyState
            icon={<FileText className="w-7 h-7" />}
            title="No dose history found"
            description="Once you start logging doses, they'll appear here as a complete medication record."
          />
        </Card>
      ) : (
        <Card>
          <CardBody className="!p-0">
            <div className="divide-y divide-slate-100">
              {filtered.slice(0, 100).map((log) => {
                const med = log.medication;
                const color = med ? getPillColor(med.color) : getPillColor('slate');
                const cfg = STATUS_CONFIG[log.status];
                const Icon = cfg.icon;
                return (
                  <div key={log.id} className="flex items-center gap-3 px-5 py-3.5 hover:bg-slate-50 transition-colors">
                    <div className={`w-9 h-9 rounded-lg bg-gradient-to-br ${color.gradient} flex items-center justify-center text-white flex-shrink-0`}>
                      <Pill className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-800 truncate">{med?.name || 'Unknown medication'}</p>
                      <p className="text-xs text-slate-500">
                        Scheduled: {fmtDateTime(log.scheduled_time)}
                        {log.taken_time && ` · Taken: ${fmtDateTime(log.taken_time)}`}
                      </p>
                    </div>
                    <Badge color={cfg.color}>
                      <Icon className="w-3 h-3" /> {cfg.label}
                    </Badge>
                  </div>
                );
              })}
            </div>
            {filtered.length > 100 && (
              <div className="px-5 py-3 text-center text-xs text-slate-400 border-t border-slate-100">
                Showing 100 of {filtered.length} records
              </div>
            )}
          </CardBody>
        </Card>
      )}
    </div>
  );
}
