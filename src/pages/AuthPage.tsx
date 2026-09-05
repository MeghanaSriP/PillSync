import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Pill, Mail, Lock, User as UserIcon, Heart, Activity } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/FormField';
import { Alert } from '@/components/ui/Alert';

export function AuthPage() {
  const { signIn, signUp } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState<'patient' | 'caregiver'>('patient');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    if (mode === 'signup') {
      if (password.length < 6) {
        setError('Password must be at least 6 characters');
        setLoading(false);
        return;
      }
      const { error: err } = await signUp(email, password, fullName, role);
      if (err) setError(err);
      else navigate('/app/dashboard', { replace: true });
    } else {
      const { error: err } = await signIn(email, password);
      if (err) setError(err);
      else navigate('/app/dashboard', { replace: true });
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex">
      {/* Left brand panel */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-teal-600 via-teal-700 to-cyan-800 relative overflow-hidden">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-20 left-20 w-72 h-72 rounded-full bg-white blur-3xl" />
          <div className="absolute bottom-20 right-20 w-96 h-96 rounded-full bg-cyan-300 blur-3xl" />
        </div>
        <div className="relative z-10 flex flex-col justify-between p-12 text-white">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-white/15 backdrop-blur flex items-center justify-center">
              <Pill className="w-6 h-6" />
            </div>
            <span className="text-xl font-semibold">PillSync</span>
          </div>
          <div className="space-y-6 max-w-md">
            <h1 className="text-4xl font-bold leading-tight">Smart medication management for better health</h1>
            <p className="text-teal-100 text-lg leading-relaxed">
              Track your medications, never miss a dose, and get intelligent refill reminders powered by AI-driven adherence analytics.
            </p>
            <div className="space-y-3 pt-4">
              {[
                { icon: Pill, text: 'AI prescription scanning & medicine validation' },
                { icon: Activity, text: 'Real-time adherence tracking & analytics' },
                { icon: Heart, text: 'Caregiver monitoring for loved ones' },
              ].map((f, i) => (
                <div key={i} className="flex items-center gap-3 text-teal-50">
                  <div className="w-9 h-9 rounded-lg bg-white/10 flex items-center justify-center">
                    <f.icon className="w-5 h-5" />
                  </div>
                  <span className="text-sm">{f.text}</span>
                </div>
              ))}
            </div>
          </div>
          <p className="text-teal-200 text-sm">Trusted for chronic disease management & elderly care</p>
        </div>
      </div>

      {/* Right form panel */}
      <div className="flex-1 flex items-center justify-center p-6 bg-slate-50">
        <div className="w-full max-w-md">
          <div className="lg:hidden flex items-center justify-center gap-2 mb-8">
            <div className="w-10 h-10 rounded-xl bg-teal-600 flex items-center justify-center text-white">
              <Pill className="w-5 h-5" />
            </div>
            <span className="text-xl font-semibold text-slate-900">PillSync</span>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
            <h2 className="text-2xl font-bold text-slate-900 mb-1">
              {mode === 'signin' ? 'Welcome back' : 'Create your account'}
            </h2>
            <p className="text-sm text-slate-500 mb-6">
              {mode === 'signin' ? 'Sign in to manage your medications' : 'Start tracking your health journey'}
            </p>

            {error && <div className="mb-4"><Alert tone="error">{error}</Alert></div>}

            <form onSubmit={handleSubmit} className="space-y-4">
              {mode === 'signup' && (
                <>
                  <Input
                    label="Full name"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Jane Doe"
                    required
                  />
                  <div>
                    <span className="block text-sm font-medium text-slate-700 mb-1.5">I am a...</span>
                    <div className="grid grid-cols-2 gap-3">
                      {(['patient', 'caregiver'] as const).map((r) => (
                        <button
                          key={r}
                          type="button"
                          onClick={() => setRole(r)}
                          className={`px-4 py-2.5 rounded-xl border text-sm font-medium transition-all ${
                            role === r
                              ? 'border-teal-500 bg-teal-50 text-teal-700 ring-2 ring-teal-500/20'
                              : 'border-slate-300 text-slate-600 hover:border-slate-400'
                          }`}
                        >
                          {r === 'patient' ? 'Patient' : 'Caregiver'}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}
              <Input
                label="Email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
              />
              <Input
                label="Password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
              />
              <Button type="submit" loading={loading} className="w-full" size="lg">
                {mode === 'signin' ? 'Sign in' : 'Create account'}
              </Button>
            </form>

            <div className="mt-6 text-center text-sm text-slate-500">
              {mode === 'signin' ? (
                <>Don't have an account?{' '}
                  <button onClick={() => { setMode('signup'); setError(null); }} className="text-teal-600 font-medium hover:underline">
                    Sign up
                  </button>
                </>
              ) : (
                <>Already have an account?{' '}
                  <button onClick={() => { setMode('signin'); setError(null); }} className="text-teal-600 font-medium hover:underline">
                    Sign in
                  </button>
                </>
              )}
            </div>
          </div>
          <p className="text-center text-xs text-slate-400 mt-6">
            By continuing you agree to our terms. Not medical advice — consult your doctor.
          </p>
        </div>
      </div>
    </div>
  );
}
