import { Medication, DoseLog } from './supabase';

export type RefillPrediction = {
  daysRemaining: number | null;
  refillDate: string | null;
  isLowStock: boolean;
  isCritical: boolean;
  dailyConsumption: number;
  confidence: 'high' | 'medium' | 'low';
};

export function predictRefill(medication: Medication, doseLogs: DoseLog[]): RefillPrediction {
  const stock = medication.stock_quantity;
  const threshold = medication.refill_threshold;

  const takenLogs = doseLogs.filter(
    (log) => log.medication_id === medication.id && log.status === 'taken'
  );

  if (stock <= 0) {
    return {
      daysRemaining: 0,
      refillDate: new Date().toISOString().split('T')[0],
      isLowStock: true,
      isCritical: true,
      dailyConsumption: 0,
      confidence: 'low',
    };
  }

  if (takenLogs.length === 0) {
    const isLow = stock <= threshold;
    const isCritical = stock <= Math.ceil(threshold / 2);
    return {
      daysRemaining: null,
      refillDate: null,
      isLowStock: isLow,
      isCritical,
      dailyConsumption: 0,
      confidence: 'low',
    };
  }

  const sorted = [...takenLogs].sort(
    (a, b) => new Date(a.scheduled_time).getTime() - new Date(b.scheduled_time).getTime()
  );

  const first = new Date(sorted[0].scheduled_time);
  const last = new Date(sorted[sorted.length - 1].scheduled_time);
  const spanDays = Math.max(1, Math.ceil((last.getTime() - first.getTime()) / (1000 * 60 * 60 * 24)));
  const dailyConsumption = takenLogs.length / spanDays;

  if (dailyConsumption <= 0) {
    return {
      daysRemaining: null,
      refillDate: null,
      isLowStock: stock <= threshold,
      isCritical: stock <= Math.ceil(threshold / 2),
      dailyConsumption: 0,
      confidence: 'low',
    };
  }

  const daysRemaining = Math.floor(stock / dailyConsumption);
  const refillDate = new Date();
  refillDate.setDate(refillDate.getDate() + daysRemaining);

  const confidence = takenLogs.length >= 14 ? 'high' : takenLogs.length >= 5 ? 'medium' : 'low';
  const isLowStock = stock <= threshold;
  const isCritical = stock <= Math.ceil(threshold / 2);

  return {
    daysRemaining,
    refillDate: refillDate.toISOString().split('T')[0],
    isLowStock,
    isCritical,
    dailyConsumption: Math.round(dailyConsumption * 10) / 10,
    confidence,
  };
}

export function getAdherenceRate(doseLogs: DoseLog[], days = 30): number {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);

  const relevant = doseLogs.filter(
    (log) => new Date(log.scheduled_time) >= cutoff && log.status !== 'pending'
  );

  if (relevant.length === 0) return 0;

  const taken = relevant.filter((log) => log.status === 'taken').length;
  return Math.round((taken / relevant.length) * 100);
}
