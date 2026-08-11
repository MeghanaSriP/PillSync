import { useMemo } from 'react';

const HOURS_12 = Array.from({ length: 12 }, (_, i) => i + 1);
const MINUTES = Array.from({ length: 60 }, (_, i) => i);

function to24h(hour12: number, ampm: 'AM' | 'PM'): string {
  let h = hour12 % 12;
  if (ampm === 'PM') h += 12;
  return `${String(h).padStart(2, '0')}`;
}

function from24h(value: string): { hour: number; minute: number; ampm: 'AM' | 'PM' } {
  const [hStr, mStr] = value.split(':');
  const h = Number(hStr);
  const minute = Number(mStr);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hour = h % 12 === 0 ? 12 : h % 12;
  return { hour, minute, ampm };
}

export function TimeInput({
  value,
  onChange,
  className = '',
}: {
  value: string;
  onChange: (v: string) => void;
  className?: string;
}) {
  const { hour, minute, ampm } = useMemo(() => from24h(value || '08:00'), [value]);

  const update = (next: Partial<{ hour: number; minute: number; ampm: 'AM' | 'PM' }>) => {
    const h = next.hour ?? hour;
    const m = next.minute ?? minute;
    const ap = next.ampm ?? ampm;
    onChange(`${to24h(h, ap)}:${String(m).padStart(2, '0')}`);
  };

  const selectClass =
    'px-3 py-2.5 text-sm rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-teal-500/40 focus:border-teal-500 bg-white cursor-pointer';

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <select
        value={hour}
        onChange={(e) => update({ hour: Number(e.target.value) })}
        className={selectClass}
        aria-label="Hour"
      >
        {HOURS_12.map((h) => (
          <option key={h} value={h}>{h}</option>
        ))}
      </select>
      <span className="text-slate-400 font-medium">:</span>
      <select
        value={minute}
        onChange={(e) => update({ minute: Number(e.target.value) })}
        className={selectClass}
        aria-label="Minute"
      >
        {MINUTES.map((m) => (
          <option key={m} value={m}>{String(m).padStart(2, '0')}</option>
        ))}
      </select>
      <div className="flex rounded-xl border border-slate-300 overflow-hidden">
        {(['AM', 'PM'] as const).map((ap) => (
          <button
            key={ap}
            type="button"
            onClick={() => update({ ampm: ap })}
            className={`px-3 py-2.5 text-sm font-medium transition-colors ${
              ampm === ap ? 'bg-teal-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'
            }`}
          >
            {ap}
          </button>
        ))}
      </div>
    </div>
  );
}
