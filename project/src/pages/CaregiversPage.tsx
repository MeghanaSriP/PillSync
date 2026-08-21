import { useEffect, useState, useCallback } from 'react';
import {
  Users, UserPlus, Check, X, Heart, Activity, Pill, Clock, Mail, User,
  Save, Shield, Phone, Calendar, Send, Eye,
} from 'lucide-react';
import { supabase, CaregiverRelation, Profile, Medication, DoseLog } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { usePatientContext } from '@/context/PatientContext';
import { useNotifications } from '@/context/NotificationContext';
import { Card, CardBody } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Input, Textarea } from '@/components/ui/FormField';
import { Modal } from '@/components/ui/Modal';
import { Alert } from '@/components/ui/Alert';
import { EmptyState } from '@/components/ui/EmptyState';
import { Spinner } from '@/components/ui/Spinner';
import { fmtDate, fmtDateTime } from '@/lib/dates';
import { getAdherenceRate } from '@/lib/refill';

const TIMEZONES = ['UTC', 'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles', 'Europe/London', 'Europe/Paris', 'Asia/Tokyo', 'Asia/Kolkata', 'Australia/Sydney'];

type LinkedPerson = {
  relation: CaregiverRelation;
  profile: Profile;
  roleLabel: 'patient' | 'caregiver';
};

