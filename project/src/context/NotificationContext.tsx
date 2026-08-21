import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react';
import { supabase, AppNotification, Medication, Schedule, DoseLog } from '@/lib/supabase';
import { useAuth } from './AuthContext';

type NotificationContextValue = {
  notifications: AppNotification[];
  unreadCount: number;
  loading: boolean;
  markRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
  deleteNotification: (id: string) => Promise<void>;
  clearAll: () => Promise<void>;
  addNotification: (n: Omit<AppNotification, 'id' | 'user_id' | 'read' | 'created_at'>) => Promise<void>;
  refresh: () => void;
};

const NotificationContext = createContext<NotificationContextValue | undefined>(undefined);

export function NotificationProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  // 1. Fetch user notifications
  useEffect(() => {
    if (!user) {
      setNotifications([]);
      return;
    }
    setLoading(true);
    supabase
      .from('notifications')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(50)
      .then(({ data, error }) => {
        if (error) console.error('Notification load error:', error.message);
        setNotifications((data as AppNotification[]) || []);
        setLoading(false);
      });
  }, [user, refreshKey]);

  // 2. Real-time subscription to notifications table
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel(`notifications-realtime-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          refresh();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, refresh]);

  // 3. Automatic Scanner for due doses & low stock refills
  const autoCheckNotifications = useCallback(async () => {
    if (!user) return;

    try {
      // Fetch active medications & schedules
      const [{ data: meds }, { data: scheds }, { data: logs }, { data: existingNotifs }] = await Promise.all([
        supabase.from('medications').select('*').eq('user_id', user.id).eq('active', true),
        supabase.from('schedules').select('*, medication:medications(*)').eq('user_id', user.id),
        supabase.from('dose_logs').select('*').eq('user_id', user.id).gte('scheduled_time', new Date().toISOString().split('T')[0]),
        supabase.from('notifications').select('*').eq('user_id', user.id).gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()),
      ]);

      const medications = (meds as Medication[]) || [];
      const schedules = (scheds as Schedule[]) || [];
      const recentLogs = (logs as DoseLog[]) || [];
      const recentNotifs = (existingNotifs as AppNotification[]) || [];

      // A. Check Low Stock Refill alerts
      for (const med of medications) {
        if (med.stock_quantity <= med.refill_threshold) {
          const alreadyNotified = recentNotifs.some(
            (n) => n.type === 'refill' && n.medication_id === med.id
          );
          if (!alreadyNotified) {
            await supabase.from('notifications').insert({
              user_id: user.id,
              type: 'refill',
              title: `⚠️ Refill Warning: ${med.name}`,
              message: `${med.name} stock is low (${med.stock_quantity} ${med.form?.toLowerCase() || 'pills'} left). Refill threshold is ${med.refill_threshold}.`,
              medication_id: med.id,
              read: false,
            });
          }
        }
      }

      // B. Check Today's Scheduled Doses
      const today = new Date();
      const todayDow = today.getDay();
      const todayStr = today.toISOString().split('T')[0];
      const currentMins = today.getHours() * 60 + today.getMinutes();

      for (const sched of schedules) {
        if (!sched.medication) continue;
        const isToday = sched.frequency === 'daily' || (sched.frequency === 'specific_days' && sched.days_of_week?.includes(todayDow));
        if (!isToday) continue;

        for (const timeStr of sched.times) {
          const [hStr, mStr] = timeStr.split(':');
          const schedMins = parseInt(hStr, 10) * 60 + parseInt(mStr || '0', 10);

          // Check if dose logged as taken
          const taken = recentLogs.some(
            (l) => l.medication_id === sched.medication_id && l.scheduled_time.startsWith(todayStr) && l.scheduled_time.includes(timeStr) && l.status === 'taken'
          );

          if (!taken) {
            // Check if reminder was sent today for this dose
            const alreadyNotified = recentNotifs.some(
              (n) => (n.type === 'reminder' || n.type === 'missed') && n.medication_id === sched.medication_id && n.message?.includes(timeStr)
            );

            if (!alreadyNotified) {
              // If time is approaching (within 60 min) or past
              if (currentMins >= schedMins - 60) {
                const isMissed = currentMins > schedMins + 45;
                const notifType = isMissed ? 'missed' : 'reminder';
                const notifTitle = isMissed ? `⏰ Missed Dose: ${sched.medication.name}` : `🔔 Medication Reminder: ${sched.medication.name}`;
                const notifMsg = isMissed
                  ? `You missed your scheduled dose of ${sched.medication.name} (${sched.medication.dosage || ''}) scheduled for ${timeStr}.`
                  : `It's time to take ${sched.medication.name} (${sched.medication.dosage || ''}) scheduled for ${timeStr}.`;

                await supabase.from('notifications').insert({
                  user_id: user.id,
                  type: notifType,
                  title: notifTitle,
                  message: notifMsg,
                  medication_id: sched.medication_id,
                  read: false,
                });
              }
            }
          }
        }
      }
    } catch (err) {
      console.error('Auto notification check error:', err);
    }
  }, [user]);

  useEffect(() => {
    if (!user) return;
    autoCheckNotifications();
    const interval = setInterval(autoCheckNotifications, 60000); // check every 60 seconds
    return () => clearInterval(interval);
  }, [user, autoCheckNotifications]);

  const markRead = useCallback(async (id: string) => {
    await supabase.from('notifications').update({ read: true }).eq('id', id);
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
  }, []);

  const markAllRead = useCallback(async () => {
    if (!user) return;
    await supabase.from('notifications').update({ read: true }).eq('user_id', user.id).eq('read', false);
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  }, [user]);

  const deleteNotification = useCallback(async (id: string) => {
    await supabase.from('notifications').delete().eq('id', id);
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }, []);

  const clearAll = useCallback(async () => {
    if (!user) return;
    await supabase.from('notifications').delete().eq('user_id', user.id);
    setNotifications([]);
  }, [user]);

  const addNotification = useCallback(
    async (n: Omit<AppNotification, 'id' | 'user_id' | 'read' | 'created_at'>) => {
      if (!user) return;
      const { error } = await supabase.from('notifications').insert({
        ...n,
        user_id: user.id,
      });
      if (error) console.error('Notification insert error:', error.message);
      refresh();
    },
    [user, refresh]
  );

  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <NotificationContext.Provider
      value={{
        notifications,
        unreadCount,
        loading,
        markRead,
        markAllRead,
        deleteNotification,
        clearAll,
        addNotification,
        refresh,
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  const ctx = useContext(NotificationContext);
  if (!ctx) throw new Error('useNotifications must be used within NotificationProvider');
  return ctx;
}
