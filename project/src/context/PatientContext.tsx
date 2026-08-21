import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';
import { supabase, CaregiverRelation, Profile } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';

const ACTIVE_PATIENT_KEY = 'pillsync_active_patient_id';

type PatientContextValue = {
  loading: boolean;
  patients: CaregiverRelation[];
  caregivers: CaregiverRelation[];
  activePatientId: string | null;
  activePatient: Profile | null;
  activeRelation: CaregiverRelation | null;
  setActivePatientId: (id: string | null) => void;
  /** User id whose data the app should show (selected patient or self). */
  effectiveUserId: string | null;
  isManagingPatient: boolean;
  canLogDoses: boolean;
  canRefill: boolean;
  refreshLinks: () => Promise<void>;
};

const PatientContext = createContext<PatientContextValue | undefined>(undefined);

async function loadRelationsForUser(userId: string, selfProfile: Profile | null): Promise<CaregiverRelation[]> {
  let { data, error } = await supabase
    .from('caregiver_relations')
    .select('*, patient:profiles!patient_id(*), caregiver:profiles!caregiver_id(*)')
    .or(`caregiver_id.eq.${userId},patient_id.eq.${userId}`)
    .order('created_at', { ascending: false });

  let rawList: any[] = (data as any[]) || [];

  if (error || rawList.length === 0) {
    const { data: plainData } = await supabase
      .from('caregiver_relations')
      .select('*')
      .or(`caregiver_id.eq.${userId},patient_id.eq.${userId}`)
      .order('created_at', { ascending: false });
    rawList = (plainData as any[]) || [];
  }

  const ids = new Set<string>();
  rawList.forEach((r) => {
    if (r.caregiver_id) ids.add(r.caregiver_id);
    if (r.patient_id) ids.add(r.patient_id);
  });

  let profileMap: Record<string, Profile> = {};
  if (ids.size > 0) {
    const { data: profs } = await supabase.from('profiles').select('*').in('id', Array.from(ids));
    (profs || []).forEach((p) => { profileMap[p.id] = p as Profile; });
  }

  return rawList.map((r) => ({
    ...r,
    patient: r.patient || profileMap[r.patient_id] || (r.patient_id === userId ? selfProfile : null),
    caregiver: r.caregiver || profileMap[r.caregiver_id] || (r.caregiver_id === userId ? selfProfile : null),
  })) as CaregiverRelation[];
}

export function PatientProvider({ children }: { children: ReactNode }) {
  const { user, profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [patients, setPatients] = useState<CaregiverRelation[]>([]);
  const [caregivers, setCaregivers] = useState<CaregiverRelation[]>([]);
  const [activePatientId, setActivePatientIdState] = useState<string | null>(() => {
    try {
      return localStorage.getItem(ACTIVE_PATIENT_KEY);
    } catch {
      return null;
    }
  });

  const refreshLinks = useCallback(async () => {
    if (!user) {
      setPatients([]);
      setCaregivers([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const all = await loadRelationsForUser(user.id, profile);
    const acceptedAsCaregiver = all.filter((r) => r.caregiver_id === user.id && r.status === 'accepted');
    const acceptedAsPatient = all.filter((r) => r.patient_id === user.id && r.status === 'accepted');
    setPatients(acceptedAsCaregiver);
    setCaregivers(acceptedAsPatient);
    setLoading(false);
  }, [user, profile]);

  useEffect(() => {
    refreshLinks();
  }, [refreshLinks]);

  // Keep active patient valid when links change
  useEffect(() => {
    if (profile?.role !== 'caregiver') {
      if (activePatientId) setActivePatientIdState(null);
      return;
    }
    if (patients.length === 0) {
      if (activePatientId) setActivePatientIdState(null);
      return;
    }
    const stillValid = patients.some((p) => p.patient_id === activePatientId);
    if (!stillValid) {
      setActivePatientIdState(patients[0].patient_id);
    }
  }, [profile?.role, patients, activePatientId]);

  const setActivePatientId = useCallback((id: string | null) => {
    setActivePatientIdState(id);
    try {
      if (id) localStorage.setItem(ACTIVE_PATIENT_KEY, id);
      else localStorage.removeItem(ACTIVE_PATIENT_KEY);
    } catch { /* ignore */ }
  }, []);

  const isCaregiver = profile?.role === 'caregiver';
  const activeRelation = isCaregiver
    ? patients.find((p) => p.patient_id === activePatientId) || null
    : null;
  const activePatient = activeRelation?.patient || null;
  const isManagingPatient = Boolean(isCaregiver && activePatientId && activeRelation);
  const effectiveUserId = isManagingPatient ? activePatientId : (user?.id ?? null);

  return (
    <PatientContext.Provider
      value={{
        loading,
        patients,
        caregivers,
        activePatientId: isCaregiver ? activePatientId : null,
        activePatient,
        activeRelation,
        setActivePatientId,
        effectiveUserId,
        isManagingPatient,
        canLogDoses: isManagingPatient ? Boolean(activeRelation?.can_log_doses) : true,
        canRefill: isManagingPatient ? Boolean(activeRelation?.can_refill) : true,
        refreshLinks,
      }}
    >
      {children}
    </PatientContext.Provider>
  );
}

export function usePatientContext() {
  const ctx = useContext(PatientContext);
  if (!ctx) throw new Error('usePatientContext must be used within PatientProvider');
  return ctx;
}
