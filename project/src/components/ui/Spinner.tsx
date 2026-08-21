import { Loader2 } from 'lucide-react';

export function Spinner({ className = 'w-5 h-5 text-teal-600' }: { className?: string }) {
  return <Loader2 className={`animate-spin ${className}`} />;
}

export function FullPageLoader({ label = 'Loading...' }: { label?: string }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-3 bg-slate-50">
      <Loader2 className="w-8 h-8 animate-spin text-teal-600" />
      <p className="text-sm text-slate-500">{label}</p>
    </div>
  );
}
