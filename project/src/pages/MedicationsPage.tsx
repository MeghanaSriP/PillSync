import { useEffect, useState, useCallback } from 'react';
import { Pill, Plus, Search, Trash2, Pencil, Package, AlertTriangle, CheckCircle2, XCircle, RefreshCw } from 'lucide-react';
import { supabase, Medication, MedicineDb, RefillLog } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { usePatientContext } from '@/context/PatientContext';
import { useNotifications } from '@/context/NotificationContext';
import { Card, CardBody } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Input, Select, Textarea, Field } from '@/components/ui/FormField';
import { Modal } from '@/components/ui/Modal';
import { Alert } from '@/components/ui/Alert';
import { EmptyState } from '@/components/ui/EmptyState';
import { Spinner } from '@/components/ui/Spinner';
import { getPillColor, COLOR_OPTIONS } from '@/lib/theme';
import { fmtDate, daysUntil, relativeDays } from '@/lib/dates';
import { searchMedicines, validateMedicineName } from '@/lib/medications';
import { predictRefill } from '@/lib/refill';

const FORMS = ['Tablet', 'Capsule', 'Syrup', 'Injection', 'Inhaler', 'Drops', 'Cream', 'Patch', 'Other'];

export function MedicationsPage() {
  const { user } = useAuth();
  const { effectiveUserId, isManagingPatient, activePatient, canRefill } = usePatientContext();
  const { addNotification } = useNotifications();
  const [loading, setLoading] = useState(true);
  const [medications, setMedications] = useState<Medication[]>([]);
  const [doseLogs, setDoseLogs] = useState<{ medication_id: string; status: string; scheduled_time: string }[]>([]);
  const [search, setSearch] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<Medication | null>(null);
  const [refillMed, setRefillMed] = useState<Medication | null>(null);
  const [refillQty, setRefillQty] = useState('30');
  const [refilling, setRefilling] = useState(false);
  const [refillHistory, setRefillHistory] = useState<RefillLog[]>([]);
  const [showHistory, setShowHistory] = useState<Medication | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user || !effectiveUserId) return;
    setLoading(true);
    setLoadError(null);
    const { data: joinedMeds, error: medErr } = await supabase
      .from('medications')
      .select('*, medicine_db(*)')
      .eq('user_id', effectiveUserId)
      .order('created_at', { ascending: false });
    let meds: Medication[] | null = joinedMeds as Medication[] | null;
    if (medErr) {
      const { data: plainMeds, error: fallbackErr } = await supabase
        .from('medications')
        .select('*')
        .eq('user_id', effectiveUserId)
        .order('created_at', { ascending: false });
      meds = plainMeds as Medication[] | null;
      if (fallbackErr) setLoadError(fallbackErr.message);
    }
    const { data: logs } = await supabase
      .from('dose_logs')
      .select('medication_id, status, scheduled_time')
      .eq('user_id', effectiveUserId);
    setMedications(meds || []);
    setDoseLogs((logs as { medication_id: string; status: string; scheduled_time: string }[]) || []);
    setLoading(false);
  }, [user, effectiveUserId]);

  useEffect(() => {
    load();
  }, [load]);

  const handleDelete = async (med: Medication) => {
    if (!confirm(`Delete "${med.name}"? This removes it and all its schedules and dose logs.`)) return;
    await supabase.from('medications').delete().eq('id', med.id);
    load();
  };

  const handleRefill = async () => {
    if (!refillMed || !user || !effectiveUserId) return;
    if (isManagingPatient && !canRefill) return;
    setRefilling(true);
    const qty = parseInt(refillQty, 10) || 0;
    const newTotal = refillMed.stock_quantity + qty;
    await supabase.from('medications').update({ stock_quantity: newTotal, initial_stock: newTotal }).eq('id', refillMed.id);
    await supabase.from('refill_logs').insert({
      medication_id: refillMed.id,
      user_id: effectiveUserId,
      quantity: qty,
      new_total: newTotal,
    });
    await addNotification({
      type: 'refill',
      title: `Refilled ${refillMed.name}`,
      message: `Added ${qty} ${refillMed.form?.toLowerCase() || 'pills'}. New total: ${newTotal}.`,
      medication_id: refillMed.id,
    });
    setRefilling(false);
    setRefillMed(null);
    setRefillQty('30');
    load();
  };

  const loadRefillHistory = async (med: Medication) => {
    if (!user || !effectiveUserId) return;
    const { data } = await supabase.from('refill_logs').select('*').eq('medication_id', med.id).order('refilled_at', { ascending: false });
    setRefillHistory((data as RefillLog[]) || []);
    setShowHistory(med);
  };

  const filtered = medications.filter((m) =>
    m.name.toLowerCase().includes(search.toLowerCase()) ||
    (m.generic_name || '').toLowerCase().includes(search.toLowerCase()) ||
    (m.condition || '').toLowerCase().includes(search.toLowerCase())
  );

  if (loading) {
    return <div className="flex justify-center py-20"><Spinner className="w-8 h-8 text-teal-600" /></div>;
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            {isManagingPatient ? `${activePatient?.full_name?.split(' ')[0] || 'Patient'}'s medications` : 'Medications'}
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {isManagingPatient
              ? 'Add and edit this patient’s medications separately from your own account.'
              : 'Manage your medicine cabinet with database validation'}
          </p>
        </div>
        <Button onClick={() => { setEditing(null); setShowAdd(true); }}>
          <Plus className="w-4 h-4" /> Add medication
        </Button>
      </div>

      {loadError && (
        <Alert tone="error">Could not load medications: {loadError}</Alert>
      )}

      {medications.length > 0 && (
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search medications..."
            className="w-full pl-10 pr-4 py-2.5 text-sm rounded-xl border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-teal-500/40 focus:border-teal-500"
          />
        </div>
      )}

      {medications.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Pill className="w-7 h-7" />}
            title="No medications yet"
            description="Add your first medication. We'll check it against a real medicine database to make sure it's valid."
            action={<Button onClick={() => { setEditing(null); setShowAdd(true); }}><Plus className="w-4 h-4" /> Add your first medication</Button>}
          />
        </Card>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {filtered.map((med) => {
            const color = getPillColor(med.color);
            const pred = predictRefill(med, doseLogs as never);
            const daysLeft = daysUntil(med.refill_date);
            return (
              <Card key={med.id} className="overflow-hidden">
                <CardBody>
                  <div className="flex items-start gap-3">
                    <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${color.gradient} flex items-center justify-center text-white flex-shrink-0`}>
                      <Pill className="w-6 h-6" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <h3 className="font-semibold text-slate-900">{med.name}</h3>
                          <p className="text-xs text-slate-500">{med.dosage} · {med.form}</p>
                        </div>
                        {med.medicine_db && (
                          <Badge color="emerald"><CheckCircle2 className="w-3 h-3" /> Verified</Badge>
                        )}
                      </div>
                      {med.condition && <p className="text-xs text-slate-400 mt-1">For: {med.condition}</p>}
                      {med.instructions && <p className="text-xs text-slate-400 mt-0.5">{med.instructions}</p>}
                    </div>
                  </div>

                  {/* Stock bar */}
                  <div className="mt-4">
                    <div className="flex items-center justify-between text-xs mb-1.5">
                      <span className="text-slate-500 flex items-center gap-1"><Package className="w-3.5 h-3.5" /> Stock</span>
                      <span className="font-medium text-slate-700">{med.stock_quantity} {med.form?.toLowerCase() || 'pills'}</span>
                    </div>
                    <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${
                          pred.isCritical ? 'bg-rose-500' : pred.isLowStock ? 'bg-amber-500' : 'bg-emerald-500'
                        }`}
                        style={{ width: `${Math.min(100, (med.stock_quantity / Math.max(med.initial_stock, med.stock_quantity, 1)) * 100)}%` }}
                      />
                    </div>
                    {pred.isLowStock && (
                      <div className="flex items-center gap-1.5 mt-2 text-xs">
                        <AlertTriangle className={`w-3.5 h-3.5 ${pred.isCritical ? 'text-rose-500' : 'text-amber-500'}`} />
                        <span className={pred.isCritical ? 'text-rose-600' : 'text-amber-600'}>
                          {pred.isCritical ? 'Critical low stock' : 'Running low'}
                          {pred.daysRemaining !== null && ` · ${relativeDays(pred.daysRemaining)}`}
                        </span>
                      </div>
                    )}
                    {med.refill_date && !pred.isLowStock && (
                      <p className="text-xs text-slate-400 mt-1.5">Refill by {fmtDate(med.refill_date)} ({relativeDays(daysLeft)})</p>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 mt-4 pt-4 border-t border-slate-100">
                    <Button size="sm" variant="outline" onClick={() => { setRefillMed(med); setRefillQty('30'); }}>
                      <RefreshCw className="w-3.5 h-3.5" /> Refill
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => loadRefillHistory(med)}>
                      History
                    </Button>
                    <div className="flex-1" />
                    <Button size="sm" variant="ghost" onClick={() => { setEditing(med); setShowAdd(true); }}>
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button size="sm" variant="ghost" className="text-rose-500 hover:bg-rose-50" onClick={() => handleDelete(med)}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </CardBody>
              </Card>
            );
          })}
        </div>
      )}

      {/* Add/Edit modal */}
      <MedicationFormModal
        open={showAdd}
        onClose={() => { setShowAdd(false); setEditing(null); }}
        editing={editing}
        onSaved={() => { setShowAdd(false); setEditing(null); load(); }}
      />

      {/* Refill modal */}
      <Modal open={!!refillMed} onClose={() => setRefillMed(null)} title={`Refill ${refillMed?.name || ''}`} size="sm">
        {refillMed && (
          <div className="space-y-4">
            <Alert tone="info">
              Current stock: <strong>{refillMed.stock_quantity}</strong> {refillMed.form?.toLowerCase() || 'pills'}
            </Alert>
            <Field label="Quantity to add">
              <Input type="number" value={refillQty} onChange={(e) => setRefillQty(e.target.value)} min="1" />
            </Field>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setRefillMed(null)}>Cancel</Button>
              <Button loading={refilling} onClick={handleRefill}><RefreshCw className="w-4 h-4" /> Refill</Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Refill history modal */}
      <Modal open={!!showHistory} onClose={() => setShowHistory(null)} title={`Refill history — ${showHistory?.name || ''}`} size="md">
        {refillHistory.length === 0 ? (
          <EmptyState icon={<RefreshCw className="w-7 h-7" />} title="No refills logged yet" />
        ) : (
          <div className="space-y-2">
            {refillHistory.map((r) => (
              <div key={r.id} className="flex items-center justify-between p-3 rounded-xl border border-slate-200">
                <div>
                  <p className="text-sm font-medium text-slate-800">+{r.quantity} {showHistory?.form?.toLowerCase() || 'pills'}</p>
                  <p className="text-xs text-slate-500">{fmtDate(r.refilled_at, 'MMM d, yyyy h:mm a')}</p>
                </div>
                <Badge color="teal">Total: {r.new_total}</Badge>
              </div>
            ))}
          </div>
        )}
      </Modal>
    </div>
  );
}