function ToggleRow({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  description?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-2">
      <div className="min-w-0">
        <p className="text-sm font-medium text-slate-800">{label}</p>
        {description && <p className="text-xs text-slate-500 mt-0.5">{description}</p>}
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

export function CaregiversPage() {
  const { user, profile } = useAuth();
  const { addNotification } = useNotifications();
  const { setActivePatientId, refreshLinks, activePatientId } = usePatientContext();
  const isCaregiver = profile?.role === 'caregiver';

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

  const [editPerson, setEditPerson] = useState<LinkedPerson | null>(null);
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editDob, setEditDob] = useState('');
  const [editEmergency, setEditEmergency] = useState('');
  const [editTimezone, setEditTimezone] = useState('UTC');
  const [editRelationLabel, setEditRelationLabel] = useState('');
  const [canLogDoses, setCanLogDoses] = useState(true);
  const [canRefill, setCanRefill] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileMsg, setProfileMsg] = useState<string | null>(null);
  const [profileErr, setProfileErr] = useState<string | null>(null);

  const [emailPerson, setEmailPerson] = useState<LinkedPerson | null>(null);
  const [emailSubject, setEmailSubject] = useState('');
  const [emailBody, setEmailBody] = useState('');
  const [sendingEmail, setSendingEmail] = useState(false);
  const [emailMsg, setEmailMsg] = useState<string | null>(null);
  const [emailErr, setEmailErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    let { data, error: err } = await supabase
      .from('caregiver_relations')
      .select('*, patient:profiles!patient_id(*), caregiver:profiles!caregiver_id(*)')
      .or(`caregiver_id.eq.${user.id},patient_id.eq.${user.id}`)
      .order('created_at', { ascending: false });

    let rawList: any[] = (data as any[]) || [];

    if (err || rawList.length === 0) {
      const { data: plainData } = await supabase
        .from('caregiver_relations')
        .select('*')
        .or(`caregiver_id.eq.${user.id},patient_id.eq.${user.id}`)
        .order('created_at', { ascending: false });
      rawList = (plainData as any[]) || [];
    }

    const userIdsToFetch = new Set<string>();
    rawList.forEach((r) => {
      if (r.caregiver_id) userIdsToFetch.add(r.caregiver_id);
      if (r.patient_id) userIdsToFetch.add(r.patient_id);
    });

    let profileMap: Record<string, Profile> = {};
    if (userIdsToFetch.size > 0) {
      const { data: profs } = await supabase
        .from('profiles')
        .select('*')
        .in('id', Array.from(userIdsToFetch));
      if (profs) {
        profs.forEach((p) => { profileMap[p.id] = p; });
      }
    }

    const populatedRelations: CaregiverRelation[] = rawList.map((r) => ({
      ...r,
      patient: r.patient || profileMap[r.patient_id] || (r.patient_id === user.id ? profile : null),
      caregiver: r.caregiver || profileMap[r.caregiver_id] || (r.caregiver_id === user.id ? profile : null),
    }));

    if (isCaregiver) {
      setRelations(populatedRelations.filter((r) => r.caregiver_id === user.id));
      setIncoming(populatedRelations.filter((r) => r.caregiver_id === user.id && r.status === 'pending'));
    } else {
      setRelations(populatedRelations.filter((r) => r.patient_id === user.id));
      setIncoming(populatedRelations.filter((r) => r.patient_id === user.id && r.status === 'pending'));
    }
    setLoading(false);
  }, [user, profile, isCaregiver]);

  useEffect(() => { load(); }, [load]);

  const handleInvite = async () => {
    if (!user) return;
    setInviting(true);
    setError(null);
    const searchEmail = inviteEmail.trim().toLowerCase();

    if (!searchEmail) {
      setError(isCaregiver ? 'Please enter the patient email address.' : 'Please enter a caregiver email address.');
      setInviting(false);
      return;
    }

    try {
      const res = await fetch('http://localhost:3002/api/invite-caregiver', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requesterId: user.id,
          email: searchEmail,
          relation: inviteRelation,
          isCaregiverRole: isCaregiver,
        }),
      });

      const data = await res.json();
      if (!res.ok || data.error) {
        setError(data.error || 'Failed to send invite.');
      } else {
        setShowInvite(false);
        setInviteEmail('');
        setInviteRelation('');
        await addNotification({
          type: 'caregiver',
          title: isCaregiver ? 'Patient invite sent' : 'Caregiver invite sent',
          message: `Invited ${data.targetProfile?.full_name || searchEmail}. They will get an email and in-app request.`,
        });
        await load();
        await refreshLinks();
      }
    } catch {
      setError('Could not connect to backend server. Make sure the email server is running.');
    } finally {
      setInviting(false);
    }
  };

  const respondToRequest = async (rel: CaregiverRelation, status: 'accepted' | 'declined') => {
    await supabase.from('caregiver_relations').update({ status }).eq('id', rel.id);
    await addNotification({
      type: 'caregiver',
      title: status === 'accepted' ? 'Connection accepted' : 'Connection declined',
      message: `${profile?.full_name} ${status} the care connection.`,
      medication_id: null,
    });
    await load();
    await refreshLinks();
  };

  const removeRelation = async (rel: CaregiverRelation) => {
    if (!confirm('Remove this care connection?')) return;
    await supabase.from('caregiver_relations').delete().eq('id', rel.id);
    if (activePatientId === rel.patient_id) setActivePatientId(null);
    await load();
    await refreshLinks();
  };

  const getOther = (rel: CaregiverRelation): LinkedPerson | null => {
    const isPatientSide = rel.patient_id === user?.id;
    const other = isPatientSide ? rel.caregiver : rel.patient;
    if (!other) return null;
    return {
      relation: rel,
      profile: other,
      roleLabel: isPatientSide ? 'caregiver' : 'patient',
    };
  };

  const openProfileEditor = (person: LinkedPerson) => {
    setEditPerson(person);
    setEditName(person.profile.full_name || '');
    setEditPhone(person.profile.phone || '');
    setEditDob(person.profile.date_of_birth || '');
    setEditEmergency(person.profile.emergency_contact || '');
    setEditTimezone(person.profile.timezone || 'UTC');
    setEditRelationLabel(person.relation.relation || '');
    setCanLogDoses(person.relation.can_log_doses ?? true);
    setCanRefill(person.relation.can_refill ?? true);
    setProfileMsg(null);
    setProfileErr(null);
  };

  const saveLinkedProfile = async () => {
    if (!user || !editPerson) return;
    setSavingProfile(true);
    setProfileErr(null);
    setProfileMsg(null);

    try {
      const res = await fetch('http://localhost:3002/api/update-linked-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requesterId: user.id,
          targetId: editPerson.profile.id,
          updates: {
            full_name: editName,
            phone: editPhone,
            date_of_birth: editDob || null,
            emergency_contact: editEmergency,
            timezone: editTimezone,
          },
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        setProfileErr(data.error || 'Failed to update profile.');
        setSavingProfile(false);
        return;
      }

      const permPayload: Partial<CaregiverRelation> = { relation: editRelationLabel || editPerson.relation.relation };
      if (isCaregiver && editPerson.roleLabel === 'patient') {
        permPayload.can_log_doses = canLogDoses;
        permPayload.can_refill = canRefill;
      }
      await supabase.from('caregiver_relations').update(permPayload).eq('id', editPerson.relation.id);

      setProfileMsg('Profile saved. Each person keeps their own profile — changes apply only to this linked account.');
      await load();
      await refreshLinks();
    } catch {
      setProfileErr('Could not reach the server to save profile changes.');
    } finally {
      setSavingProfile(false);
    }
  };

  const openEmailComposer = (person: LinkedPerson) => {
    setEmailPerson(person);
    setEmailSubject('');
    setEmailBody('');
    setEmailMsg(null);
    setEmailErr(null);
  };

  const sendLinkedEmail = async () => {
    if (!user || !emailPerson) return;
    if (!emailSubject.trim() || !emailBody.trim()) {
      setEmailErr('Subject and message are required.');
      return;
    }
    setSendingEmail(true);
    setEmailErr(null);
    setEmailMsg(null);
    try {
      const res = await fetch('http://localhost:3002/api/send-linked-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          senderId: user.id,
          recipientId: emailPerson.profile.id,
          subject: emailSubject.trim(),
          message: emailBody.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        setEmailErr(data.error || 'Failed to send email.');
      } else {
        setEmailMsg(`Email sent to ${emailPerson.profile.email || emailPerson.profile.full_name}.`);
        await addNotification({
          type: 'caregiver',
          title: 'Email sent',
          message: `Sent to ${emailPerson.profile.full_name}`,
        });
      }
    } catch {
      setEmailErr('Could not connect to the email server.');
    } finally {
      setSendingEmail(false);
    }
  };

  const viewPatient = async (rel: CaregiverRelation) => {
    const targetPatient = rel.patient;
    if (!targetPatient) return;
    setSelectedPatient({ relation: rel, profile: targetPatient });
    setLoadingPatient(true);
    const [{ data: meds }, { data: logs }] = await Promise.all([
      supabase.from('medications').select('*, medicine_db(*)').eq('user_id', rel.patient_id).eq('active', true),
      supabase.from('dose_logs').select('*, medication(*)').eq('user_id', rel.patient_id).order('scheduled_time', { ascending: false }).limit(50),
    ]);
    setPatientMeds((meds as Medication[]) || []);
    setPatientLogs((logs as DoseLog[]) || []);
    setLoadingPatient(false);
  };

  const manageInApp = (rel: CaregiverRelation) => {
    setActivePatientId(rel.patient_id);
  };

  if (loading) {
    return <div className="flex justify-center py-20"><Spinner className="w-8 h-8 text-teal-600" /></div>;
  }

  const accepted = relations.filter((r) => r.status === 'accepted');

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{isCaregiver ? 'My patients' : 'My caregivers'}</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {isCaregiver
              ? 'Add multiple patients, manage each profile separately, email them, and switch whose meds you are managing.'
              : 'Invite caregivers, update their care contact details, and email them when you need help.'}
          </p>
        </div>
        <Button onClick={() => setShowInvite(true)}>
          <UserPlus className="w-4 h-4" /> {isCaregiver ? 'Add patient' : 'Invite caregiver'}
        </Button>
      </div>

      {isCaregiver && accepted.length > 0 && (
        <Alert tone="info">
          Select a patient below with <strong>Manage in app</strong> to view and edit that patient’s medications, schedule, and history across the app. Each patient’s profile stays separate.
        </Alert>
      )}

      {incoming.length > 0 && (
        <Card>
          <CardBody>
            <h3 className="font-semibold text-slate-900 mb-4 flex items-center gap-2">
              <Heart className="w-5 h-5 text-rose-500" /> Incoming requests
            </h3>
            <div className="space-y-2">
              {incoming.map((rel) => {
                const requester = getOther(rel)?.profile;
                return (
                  <div key={rel.id} className="flex items-center gap-3 p-3 rounded-xl border border-slate-200">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-teal-400 to-cyan-500 flex items-center justify-center text-white text-sm font-semibold">
                      {(requester?.full_name || '?').split(' ').map((n) => n[0]).slice(0, 2).join('')}
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-slate-800">{requester?.full_name || 'PillSync User'}</p>
                      <p className="text-xs text-slate-500">{rel.relation} · {fmtDate(rel.created_at)}</p>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => respondToRequest(rel, 'accepted')}><Check className="w-3.5 h-3.5" /> Accept</Button>
                      <Button size="sm" variant="outline" onClick={() => respondToRequest(rel, 'declined')}><X className="w-3.5 h-3.5" /> Decline</Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardBody>
        </Card>
      )}

      <Card>
        <CardBody>
          <h3 className="font-semibold text-slate-900 mb-4 flex items-center gap-2">
            <Users className="w-5 h-5 text-teal-600" />
            {isCaregiver ? `Patients (${accepted.length})` : `Caregivers (${accepted.length})`}
          </h3>
          {relations.length === 0 ? (
            <EmptyState
              icon={<Users className="w-7 h-7" />}
              title="No connections yet"
              description={isCaregiver
                ? 'Add patients by email. Each keeps a separate profile you can manage and email.'
                : 'Invite a caregiver by email so they can help manage your medications.'}
            />
          ) : (
            <div className="space-y-3">
              {relations.map((rel) => {
                const person = getOther(rel);
                if (!person) return null;
                const isActive = isCaregiver && rel.status === 'accepted' && activePatientId === rel.patient_id;
                return (
                  <div
                    key={rel.id}
                    className={`rounded-xl border p-4 transition-colors ${isActive ? 'border-teal-400 bg-teal-50/40' : 'border-slate-200 hover:border-slate-300'}`}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                      <div className="w-12 h-12 rounded-full bg-gradient-to-br from-violet-400 to-teal-500 flex items-center justify-center text-white text-sm font-semibold flex-shrink-0">
                        {(person.profile.full_name || '?').split(' ').map((n) => n[0]).slice(0, 2).join('')}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-semibold text-slate-900">{person.profile.full_name || 'PillSync User'}</p>
                          {rel.status === 'accepted' ? (
                            <Badge color="emerald"><Check className="w-3 h-3" /> Active</Badge>
                          ) : (
                            <Badge color="amber">Pending</Badge>
                          )}
                          {isActive && <Badge color="teal">Managing now</Badge>}
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5">
                          {rel.relation || person.roleLabel} · {person.profile.email || 'No email'}
                          {person.profile.phone ? ` · ${person.profile.phone}` : ''}
                        </p>
                      </div>
                      <Button size="sm" variant="ghost" className="text-rose-500 hover:bg-rose-50 self-start" onClick={() => removeRelation(rel)}>
                        <X className="w-3.5 h-3.5" /> Remove
                      </Button>
                    </div>

                    {rel.status === 'accepted' && (
                      <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-slate-100">
                        <Button size="sm" variant="outline" onClick={() => openProfileEditor(person)}>
                          <User className="w-3.5 h-3.5" /> Manage profile
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => openEmailComposer(person)}>
                          <Mail className="w-3.5 h-3.5" /> Send email
                        </Button>
                        {isCaregiver && (
                          <>
                            <Button size="sm" variant={isActive ? 'primary' : 'outline'} onClick={() => manageInApp(rel)}>
                              <Eye className="w-3.5 h-3.5" /> {isActive ? 'Managing' : 'Manage in app'}
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => viewPatient(rel)}>
                              <Activity className="w-3.5 h-3.5" /> Quick monitor
                            </Button>
                          </>
                        )}
                      </div>
                    )}
                    {rel.status === 'pending' && (
                      <p className="text-xs text-amber-600 mt-3">Waiting for them to accept. An invite email was sent.</p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardBody>
      </Card>

      {/* Invite modal */}
      <Modal open={showInvite} onClose={() => setShowInvite(false)} title={isCaregiver ? 'Add patient' : 'Invite caregiver'} size="sm">
        <div className="space-y-4">
          {error && <Alert tone="error">{error}</Alert>}
          <Input
            label="Email address"
            type="email"
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            placeholder={isCaregiver ? 'patient@example.com' : 'caregiver@example.com'}
          />
          <Input
            label="Relationship (optional)"
            value={inviteRelation}
            onChange={(e) => setInviteRelation(e.target.value)}
            placeholder="e.g. Son, Nurse, Spouse, Parent"
          />
          <Alert tone="info">
            {isCaregiver
              ? 'They must already have a PillSync patient account. They will get an email and can accept or decline. You can add as many patients as you need — each profile is managed separately.'
              : 'Your caregiver will get an email invite. Once accepted, they can monitor your meds and you can email each other from this page.'}
          </Alert>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setShowInvite(false)}>Cancel</Button>
            <Button loading={inviting} onClick={handleInvite}><Mail className="w-4 h-4" /> Send invite email</Button>
          </div>
        </div>
      </Modal>

      {/* Profile editor — bidirectional */}
      <Modal
        open={!!editPerson}
        onClose={() => setEditPerson(null)}
        title={`Manage ${editPerson?.roleLabel || 'profile'}: ${editPerson?.profile.full_name || ''}`}
        size="md"
      >
        {editPerson && (
          <div className="space-y-4">
            {profileErr && <Alert tone="error">{profileErr}</Alert>}
            {profileMsg && <Alert tone="success">{profileMsg}</Alert>}
            <p className="text-xs text-slate-500">
              Editing <span className="font-medium text-slate-700">{editPerson.profile.email}</span> — changes update their PillSync profile (not yours).
            </p>
            <Input label="Full name" value={editName} onChange={(e) => setEditName(e.target.value)} />
            <Input label="Phone" value={editPhone} onChange={(e) => setEditPhone(e.target.value)} placeholder="+1 555 000 0000" />
            <div className="grid sm:grid-cols-2 gap-4">
              <Input label="Date of birth" type="date" value={editDob} onChange={(e) => setEditDob(e.target.value)} />
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Timezone</label>
                <select
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                  value={editTimezone}
                  onChange={(e) => setEditTimezone(e.target.value)}
                >
                  {TIMEZONES.map((tz) => <option key={tz}>{tz}</option>)}
                </select>
              </div>
            </div>
            <Input label="Emergency contact" value={editEmergency} onChange={(e) => setEditEmergency(e.target.value)} placeholder="Name & phone" />
            <Input label="Your relationship label" value={editRelationLabel} onChange={(e) => setEditRelationLabel(e.target.value)} placeholder="e.g. Daughter, Home nurse" />

            {isCaregiver && editPerson.roleLabel === 'patient' && (
              <div className="rounded-xl border border-slate-200 p-3 space-y-1">
                <div className="flex items-center gap-2 mb-1">
                  <Shield className="w-4 h-4 text-teal-600" />
                  <p className="text-sm font-semibold text-slate-800">Permissions for this patient</p>
                </div>
                <ToggleRow
                  checked={canLogDoses}
                  onChange={setCanLogDoses}
                  label="Log doses"
                  description="Allow logging taken / skipped doses for this patient"
                />
                <ToggleRow
                  checked={canRefill}
                  onChange={setCanRefill}
                  label="Log refills"
                  description="Allow recording medication refills for this patient"
                />
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setEditPerson(null)}>Close</Button>
              <Button loading={savingProfile} onClick={saveLinkedProfile}><Save className="w-4 h-4" /> Save profile</Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Email composer */}
      <Modal
        open={!!emailPerson}
        onClose={() => setEmailPerson(null)}
        title={`Email ${emailPerson?.profile.full_name || ''}`}
        size="md"
      >
        {emailPerson && (
          <div className="space-y-4">
            {emailErr && <Alert tone="error">{emailErr}</Alert>}
            {emailMsg && <Alert tone="success">{emailMsg}</Alert>}
            <p className="text-xs text-slate-500 flex items-center gap-1.5">
              <Mail className="w-3.5 h-3.5" /> To: {emailPerson.profile.email || 'No email on file'}
            </p>
            <Input label="Subject" value={emailSubject} onChange={(e) => setEmailSubject(e.target.value)} placeholder="Medication check-in" />
            <Textarea
              label="Message"
              value={emailBody}
              onChange={(e) => setEmailBody(e.target.value)}
              rows={5}
              placeholder="Write a message about medications, appointments, or care notes…"
            />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setEmailPerson(null)}>Cancel</Button>
              <Button loading={sendingEmail} onClick={sendLinkedEmail} disabled={!emailPerson.profile.email}>
                <Send className="w-4 h-4" /> Send email
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Patient monitoring modal */}
      <Modal open={!!selectedPatient} onClose={() => setSelectedPatient(null)} title={`Monitoring: ${selectedPatient?.profile.full_name || ''}`} size="lg">
        {loadingPatient ? (
          <div className="flex justify-center py-10"><Spinner className="w-8 h-8 text-teal-600" /></div>
        ) : (
          <div className="space-y-5">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
              <div className="bg-slate-50 rounded-xl p-3 flex items-start gap-2">
                <Phone className="w-4 h-4 text-slate-400 mt-0.5" />
                <div>
                  <p className="text-xs text-slate-500">Phone</p>
                  <p className="font-medium text-slate-800">{selectedPatient?.profile.phone || '—'}</p>
                </div>
              </div>
              <div className="bg-slate-50 rounded-xl p-3 flex items-start gap-2">
                <Calendar className="w-4 h-4 text-slate-400 mt-0.5" />
                <div>
                  <p className="text-xs text-slate-500">DOB</p>
                  <p className="font-medium text-slate-800">{selectedPatient?.profile.date_of_birth || '—'}</p>
                </div>
              </div>
              <div className="bg-slate-50 rounded-xl p-3 flex items-start gap-2 col-span-2">
                <Heart className="w-4 h-4 text-slate-400 mt-0.5" />
                <div>
                  <p className="text-xs text-slate-500">Emergency</p>
                  <p className="font-medium text-slate-800">{selectedPatient?.profile.emergency_contact || '—'}</p>
                </div>
              </div>
            </div>

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

            {selectedPatient && (
              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <Button variant="outline" onClick={() => openEmailComposer({ relation: selectedPatient.relation, profile: selectedPatient.profile, roleLabel: 'patient' })}>
                  <Mail className="w-4 h-4" /> Email patient
                </Button>
                <Button onClick={() => { manageInApp(selectedPatient.relation); setSelectedPatient(null); }}>
                  <Eye className="w-4 h-4" /> Manage in app
                </Button>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
