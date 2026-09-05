import { useEffect, useState, useCallback } from 'react';
import { Users, UserPlus, Check, X, Heart, Activity, Pill, Clock, Mail } from 'lucide-react';
import { supabase, CaregiverRelation, Profile, Medication, DoseLog } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { useNotifications } from '@/context/NotificationContext';
import { Card, CardBody } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/FormField';
import { Modal } from '@/components/ui/Modal';
import { Alert } from '@/components/ui/Alert';
import { EmptyState } from '@/components/ui/EmptyState';
import { Spinner } from '@/components/ui/Spinner';
import { fmtDate, fmtDateTime } from '@/lib/dates';
import { getAdherenceRate } from '@/lib/refill';

export function CaregiversPage() {
  const { user, profile } = useAuth();
  const { addNotification } = useNotifications();
  const [loading, setLoading] = useState(true);
  const [relations, setRelations] = useState<CaregiverRelation[]>([]);
  const [incoming, setIncoming] = useState<CaregiverRelation[]>([]);
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRelation, setInviteRelation] = useState('');
  const [inviting, setInviting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedPatient, setSelectedPatient] = useState<{ relation: CaregiverRelation; profile: Profile } | null>(null);
  const [patientMeds, setPatientMeds] = useState<Medication[]>([]);
  const [patientLogs, setPatientLogs] = useState<DoseLog[]>([]);
  const [loadingPatient, setLoadingPatient] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data, error: err } = await supabase
      .from('caregiver_relations')
      .select('*, patient:profiles!patient_id(*), caregiver:profiles!caregiver_id(*)')
      .or(`caregiver_id.eq.${user.id},patient_id.eq.${user.id}`)
      .order('created_at', { ascending: false });
    if (err) console.error(err.message);
    const all = (data as CaregiverRelation[]) || [];
    setRelations(all.filter((r) => r.caregiver_id === user.id));
    setIncoming(all.filter((r) => r.patient_id === user.id));
    setLoading(false);
  }, [user]);

  useEffect(() => { load(); }, [load]);

  const handleInvite = async () => {
    if (!user) return;
    setInviting(true);
    setError(null);
    const { data: targetProfile } = await supabase.from('profiles').select('*').ilike('email', inviteEmail.trim()).maybeSingle();
    if (!targetProfile) {
      setError('No user found with that email. They need to create an account first.');
      setInviting(false);
      return;
    }
    if (targetProfile.id === user.id) { setError('You cannot add yourself as a caregiver.'); setInviting(false); return; }

    const { error: err } = await supabase.from('caregiver_relations').insert({
      caregiver_id: user.id, patient_id: targetProfile.id, relation: inviteRelation || 'Caregiver',
    });
    if (err) {
      if (err.code === '23505') setError('You already have a relation with this person.');
      else setError(err.message);
    } else {
      await supabase.from('notifications').insert({
        user_id: targetProfile.id, type: 'caregiver',
        title: `${profile?.full_name || 'Someone'} wants to be your caregiver`,
        message: `They would like to monitor your medications. Accept or decline in the Caregivers tab.`,
      });
      setShowInvite(false); setInviteEmail(''); setInviteRelation('');
    }
    setInviting(false);
    load();
  };

  const respondToRequest = async (rel: CaregiverRelation, status: 'accepted' | 'declined') => {
    await supabase.from('caregiver_relations').update({ status }).eq('id', rel.id);
    await addNotification({
      type: 'caregiver',
      title: status === 'accepted' ? 'Caregiver request accepted' : 'Caregiver request declined',
      message: `${profile?.full_name} ${status} your caregiver request.`,
      medication_id: null,
    });
    load();
  };

  const removeRelation = async (rel: CaregiverRelation) => {
    if (!confirm('Remove this caregiver connection?')) return;
    await supabase.from('caregiver_relations').delete().eq('id', rel.id);
    load();
  };

  const viewPatient = async (rel: CaregiverRelation) => {
    if (!rel.patient) return;
    setSelectedPatient({ relation: rel, profile: rel.patient });
    setLoadingPatient(true);
    const [{ data: meds }, { data: logs }] = await Promise.all([
      supabase.from('medications').select('*, medicine_db(*)').eq('user_id', rel.patient_id).eq('active', true),
      supabase.from('dose_logs').select('*, medication(*)').eq('user_id', rel.patient_id).order('scheduled_time', { ascending: false }).limit(50),
    ]);
    setPatientMeds((meds as Medication[]) || []);
    setPatientLogs((logs as DoseLog[]) || []);
    setLoadingPatient(false);
  };

  if (loading) {
    return <div className="flex justify-center py-20"><Spinner className="w-8 h-8 text-teal-600" /></div>;
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Caregivers</h1>
          <p className="text-sm text-slate-500 mt-0.5">{profile?.role === 'caregiver' ? 'Manage patients you monitor' : 'Manage who can monitor your medications'}</p>
        </div>
        <Button onClick={() => setShowInvite(true)}>
          <UserPlus className="w-4 h-4" /> {profile?.role === 'caregiver' ? 'Add patient' : 'Invite caregiver'}
        </Button>
      </div>

      {/* Incoming requests (for patients) */}
      {incoming.length > 0 && (
        <Card>
          <CardBody>
            <h3 className="font-semibold text-slate-900 mb-4 flex items-center gap-2">
              <Heart className="w-5 h-5 text-rose-500" /> Caregiver requests
            </h3>
            <div className="space-y-2">
              {incoming.map((rel) => (
                <div key={rel.id} className="flex items-center gap-3 p-3 rounded-xl border border-slate-200">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-teal-400 to-cyan-500 flex items-center justify-center text-white text-sm font-semibold">
                    {(rel.caregiver?.full_name || '?').split(' ').map((n) => n[0]).slice(0, 2).join('')}
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-slate-800">{rel.caregiver?.full_name}</p>
                    <p className="text-xs text-slate-500">{rel.relation} · {fmtDate(rel.created_at)}</p>
                  </div>
                  {rel.status === 'pending' ? (
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => respondToRequest(rel, 'accepted')}><Check className="w-3.5 h-3.5" /> Accept</Button>
                      <Button size="sm" variant="outline" onClick={() => respondToRequest(rel, 'declined')}><X className="w-3.5 h-3.5" /> Decline</Button>
                    </div>
                  ) : (
                    <Badge color={rel.status === 'accepted' ? 'emerald' : 'slate'}>{rel.status}</Badge>
                  )}
                </div>
              ))}
            </div>
          </CardBody>
        </Card>
      )}

      {/* My connections */}
      <Card>
        <CardBody>
          <h3 className="font-semibold text-slate-900 mb-4 flex items-center gap-2">
            <Users className="w-5 h-5 text-teal-600" />
            {profile?.role === 'caregiver' ? 'Patients you monitor' : 'Your caregivers'}
          </h3>
          {relations.length === 0 ? (
            <EmptyState
              icon={<Users className="w-7 h-7" />}
              title="No connections yet"
              description={profile?.role === 'caregiver' ? 'Add a patient by their email to start monitoring their medications.' : 'Invite a caregiver by email so they can help you stay on track.'}
            />
          ) : (
            <div className="space-y-2">
              {relations.map((rel) => (
                <div key={rel.id} className="flex items-center gap-3 p-3 rounded-xl border border-slate-200 hover:border-slate-300 transition-colors">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-violet-400 to-teal-500 flex items-center justify-center text-white text-sm font-semibold">
                    {(rel.patient?.full_name || '?').split(' ').map((n) => n[0]).slice(0, 2).join('')}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-800">{rel.patient?.full_name}</p>
                    <p className="text-xs text-slate-500">{rel.relation} · {rel.patient?.email}</p>
                  </div>
                  {rel.status === 'accepted' ? (
                    <>
                      <Badge color="emerald"><Check className="w-3 h-3" /> Active</Badge>
                      {profile?.role === 'caregiver' && (
                        <Button size="sm" variant="outline" onClick={() => viewPatient(rel)}>
                          <Activity className="w-3.5 h-3.5" /> Monitor
                        </Button>
                      )}
                    </>
                  ) : (
                    <Badge color="amber">Pending</Badge>
                  )}
                  <Button size="sm" variant="ghost" className="text-rose-500 hover:bg-rose-50" onClick={() => removeRelation(rel)}>
                    <X className="w-3.5 h-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardBody>
      </Card>

      {/* Invite modal */}
      <Modal open={showInvite} onClose={() => setShowInvite(false)} title={profile?.role === 'caregiver' ? 'Add patient' : 'Invite caregiver'} size="sm">
        <div className="space-y-4">
          {error && <Alert tone="error">{error}</Alert>}
          <Input label="Email address" type="email" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} placeholder="person@example.com" />
          <Input label="Relationship (optional)" value={inviteRelation} onChange={(e) => setInviteRelation(e.target.value)} placeholder="e.g. Son, Nurse, Spouse" />
          <Alert tone="info">
            {profile?.role === 'caregiver'
              ? 'They will receive a notification to accept or decline your monitoring request.'
              : 'Your caregiver will be able to see your medications and log doses on your behalf once accepted.'}
          </Alert>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setShowInvite(false)}>Cancel</Button>
            <Button loading={inviting} onClick={handleInvite}><Mail className="w-4 h-4" /> Send request</Button>
          </div>
        </div>
      </Modal>

      {/* Patient monitoring modal */}
      <Modal open={!!selectedPatient} onClose={() => setSelectedPatient(null)} title={`Monitoring: ${selectedPatient?.profile.full_name || ''}`} size="lg">
        {loadingPatient ? (
          <div className="flex justify-center py-10"><Spinner className="w-8 h-8 text-teal-600" /></div>
        ) : (
          <div className="space-y-5">
            {/* Stats */}
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-slate-50 rounded-xl p-3 text-center">
                <Pill className="w-5 h-5 text-teal-600 mx-auto mb-1" />
                <p className="text-xl font-bold text-slate-900">{patientMeds.length}</p>
                <p className="text-xs text-slate-500">Medications</p>
              </div>
              <div className="bg-slate-50 rounded-xl p-3 text-center">
                <Activity className="w-5 h-5 text-emerald-600 mx-auto mb-1" />
                <p className="text-xl font-bold text-slate-900">{getAdherenceRate(patientLogs, 30)}%</p>
                <p className="text-xs text-slate-500">Adherence</p>
              </div>
              <div className="bg-slate-50 rounded-xl p-3 text-center">
                <Clock className="w-5 h-5 text-blue-600 mx-auto mb-1" />
                <p className="text-xl font-bold text-slate-900">{patientLogs.filter((l) => l.status === 'taken').length}</p>
                <p className="text-xs text-slate-500">Doses taken</p>
              </div>
            </div>

            {/* Medications */}
            <div>
              <h4 className="text-sm font-semibold text-slate-700 mb-2">Active medications</h4>
              {patientMeds.length === 0 ? (
                <p className="text-sm text-slate-400">No active medications</p>
              ) : (
                <div className="space-y-2">
                  {patientMeds.map((med) => (
                    <div key={med.id} className="flex items-center justify-between p-3 rounded-xl border border-slate-200">
                      <div>
                        <p className="text-sm font-medium text-slate-800">{med.name}</p>
                        <p className="text-xs text-slate-500">{med.dosage} · {med.stock_quantity} left</p>
                      </div>
                      {med.stock_quantity <= med.refill_threshold && <Badge color="amber">Low stock</Badge>}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Recent activity */}
            <div>
              <h4 className="text-sm font-semibold text-slate-700 mb-2">Recent doses</h4>
              {patientLogs.length === 0 ? (
                <p className="text-sm text-slate-400">No dose activity yet</p>
              ) : (
                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                  {patientLogs.slice(0, 15).map((log) => (
                    <div key={log.id} className="flex items-center justify-between p-2 rounded-lg bg-slate-50">
                      <div>
                        <p className="text-xs font-medium text-slate-700">{log.medication?.name}</p>
                        <p className="text-[11px] text-slate-400">{fmtDateTime(log.scheduled_time)}</p>
                      </div>
                      <Badge color={log.status === 'taken' ? 'emerald' : log.status === 'missed' ? 'rose' : 'slate'}>{log.status}</Badge>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
