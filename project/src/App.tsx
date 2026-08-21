import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { NotificationProvider } from '@/context/NotificationContext';
import { PatientProvider } from '@/context/PatientContext';
import { AuthPage } from '@/pages/AuthPage';
import { AppLayout } from '@/components/AppLayout';
import { DashboardPage } from '@/pages/DashboardPage';
import { MedicationsPage } from '@/pages/MedicationsPage';
import { SchedulePage } from '@/pages/SchedulePage';
import { HistoryPage } from '@/pages/HistoryPage';
import { AnalyticsPage } from '@/pages/AnalyticsPage';
import { PrescriptionsPage } from '@/pages/PrescriptionsPage';
import { CaregiversPage } from '@/pages/CaregiversPage';
import { SettingsPage } from '@/pages/SettingsPage';
import { FullPageLoader } from '@/components/ui/Spinner';

function ProtectedLayout() {
  const { user, loading } = useAuth();
  if (loading) return <FullPageLoader label="Loading your medications..." />;
  if (!user) return <Navigate to="/" replace />;
  return (
    <NotificationProvider>
      <PatientProvider>
        <AppLayout />
      </PatientProvider>
    </NotificationProvider>
  );
}

function PublicRoutes() {
  const { user, loading } = useAuth();
  if (loading) return <FullPageLoader />;
  if (user) return <Navigate to="/app/dashboard" replace />;
  return <AuthPage />;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<PublicRoutes />} />
          <Route path="/app" element={<ProtectedLayout />}>
            <Route index element={<Navigate to="/app/dashboard" replace />} />
            <Route path="dashboard" element={<DashboardPage />} />
            <Route path="medications" element={<MedicationsPage />} />
            <Route path="schedule" element={<SchedulePage />} />
            <Route path="history" element={<HistoryPage />} />
            <Route path="analytics" element={<AnalyticsPage />} />
            <Route path="prescriptions" element={<PrescriptionsPage />} />
            <Route path="caregivers" element={<CaregiversPage />} />
            <Route path="settings" element={<SettingsPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
