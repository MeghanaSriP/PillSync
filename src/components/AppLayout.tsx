import { useState, useRef, useEffect } from 'react';
import { useNavigate, useLocation, Outlet } from 'react-router-dom';
import {
  LayoutDashboard, Pill, CalendarClock, BarChart3, Users, Settings,
  Bell, LogOut, Menu, X, FileText, ChevronDown, ScanLine,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useNotifications } from '@/context/NotificationContext';
import { fmtDate } from '@/lib/dates';
import { Chatbot } from '@/components/Chatbot';

const navItems = [
  { to: '/app/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/app/medications', label: 'Medications', icon: Pill },
  { to: '/app/prescriptions', label: 'Prescriptions', icon: ScanLine },
  { to: '/app/schedule', label: 'Schedule', icon: CalendarClock },
  { to: '/app/history', label: 'History', icon: FileText },
  { to: '/app/analytics', label: 'Analytics', icon: BarChart3 },
  { to: '/app/caregivers', label: 'Caregivers', icon: Users },
  { to: '/app/settings', label: 'Settings', icon: Settings },
];

export function AppLayout() {
  const { profile, signOut } = useAuth();
  const { notifications, unreadCount, markRead, markAllRead } = useNotifications();
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) setNotifOpen(false);
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) setProfileOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleSignOut = async () => {
    await signOut();
    navigate('/');
  };

  const initials = (profile?.full_name || 'U')
    .split(' ')
    .map((n) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  const NavLinks = () => (
    <>
      {navItems.map((item) => {
        const active = location.pathname === item.to;
        const Icon = item.icon;
        return (
          <button
            key={item.to}
            onClick={() => { navigate(item.to); setSidebarOpen(false); }}
            className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all ${
              active
                ? 'bg-teal-50 text-teal-700'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            <Icon className={`w-5 h-5 ${active ? 'text-teal-600' : 'text-slate-400'}`} />
            {item.label}
          </button>
        );
      })}
    </>
  );

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex w-64 flex-col fixed inset-y-0 left-0 bg-white border-r border-slate-200 z-30">
        <div className="flex items-center gap-2.5 px-6 h-16 border-b border-slate-100">
          <div className="w-9 h-9 rounded-xl bg-teal-600 flex items-center justify-center text-white">
            <Pill className="w-5 h-5" />
          </div>
          <span className="text-lg font-semibold text-slate-900">PillSync</span>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          <NavLinks />
        </nav>
        <div className="p-3 border-t border-slate-100">
          <div className="flex items-center gap-3 px-3 py-2">
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-teal-400 to-cyan-500 flex items-center justify-center text-white text-sm font-semibold">
              {initials}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-800 truncate">{profile?.full_name}</p>
              <p className="text-xs text-slate-400 capitalize">{profile?.role}</p>
            </div>
          </div>
        </div>
      </aside>

      {/* Mobile sidebar */}
      {sidebarOpen && (
        <div className="lg:hidden fixed inset-0 z-40">
          <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={() => setSidebarOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 bg-white flex flex-col animate-[slideRight_0.2s_ease-out]">
            <div className="flex items-center justify-between px-6 h-16 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-teal-600 flex items-center justify-center text-white">
                  <Pill className="w-5 h-5" />
                </div>
                <span className="text-lg font-semibold text-slate-900">PillSync</span>
              </div>
              <button onClick={() => setSidebarOpen(false)} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100">
                <X className="w-5 h-5" />
              </button>
            </div>
            <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
              <NavLinks />
            </nav>
          </aside>
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 lg:ml-64 flex flex-col min-h-screen">
        {/* Top bar */}
        <header className="sticky top-0 z-20 h-16 bg-white/80 backdrop-blur border-b border-slate-200 flex items-center justify-between px-4 lg:px-8">
          <div className="flex items-center gap-3">
            <button onClick={() => setSidebarOpen(true)} className="lg:hidden p-2 rounded-lg text-slate-500 hover:bg-slate-100">
              <Menu className="w-5 h-5" />
            </button>
            <div className="lg:hidden flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-teal-600 flex items-center justify-center text-white">
                <Pill className="w-4 h-4" />
              </div>
              <span className="font-semibold text-slate-900">PillSync</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Notifications */}
            <div ref={notifRef} className="relative">
              <button
                onClick={() => setNotifOpen((v) => !v)}
                className="relative p-2.5 rounded-xl text-slate-500 hover:bg-slate-100 transition-colors"
              >
                <Bell className="w-5 h-5" />
                {unreadCount > 0 && (
                  <span className="absolute top-1 right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </button>
              {notifOpen && (
                <div className="absolute right-0 mt-2 w-80 bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden animate-[slideDown_0.15s_ease-out]">
                  <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
                    <span className="font-semibold text-slate-900 text-sm">Notifications</span>
                    {unreadCount > 0 && (
                      <button onClick={markAllRead} className="text-xs text-teal-600 font-medium hover:underline">
                        Mark all read
                      </button>
                    )}
                  </div>
                  <div className="max-h-96 overflow-y-auto">
                    {notifications.length === 0 ? (
                      <div className="px-4 py-10 text-center text-sm text-slate-400">
                        <Bell className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                        No notifications yet
                      </div>
                    ) : (
                      notifications.slice(0, 12).map((n) => (
                        <button
                          key={n.id}
                          onClick={() => markRead(n.id)}
                          className={`w-full text-left px-4 py-3 border-b border-slate-50 hover:bg-slate-50 transition-colors ${!n.read ? 'bg-teal-50/40' : ''}`}
                        >
                          <div className="flex items-start gap-2">
                            {!n.read && <span className="w-2 h-2 rounded-full bg-teal-500 mt-1.5 flex-shrink-0" />}
                            <div className={n.read ? 'pl-4' : ''}>
                              <p className="text-sm font-medium text-slate-800">{n.title}</p>
                              {n.message && <p className="text-xs text-slate-500 mt-0.5">{n.message}</p>}
                              <p className="text-[11px] text-slate-400 mt-1">{fmtDate(n.created_at, 'MMM d, h:mm a')}</p>
                            </div>
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Profile */}
            <div ref={profileRef} className="relative">
              <button
                onClick={() => setProfileOpen((v) => !v)}
                className="flex items-center gap-2 p-1.5 pr-2 rounded-xl hover:bg-slate-100 transition-colors"
              >
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-teal-400 to-cyan-500 flex items-center justify-center text-white text-xs font-semibold">
                  {initials}
                </div>
                <ChevronDown className="w-4 h-4 text-slate-400" />
              </button>
              {profileOpen && (
                <div className="absolute right-0 mt-2 w-56 bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden animate-[slideDown_0.15s_ease-out]">
                  <div className="px-4 py-3 border-b border-slate-100">
                    <p className="text-sm font-semibold text-slate-900 truncate">{profile?.full_name}</p>
                    <p className="text-xs text-slate-500 truncate">{profile?.email}</p>
                  </div>
                  <button
                    onClick={() => { navigate('/app/settings'); setProfileOpen(false); }}
                    className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50"
                  >
                    <Settings className="w-4 h-4 text-slate-400" /> Settings
                  </button>
                  <button
                    onClick={handleSignOut}
                    className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-rose-600 hover:bg-rose-50"
                  >
                    <LogOut className="w-4 h-4" /> Sign out
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        <main className="flex-1 p-4 lg:p-8">
          <Outlet />
        </main>
      </div>

      <Chatbot />
    </div>
  );
}
