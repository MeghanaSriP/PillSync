import { ReactNode } from 'react';
import { CheckCircle2, AlertCircle, Info, XCircle, X } from 'lucide-react';

type Tone = 'success' | 'warning' | 'error' | 'info';

const config: Record<Tone, { icon: typeof Info; bg: string; border: string; text: string; iconColor: string }> = {
  success: { icon: CheckCircle2, bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-800', iconColor: 'text-emerald-500' },
  warning: { icon: AlertCircle, bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-800', iconColor: 'text-amber-500' },
  error: { icon: XCircle, bg: 'bg-rose-50', border: 'border-rose-200', text: 'text-rose-800', iconColor: 'text-rose-500' },
  info: { icon: Info, bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-800', iconColor: 'text-blue-500' },
};

export function Alert({
  tone = 'info',
  title,
  children,
  onClose,
}: {
  tone?: Tone;
  title?: string;
  children: ReactNode;
  onClose?: () => void;
}) {
  const { icon: Icon, bg, border, text, iconColor } = config[tone];
  return (
    <div className={`flex items-start gap-3 rounded-xl border ${bg} ${border} ${text} px-4 py-3`}>
      <Icon className={`w-5 h-5 flex-shrink-0 mt-0.5 ${iconColor}`} />
      <div className="flex-1 text-sm">
        {title && <p className="font-semibold mb-0.5">{title}</p>}
        <div className={title ? 'text-opacity-90' : ''}>{children}</div>
      </div>
      {onClose && (
        <button onClick={onClose} className="p-0.5 rounded hover:bg-black/5 transition-colors">
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}
