export const PILL_COLORS: Record<string, { bg: string; text: string; ring: string; dot: string; gradient: string }> = {
  emerald: { bg: 'bg-emerald-500', text: 'text-emerald-700', ring: 'ring-emerald-200', dot: 'bg-emerald-500', gradient: 'from-emerald-400 to-emerald-600' },
  blue: { bg: 'bg-blue-500', text: 'text-blue-700', ring: 'ring-blue-200', dot: 'bg-blue-500', gradient: 'from-blue-400 to-blue-600' },
  amber: { bg: 'bg-amber-500', text: 'text-amber-700', ring: 'ring-amber-200', dot: 'bg-amber-500', gradient: 'from-amber-400 to-amber-600' },
  rose: { bg: 'bg-rose-500', text: 'text-rose-700', ring: 'ring-rose-200', dot: 'bg-rose-500', gradient: 'from-rose-400 to-rose-600' },
  violet: { bg: 'bg-violet-500', text: 'text-violet-700', ring: 'ring-violet-200', dot: 'bg-violet-500', gradient: 'from-violet-400 to-violet-600' },
  cyan: { bg: 'bg-cyan-500', text: 'text-cyan-700', ring: 'ring-cyan-200', dot: 'bg-cyan-500', gradient: 'from-cyan-400 to-cyan-600' },
  orange: { bg: 'bg-orange-500', text: 'text-orange-700', ring: 'ring-orange-200', dot: 'bg-orange-500', gradient: 'from-orange-400 to-orange-600' },
  teal: { bg: 'bg-teal-500', text: 'text-teal-700', ring: 'ring-teal-200', dot: 'bg-teal-500', gradient: 'from-teal-400 to-teal-600' },
};

export function getPillColor(color: string) {
  return PILL_COLORS[color] || PILL_COLORS.emerald;
}

export const COLOR_OPTIONS = Object.keys(PILL_COLORS);
