import { InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes, ReactNode } from 'react';

const baseField = 'w-full px-4 py-2.5 text-sm rounded-xl border border-slate-300 bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500/40 focus:border-teal-500 transition-all';

export function Input({ label, error, className = '', ...rest }: InputHTMLAttributes<HTMLInputElement> & { label?: string; error?: string }) {
  return (
    <label className="block">
      {label && <span className="block text-sm font-medium text-slate-700 mb-1.5">{label}</span>}
      <input className={`${baseField} ${error ? 'border-rose-400 focus:ring-rose-500/40 focus:border-rose-500' : ''} ${className}`} {...rest} />
      {error && <span className="block text-xs text-rose-600 mt-1">{error}</span>}
    </label>
  );
}

export function Textarea({ label, error, className = '', ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement> & { label?: string; error?: string }) {
  return (
    <label className="block">
      {label && <span className="block text-sm font-medium text-slate-700 mb-1.5">{label}</span>}
      <textarea className={`${baseField} resize-y min-h-[80px] ${error ? 'border-rose-400' : ''} ${className}`} {...rest} />
      {error && <span className="block text-xs text-rose-600 mt-1">{error}</span>}
    </label>
  );
}

export function Select({ label, error, children, className = '', ...rest }: SelectHTMLAttributes<HTMLSelectElement> & { label?: string; error?: string }) {
  return (
    <label className="block">
      {label && <span className="block text-sm font-medium text-slate-700 mb-1.5">{label}</span>}
      <select className={`${baseField} ${error ? 'border-rose-400' : ''} ${className}`} {...rest}>
        {children}
      </select>
      {error && <span className="block text-xs text-rose-600 mt-1">{error}</span>}
    </label>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="block text-sm font-medium text-slate-700 mb-1.5">{label}</span>
      {children}
      {hint && <span className="block text-xs text-slate-400 mt-1">{hint}</span>}
    </label>
  );
}
