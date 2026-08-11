import { supabase, MedicineDb } from './supabase';

export type MedicineValidationResult = {
  valid: boolean;
  medicine: MedicineDb | null;
  suggestions: MedicineDb[];
};

export async function validateMedicineName(name: string): Promise<MedicineValidationResult> {
  const trimmed = name.trim();
  if (!trimmed) return { valid: false, medicine: null, suggestions: [] };

  const { data: exact } = await supabase
    .from('medicines_db')
    .select('*')
    .ilike('name', trimmed)
    .maybeSingle();

  if (exact) {
    return { valid: true, medicine: exact as MedicineDb, suggestions: [] };
  }

  const { data: genericMatch } = await supabase
    .from('medicines_db')
    .select('*')
    .ilike('generic_name', trimmed)
    .maybeSingle();

  if (genericMatch) {
    return { valid: true, medicine: genericMatch as MedicineDb, suggestions: [] };
  }

  const { data: suggestions } = await supabase
    .from('medicines_db')
    .select('*')
    .or(`name.ilike.%${trimmed}%,generic_name.ilike.%${trimmed}%`)
    .limit(8);

  return {
    valid: false,
    medicine: null,
    suggestions: (suggestions as MedicineDb[]) || [],
  };
}

export async function searchMedicines(query: string): Promise<MedicineDb[]> {
  if (!query.trim()) return [];
  const { data, error } = await supabase
    .from('medicines_db')
    .select('*')
    .or(`name.ilike.%${query}%,generic_name.ilike.%${query}%`)
    .order('name')
    .limit(20);

  if (error) {
    console.error('Error searching medicines:', error.message);
    return [];
  }
  return (data as MedicineDb[]) || [];
}

export async function getAllMedicines(): Promise<MedicineDb[]> {
  const { data, error } = await supabase
    .from('medicines_db')
    .select('*')
    .order('name');

  if (error) {
    console.error('Error fetching medicines:', error.message);
    return [];
  }
  return (data as MedicineDb[]) || [];
}

function getLevenshteinDistance(a: string, b: string): number {
  const tmp: number[][] = [];
  for (let i = 0; i <= a.length; i++) {
    tmp[i] = [i];
  }
  for (let j = 0; j <= b.length; j++) {
    tmp[0][j] = j;
  }
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      tmp[i][j] = Math.min(
        tmp[i - 1][j] + 1,
        tmp[i][j - 1] + 1,
        tmp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
  }
  return tmp[a.length][b.length];
}

export function fuzzyRatio(a: string, b: string): number {
  const dist = getLevenshteinDistance(a.toLowerCase().trim(), b.toLowerCase().trim());
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 100;
  return Math.round((1 - dist / maxLen) * 100);
}

export type ValidationResult = {
  matchedName: string;
  status: 'Verified' | 'Needs Review' | 'Not Found';
  confidence: number;
  medicineDb: MedicineDb | null;
};

export async function validateWithMedicineMaster(name: string, geminiConfidence: number): Promise<ValidationResult> {
  const trimmed = name.trim();
  if (!trimmed) {
    return { matchedName: name, status: 'Not Found', confidence: 0, medicineDb: null };
  }

  // Fetch all medicines from DB
  const allMeds = await getAllMedicines();
  let bestMatch: MedicineDb | null = null;
  let bestScore = 0;

  for (const med of allMeds) {
    // Check match on name
    const score = fuzzyRatio(trimmed, med.name);
    if (score > bestScore) {
      bestScore = score;
      bestMatch = med;
    }
    // Also check match on generic name
    if (med.generic_name) {
      const genScore = fuzzyRatio(trimmed, med.generic_name);
      if (genScore > bestScore) {
        bestScore = genScore;
        bestMatch = med;
      }
    }
  }

  console.log(`Fuzzy matching: "${trimmed}" matched with "${bestMatch?.name}" (Score: ${bestScore}%)`);

  // Verification threshold (mimicking RapidFuzz spelling correction)
  if (bestScore >= 80 && bestMatch) {
    const status = (bestScore >= 90 && geminiConfidence >= 80) ? 'Verified' : 'Needs Review';
    return {
      matchedName: bestMatch.name,
      status,
      confidence: bestScore,
      medicineDb: bestMatch
    };
  }

  // If score is too low, keep original name but mark as 'Needs Review' or 'Not Found'
  return {
    matchedName: name,
    status: 'Needs Review',
    confidence: geminiConfidence,
    medicineDb: null
  };
}
