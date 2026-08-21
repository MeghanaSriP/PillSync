import { useState, useRef, useEffect } from 'react';
import { FileText, Upload, ScanLine, Trash2, Plus, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { supabase, Prescription, MedicineDb } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { usePatientContext } from '@/context/PatientContext';
import { useNotifications } from '@/context/NotificationContext';
import { Card, CardBody } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { Alert } from '@/components/ui/Alert';
import { EmptyState } from '@/components/ui/EmptyState';
import { Spinner } from '@/components/ui/Spinner';
import { searchMedicines, validateWithMedicineMaster } from '@/lib/medications';
import { fmtDate } from '@/lib/dates';

type ExtractedMed = {
  name: string;
  strength?: string | null;
  form?: string | null;
  quantity?: number | string | null;
  frequency?: string | null;
  timing?: string | null;
  duration?: string | null;
  instructions?: string | null;
  confidence?: 'high' | 'uncertain' | null;
  needs_verification?: boolean | null;
};

export function PrescriptionsPage() {
  const { user } = useAuth();
  const { effectiveUserId } = usePatientContext();
  const { addNotification } = useNotifications();
  const [prescriptions, setPrescriptions] = useState<Prescription[]>([]);
  const [loading, setLoading] = useState(true);
  const [showUpload, setShowUpload] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadedUrl, setUploadedUrl] = useState<string | null>(null);
  const [ocrText, setOcrText] = useState('');
  const [extractedMeds, setExtractedMeds] = useState<ExtractedMed[]>([]);
  const [doctor, setDoctor] = useState('');
  const [prescDate, setPrescDate] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    if (!user || !effectiveUserId) return;
    setLoading(true);
    const { data } = await supabase.from('prescriptions').select('*').eq('user_id', effectiveUserId).order('created_at', { ascending: false });
    setPrescriptions((data as Prescription[]) || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, [effectiveUserId]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { setError('Please select an image file'); return; }
    setSelectedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
    setError(null);
    setOcrText('');
    setExtractedMeds([]);
    setUploadedUrl(null);
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const base64 = (reader.result as string).split(',')[1];
        resolve(base64);
      };
      reader.onerror = (error) => reject(error);
    });
  };

  const runOcr = async () => {
    if (!selectedFile || !user) return;
    setUploading(true);
    setError(null);
    setOcrText('');
    setExtractedMeds([]);
    setStatusMessage('Uploading prescription...');

    // Staggered status updates
    const statusTimers: number[] = [];
    const changeStatus = (msg: string, delay: number) => {
      const timer = window.setTimeout(() => {
        setStatusMessage(msg);
      }, delay);
      statusTimers.push(timer);
    };

    try {
      // 1. Convert file to base64
      const base64 = await fileToBase64(selectedFile);
      const ext = selectedFile.name.split('.').pop() || 'png';

      // Trigger OCR status updates
      setStatusMessage('Scanning prescription...');
      changeStatus('Reading prescription...', 3000);
      changeStatus('Identifying medicines...', 6000);

      const response = await fetch('http://localhost:3001/api/prescription-ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileBase64: base64,
          fileExt: ext,
          fileName: selectedFile.name
        }),
      });
      
      let data;
      let functionError = null;
      if (!response.ok) {
        try {
          const errRes = await response.json();
          functionError = new Error(errRes.error || response.statusText);
        } catch (e) {
          functionError = new Error(response.statusText);
        }
      } else {
        data = await response.json();
      }

      // Clear pending status changes
      statusTimers.forEach(t => window.clearTimeout(t));

      if (functionError) {
        console.error("Gemini AI Backend Error details:", functionError);
        throw new Error(`AI Service Error: ${functionError.message || JSON.stringify(functionError)}`);
      }

      if (data?.error) {
        console.error("Gemini AI API Error details:", data.error);
        throw new Error(`Unable to analyze this prescription: ${data.error}`);
      }

      if (!data?.medicines || data.medicines.length === 0) {
        throw new Error('No medicines could be extracted from this image. Please check the photo clarity or add medicines manually.');
      }

      // Generate public URL using the returned secure file path or base64 data URL
      if (data.filePath) {
        const { data: urlData } = supabase.storage.from('prescriptions').getPublicUrl(data.filePath);
        setUploadedUrl(urlData.publicUrl);
      } else {
        setUploadedUrl(`data:${selectedFile.type || 'image/png'};base64,${base64}`);
      }

      const notes = data?.prescription_notes || 'Prescription analyzed successfully.';
      setOcrText(notes);

      // Perform Medicine Master validation & spelling correction (Step 5/6)
      const parsedMeds: ExtractedMed[] = [];
      for (const item of (data.medicines || [])) {
        const itemName = item.name || item.medicine_name || '';
        const valResult = await validateWithMedicineMaster(itemName, item.confidence || 50);
        
        // Timing summary e.g. "Morning, Night" or "Morning"
        const timingParts: string[] = [];
        if (item.morning) timingParts.push("Morning");
        if (item.afternoon) timingParts.push("Afternoon");
        if (item.night) timingParts.push("Night");
        const timingStr = timingParts.join(", ") || item.timing || null;

        parsedMeds.push({
          name: valResult.matchedName, // Spelling corrected name
          strength: item.strength || null,
          form: item.form || item.dosage || null,
          quantity: item.quantity || null,
          frequency: item.frequency || null,
          timing: timingStr,
          duration: item.duration || null,
          instructions: item.instructions || null,
          confidence: valResult.status === 'Verified' ? 'high' : 'uncertain',
          needs_verification: valResult.status === 'Needs Review' || valResult.status === 'Not Found',
        });
      }

      setExtractedMeds(parsedMeds);
      setStatusMessage('Please review extracted medicines.');
    } catch (err: any) {
      statusTimers.forEach(t => window.clearTimeout(t));
      setError(err?.message || 'Could not process the image. Make sure it is a clear photo of a prescription.');
      console.error(err);
    }
    setUploading(false);
  };

  const verifyExtractedMeds = async () => {
    const verified: ExtractedMed[] = [];
    for (const med of extractedMeds) {
      const results = await searchMedicines(med.name);
      if (results.length > 0) {
        verified.push({ ...med, name: results[0].name });
      } else {
        verified.push(med);
      }
    }
    setExtractedMeds(verified);
  };

  const handleSave = async () => {
    if (!user || !effectiveUserId || !selectedFile) return;
    setUploading(true);
    setError(null);

    const { error: insertError } = await supabase.from('prescriptions').insert({
      user_id: effectiveUserId,
      medication_name: extractedMeds.map((m) => m.name).join(', '),
      extracted_text: ocrText,
      doctor: doctor.trim() || null,
      date: prescDate || null,
      image_url: uploadedUrl,
      status: 'processed',
    });

    if (insertError) { setError(insertError.message); setUploading(false); return; }

    await addNotification({
      type: 'system',
      title: 'Prescription processed',
      message: `Extracted ${extractedMeds.length} medicine(s) from your prescription.`,
      medication_id: null,
    });

    setUploading(false);
    resetForm();
    setShowUpload(false);
    load();
  };

  const resetForm = () => {
    setSelectedFile(null); setPreviewUrl(null); setOcrText(''); setExtractedMeds([]);
    setDoctor(''); setPrescDate(''); setUploadedUrl(null); setError(null);
    setStatusMessage('');
    if (fileRef.current) fileRef.current.value = '';
  };

  const handleDelete = async (p: Prescription) => {
    if (!confirm('Delete this prescription record?')) return;
    await supabase.from('prescriptions').delete().eq('id', p.id);
    load();
  };

  if (loading) {
    return <div className="flex justify-center py-20"><Spinner className="w-8 h-8 text-teal-600" /></div>;
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Prescriptions</h1>
          <p className="text-sm text-slate-500 mt-0.5">Scan and extract medicines from your prescriptions with OCR</p>
        </div>
        <Button onClick={() => setShowUpload(true)}>
          <Upload className="w-4 h-4" /> Upload prescription
        </Button>
      </div>

      {prescriptions.length === 0 ? (
        <Card>
          <EmptyState
            icon={<FileText className="w-7 h-7" />}
            title="No prescriptions scanned yet"
            description="Upload a photo of your prescription and we'll use OCR to extract the medicine names automatically."
            action={<Button onClick={() => setShowUpload(true)}><Upload className="w-4 h-4" /> Upload prescription</Button>}
          />
        </Card>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {prescriptions.map((p) => (
            <Card key={p.id} className="overflow-hidden">
              <CardBody>
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex items-center gap-3">
                    {p.image_url ? (
                      <img src={p.image_url} alt="Prescription" className="w-16 h-16 rounded-xl object-cover border border-slate-200" />
                    ) : (
                      <div className="w-16 h-16 rounded-xl bg-slate-100 flex items-center justify-center text-slate-400">
                        <FileText className="w-7 h-7" />
                      </div>
                    )}
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{p.doctor || 'Unknown doctor'}</p>
                      <p className="text-xs text-slate-500">{p.date ? fmtDate(p.date) : fmtDate(p.created_at)}</p>
                    </div>
                  </div>
                  <Badge color="emerald"><CheckCircle2 className="w-3 h-3" /> Processed</Badge>
                </div>
                {p.medication_name && (
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {p.medication_name.split(', ').map((m, i) => <Badge key={i} color="teal">{m}</Badge>)}
                  </div>
                )}
                {p.extracted_text && (
                  <details className="mt-2">
                    <summary className="text-xs text-slate-500 cursor-pointer hover:text-slate-700">View extracted text</summary>
                    <p className="mt-2 text-xs text-slate-500 bg-slate-50 rounded-lg p-3 max-h-32 overflow-y-auto whitespace-pre-wrap">{p.extracted_text}</p>
                  </details>
                )}
                <div className="flex justify-end mt-3 pt-3 border-t border-slate-100">
                  <Button size="sm" variant="ghost" className="text-rose-500 hover:bg-rose-50" onClick={() => handleDelete(p)}>
                    <Trash2 className="w-3.5 h-3.5" /> Delete
                  </Button>
                </div>
              </CardBody>
            </Card>
          ))}
        </div>
      )}

      {/* Upload modal */}
      <Modal open={showUpload} onClose={() => { setShowUpload(false); resetForm(); }} title="Upload & scan prescription" size="lg">
        <div className="space-y-5">
          {error && <Alert tone="error">{error}</Alert>}

          {!previewUrl ? (
            <button
              onClick={() => fileRef.current?.click()}
              className="w-full border-2 border-dashed border-slate-300 rounded-2xl p-10 text-center hover:border-teal-400 hover:bg-teal-50/30 transition-all"
            >
              <Upload className="w-10 h-10 text-slate-400 mx-auto mb-3" />
              <p className="text-sm font-medium text-slate-700">Click to upload a prescription image</p>
              <p className="text-xs text-slate-400 mt-1">PNG, JPG up to 10MB</p>
            </button>
          ) : (
            <div className="space-y-4">
              <div className="relative rounded-xl overflow-hidden border border-slate-200">
                <img src={previewUrl} alt="Preview" className="w-full max-h-64 object-contain bg-slate-50" />
                <button onClick={() => { resetForm(); }} className="absolute top-2 right-2 p-1.5 rounded-lg bg-white/90 shadow text-slate-500 hover:text-rose-500">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>

              {!ocrText && (
                <Button onClick={runOcr} loading={uploading} className="w-full" size="lg">
                  <ScanLine className="w-5 h-5" /> Scan Prescription
                </Button>
              )}

              {uploading && (
                <div className="flex flex-col items-center justify-center gap-2 py-4 text-sm text-slate-600 border border-teal-100 bg-teal-50/20 rounded-xl animate-pulse">
                  <Loader2 className="w-5 h-5 animate-spin text-teal-600" />
                  <span>{statusMessage}</span>
                </div>
              )}

              {ocrText && (
                <>
                  <div className="p-4 sm:p-6 bg-slate-50 border-b border-slate-100">
                    <Alert tone="success" title="Prescription analyzed successfully">
                      Gemini identified {extractedMeds.length} medicine(s). Please verify the details before saving.
                    </Alert>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-slate-700">Extracted medicines</span>
                      <button onClick={verifyExtractedMeds} className="text-xs text-teal-600 font-medium hover:underline">Verify all</button>
                    </div>
                    <div className="space-y-2">
                      {extractedMeds.map((med, i) => (
                        <ExtractedMedRow key={i} med={med} onChange={(m) => setExtractedMeds((prev) => prev.map((x, idx) => idx === i ? m : x))} onRemove={() => setExtractedMeds((prev) => prev.filter((_, idx) => idx !== i))} />
                      ))}
                    </div>
                    <button onClick={() => setExtractedMeds((prev) => [...prev, { name: '' }])} className="mt-2 text-sm text-teal-600 font-medium hover:underline flex items-center gap-1">
                      <Plus className="w-4 h-4" /> Add medicine
                    </button>
                  </div>

                  <div className="grid sm:grid-cols-2 gap-4">
                    <input className="px-4 py-2.5 text-sm rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-teal-500/40 focus:border-teal-500" placeholder="Doctor name" value={doctor} onChange={(e) => setDoctor(e.target.value)} />
                    <input type="date" className="px-4 py-2.5 text-sm rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-teal-500/40 focus:border-teal-500" value={prescDate} onChange={(e) => setPrescDate(e.target.value)} />
                  </div>

                  <details>
                    <summary className="text-xs text-slate-500 cursor-pointer">View raw OCR text</summary>
                    <p className="mt-2 text-xs text-slate-500 bg-slate-50 rounded-lg p-3 max-h-32 overflow-y-auto whitespace-pre-wrap">{ocrText}</p>
                  </details>

                  <Button onClick={handleSave} loading={uploading} className="w-full" size="lg">
                    <CheckCircle2 className="w-5 h-5" /> Save prescription
                  </Button>
                </>
              )}
            </div>
          )}
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFileSelect} />
        </div>
      </Modal>
    </div>
  );
}