function MedicationFormModal({
  open,
  onClose,
  editing,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  editing: Medication | null;
  onSaved: () => void;
}) {
  const { user } = useAuth();
  const { effectiveUserId } = usePatientContext();
  const [name, setName] = useState('');
  const [genericName, setGenericName] = useState('');
  const [dosage, setDosage] = useState('');
  const [form, setForm] = useState('Tablet');
  const [color, setColor] = useState('emerald');
  const [stock, setStock] = useState('30');
  const [threshold, setThreshold] = useState('10');
  const [condition, setCondition] = useState('');
  const [instructions, setInstructions] = useState('');
  const [doctor, setDoctor] = useState('');
  const [notes, setNotes] = useState('');
  const [medicineSearch, setMedicineSearch] = useState('');
  const [searchResults, setSearchResults] = useState<MedicineDb[]>([]);
  const [validation, setValidation] = useState<{ checked: boolean; valid: boolean; medicine: MedicineDb | null; suggestions: MedicineDb[] } | null>(null);
  const [validating, setValidating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedMedicine, setSelectedMedicine] = useState<MedicineDb | null>(null);

  useEffect(() => {
    if (open) {
      if (editing) {
        setName(editing.name);
        setGenericName(editing.generic_name || '');
        setDosage(editing.dosage || '');
        setForm(editing.form || 'Tablet');
        setColor(editing.color || 'emerald');
        setStock(String(editing.stock_quantity));
        setThreshold(String(editing.refill_threshold));
        setCondition(editing.condition || '');
        setInstructions(editing.instructions || '');
        setDoctor(editing.prescribing_doctor || '');
        setNotes(editing.notes || '');
        setSelectedMedicine(editing.medicine_db || null);
        setValidation(editing.medicine_db ? { checked: true, valid: true, medicine: editing.medicine_db, suggestions: [] } : null);
      } else {
        setName(''); setGenericName(''); setDosage(''); setForm('Tablet'); setColor('emerald');
        setStock('30'); setThreshold('10'); setCondition(''); setInstructions(''); setDoctor(''); setNotes('');
        setSelectedMedicine(null); setValidation(null); setMedicineSearch(''); setSearchResults([]);
      }
      setError(null);
    }
  }, [open, editing]);

  const doSearch = async (q: string) => {
    setMedicineSearch(q);
    setName(q);
    setValidation(null);
    setSelectedMedicine(null);
    if (q.trim().length < 2) { setSearchResults([]); return; }
    const results = await searchMedicines(q);
    setSearchResults(results);
  };

  const pickMedicine = (med: MedicineDb) => {
    setSelectedMedicine(med);
    setName(med.name);
    setGenericName(med.generic_name || '');
    setForm(med.form || form);
    setMedicineSearch(med.name);
    setSearchResults([]);
    setValidation({ checked: true, valid: true, medicine: med, suggestions: [] });
  };

  const checkValidation = async () => {
    if (!name.trim()) return;
    setValidating(true);
    const result = await validateMedicineName(name);
    setValidation({ checked: true, valid: result.valid, medicine: result.medicine, suggestions: result.suggestions });
    if (result.medicine) setSelectedMedicine(result.medicine);
    setValidating(false);
  };

  const handleSave = async () => {
    if (!user || !effectiveUserId) return;
    if (!name.trim()) { setError('Medicine name is required'); return; }
    setSaving(true);
    setError(null);

    const payload = {
      user_id: effectiveUserId,
      medicine_db_id: selectedMedicine?.id || null,
      name: name.trim(),
      generic_name: genericName.trim() || null,
      dosage: dosage.trim() || null,
      form,
      color,
      stock_quantity: parseInt(stock, 10) || 0,
      initial_stock: parseInt(stock, 10) || 0,
      refill_threshold: parseInt(threshold, 10) || 10,
      condition: condition.trim() || null,
      instructions: instructions.trim() || null,
      prescribing_doctor: doctor.trim() || null,
      notes: notes.trim() || null,
      active: true,
    };

    let saveError = false;

    if (editing) {
      const { error: err } = await supabase.from('medications').update(payload).eq('id', editing.id);
      if (err) { setError(err.message); saveError = true; }
    } else {
      const { data, error: err } = await supabase.from('medications').insert(payload).select().single();
      if (err) { setError(err.message); saveError = true; }
      else if (data) {
        await supabase.from('schedules').insert({
          medication_id: (data as Medication).id,
          user_id: effectiveUserId,
          times: [],
          frequency: 'daily',
          dose_amount: dosage.trim() || '1 dose',
        });
      }
    }

    setSaving(false);
    if (!saveError) onSaved();
  };

  return (
    <Modal open={open} onClose={onClose} title={editing ? 'Edit medication' : 'Add medication'} size="lg">
      <div className="space-y-5">
        {error && <Alert tone="error">{error}</Alert>}

        {/* Medicine search & validation */}
        <div>
          <Field label="Medicine name" hint="Search the medicine database to validate your medication is real">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                value={medicineSearch || name}
                onChange={(e) => doSearch(e.target.value)}
                placeholder="e.g. Metformin, Paracetamol, Atorvastatin..."
                className="w-full pl-10 pr-4 py-2.5 text-sm rounded-xl border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-teal-500/40 focus:border-teal-500"
                autoComplete="off"
              />
            </div>
          </Field>

          {searchResults.length > 0 && (
            <div className="mt-2 border border-slate-200 rounded-xl overflow-hidden max-h-52 overflow-y-auto">
              {searchResults.map((med) => (
                <button
                  key={med.id}
                  onClick={() => pickMedicine(med)}
                  className="w-full flex items-center justify-between px-4 py-2.5 text-left hover:bg-teal-50 border-b border-slate-100 last:border-0 transition-colors"
                >
                  <div>
                    <p className="text-sm font-medium text-slate-800">{med.name}</p>
                    <p className="text-xs text-slate-500">{med.generic_name} · {med.category}</p>
                  </div>
                  <Plus className="w-4 h-4 text-teal-600" />
                </button>
              ))}
            </div>
          )}

          {/* Validation status */}
          <div className="mt-2">
            {validating ? (
              <div className="flex items-center gap-2 text-sm text-slate-500">
                <Spinner className="w-4 h-4 text-teal-600" /> Checking medicine database...
              </div>
            ) : validation?.checked ? (
              validation.valid ? (
                <Alert tone="success">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4" />
                    <span><strong>{validation.medicine?.name}</strong> is a verified medicine. {validation.medicine?.category} · {validation.medicine?.generic_name}</span>
                  </div>
                  {validation.medicine?.common_dosages?.length ? (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {validation.medicine.common_dosages.map((d) => (
                        <button key={d} onClick={() => setDosage(d)} className="px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-700 text-xs hover:bg-emerald-200">{d}</button>
                      ))}
                    </div>
                  ) : null}
                  {validation.medicine?.side_effects?.length ? (
                    <p className="mt-1.5 text-xs">Side effects: {validation.medicine.side_effects.join(', ')}</p>
                  ) : null}
                </Alert>
              ) : (
                <Alert tone="warning" title="Not found in medicine database">
                  <p>"{name}" was not found in our verified medicine database. You can still add it, but double-check the spelling.</p>
                  {validation.suggestions.length > 0 && (
                    <div className="mt-2">
                      <p className="text-xs font-medium mb-1">Did you mean:</p>
                      <div className="flex flex-wrap gap-1.5">
                        {validation.suggestions.map((s) => (
                          <button key={s.id} onClick={() => pickMedicine(s)} className="px-2.5 py-1 rounded-lg bg-amber-100 text-amber-700 text-xs hover:bg-amber-200 transition-colors">
                            {s.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  <button onClick={checkValidation} className="mt-2 text-xs text-amber-700 underline">Re-check</button>
                </Alert>
              )
            ) : name.trim().length >= 2 ? (
              <button onClick={checkValidation} className="text-xs text-teal-600 font-medium hover:underline">
                Validate this medicine
              </button>
            ) : null}
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <Input label="Generic name" value={genericName} onChange={(e) => setGenericName(e.target.value)} placeholder="e.g. Metformin" />
          <Input label="Dosage" value={dosage} onChange={(e) => setDosage(e.target.value)} placeholder="e.g. 500mg" />
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <Select label="Form" value={form} onChange={(e) => setForm(e.target.value)}>
            {FORMS.map((f) => <option key={f}>{f}</option>)}
          </Select>
          <div>
            <span className="block text-sm font-medium text-slate-700 mb-1.5">Pill color</span>
            <div className="flex flex-wrap gap-2">
              {COLOR_OPTIONS.map((c) => {
                const cc = getPillColor(c);
                return (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColor(c)}
                    className={`w-8 h-8 rounded-full bg-gradient-to-br ${cc.gradient} ring-2 transition-all ${color === c ? 'ring-slate-400 scale-110' : 'ring-transparent'}`}
                  />
                );
              })}
            </div>
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <Input label="Current stock" type="number" value={stock} onChange={(e) => setStock(e.target.value)} />
          <Input label="Low-stock alert at" type="number" value={threshold} onChange={(e) => setThreshold(e.target.value)} />
        </div>

        <Input label="Condition being treated" value={condition} onChange={(e) => setCondition(e.target.value)} placeholder="e.g. Type 2 diabetes" />
        <Input label="Instructions" value={instructions} onChange={(e) => setInstructions(e.target.value)} placeholder="e.g. Take with food" />
        <Input label="Prescribing doctor" value={doctor} onChange={(e) => setDoctor(e.target.value)} placeholder="Dr. Smith" />
        <Textarea label="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Any additional notes..." />

        <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button loading={saving} onClick={handleSave}>
            {editing ? 'Save changes' : 'Add medication'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