function ExtractedMedRow({ med, onChange, onRemove }: { med: ExtractedMed; onChange: (m: ExtractedMed) => void; onRemove: () => void }) {
  const [verified, setVerified] = useState<boolean | null>(null);
  const [suggestions, setSuggestions] = useState<MedicineDb[]>([]);
  const [isExpanded, setIsExpanded] = useState(false);

  const verify = async () => {
    if (!med.name.trim()) return;
    const results = await searchMedicines(med.name);
    if (results.length > 0) {
      setVerified(true);
      setSuggestions(results.slice(0, 3));
    } else {
      setVerified(false);
      setSuggestions([]);
    }
  };

  const isUncertain = med.confidence === 'uncertain' || med.name.toUpperCase() === 'UNKNOWN' || med.needs_verification === true;

  return (
    <div className="p-3 rounded-xl border border-slate-200 bg-white shadow-sm space-y-3 relative">
      {/* Top Row: Basic Info */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex-1 min-w-[200px]">
          <input
            value={med.name}
            onChange={(e) => { onChange({ ...med, name: e.target.value, confidence: 'high' }); setVerified(null); setSuggestions([]); }}
            placeholder="Medicine name"
            className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-teal-500/30 font-semibold"
          />
        </div>
        <div className="w-24">
          <input
            value={med.strength || ''}
            onChange={(e) => onChange({ ...med, strength: e.target.value })}
            placeholder="Strength"
            className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-teal-500/30"
          />
        </div>
        <div className="w-24">
          <input
            value={med.form || ''}
            onChange={(e) => onChange({ ...med, form: e.target.value })}
            placeholder="Form"
            className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-teal-500/30"
          />
        </div>
        <div className="flex items-center gap-1">
          <button onClick={verify} className="p-2 rounded-lg text-slate-400 hover:bg-teal-50 hover:text-teal-600" title="Verify in database">
            <ScanLine className="w-4 h-4" />
          </button>
          {verified === true && <span title="Verified in database"><CheckCircle2 className="w-4 h-4 text-emerald-500" /></span>}
          {verified === false && <span title="Not found in database"><AlertCircle className="w-4 h-4 text-amber-500" /></span>}
          <button onClick={() => setIsExpanded(!isExpanded)} className="p-2 rounded-lg text-slate-400 hover:bg-slate-50 hover:text-slate-600" title="Toggle extra details">
            <FileText className="w-4 h-4" />
          </button>
          <button onClick={onRemove} className="p-2 rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-500">
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Verification Status Badge */}
      {isUncertain && (
        <div className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
          <AlertCircle className="w-3.5 h-3.5" />
          <span>Needs verification</span>
        </div>
      )}

      {/* Suggestions Dropdown */}
      {suggestions.length > 0 && (
        <div className="absolute left-3 right-3 bg-white border border-slate-200 rounded-lg shadow-lg p-2 z-10 -mt-2">
          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider px-2 mb-1">Database Suggestions</p>
          {suggestions.map((s) => (
            <button key={s.id} onClick={() => { onChange({ ...med, name: s.name, form: s.form || med.form || null }); setVerified(true); setSuggestions([]); }} className="block w-full text-left px-2 py-1.5 text-xs rounded hover:bg-teal-50">
              {s.name} <span className="text-slate-400">({s.generic_name})</span>
            </button>
          ))}
        </div>
      )}

      {/* Collapsible details panel */}
      {isExpanded && (
        <div className="grid sm:grid-cols-2 md:grid-cols-4 gap-3 pt-3 border-t border-slate-100 bg-slate-50/40 p-3 rounded-lg">
          <div>
            <label className="block text-[10px] font-semibold text-slate-500 uppercase mb-1">Quantity</label>
            <input
              type="text"
              value={med.quantity || ''}
              onChange={(e) => onChange({ ...med, quantity: e.target.value })}
              placeholder="e.g. 10"
              className="w-full px-2 py-1.5 text-xs rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-teal-500/30"
            />
          </div>
          <div>
            <label className="block text-[10px] font-semibold text-slate-500 uppercase mb-1">Frequency</label>
            <input
              type="text"
              value={med.frequency || ''}
              onChange={(e) => onChange({ ...med, frequency: e.target.value })}
              placeholder="e.g. twice daily"
              className="w-full px-2 py-1.5 text-xs rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-teal-500/30"
            />
          </div>
          <div>
            <label className="block text-[10px] font-semibold text-slate-500 uppercase mb-1">Timing</label>
            <input
              type="text"
              value={med.timing || ''}
              onChange={(e) => onChange({ ...med, timing: e.target.value })}
              placeholder="e.g. after food"
              className="w-full px-2 py-1.5 text-xs rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-teal-500/30"
            />
          </div>
          <div>
            <label className="block text-[10px] font-semibold text-slate-500 uppercase mb-1">Duration</label>
            <input
              type="text"
              value={med.duration || ''}
              onChange={(e) => onChange({ ...med, duration: e.target.value })}
              placeholder="e.g. 5 days"
              className="w-full px-2 py-1.5 text-xs rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-teal-500/30"
            />
          </div>
          <div className="sm:col-span-2 md:col-span-4">
            <label className="block text-[10px] font-semibold text-slate-500 uppercase mb-1">Instructions</label>
            <textarea
              value={med.instructions || ''}
              onChange={(e) => onChange({ ...med, instructions: e.target.value })}
              placeholder="e.g. Take with warm water"
              rows={1}
              className="w-full px-2 py-1.5 text-xs rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-teal-500/30 resize-none"
            />
          </div>
        </div>
      )}
    </div>
  );
}
