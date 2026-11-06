import { createBrowserRouter } from 'react-router-dom';
import Layout from '../components/Layout';
import AuthGate from '../components/AuthGate';
import DashboardPage from '../pages/DashboardPage';
import SchedulerPage from '../pages/SchedulerPage';
import LeavePage from '../pages/LeavePage';
import WorkRecordsPage from '../pages/WorkRecordsPage';
import SelfServicePage from '../pages/SelfServicePage';
import AttendancePage from '../pages/AttendancePage';
import PersonnelPage from '../pages/PersonnelPage';
import KaranehPage from '../pages/KaranehPage';
import NursingServicesPage from '../pages/NursingServicesPage';
import AccreditationPage from '../pages/AccreditationPage';
import AiAssistantPage from '../pages/AiAssistantPage';
import SettingsPage from '../pages/SettingsPage';

// basename از BASE_URL وایت می‌آید: در بیلد عادی «/» و در بیلد زیرمسیر
// (مثل دیپلوی موقت Azure زیر /hejleh/) همان زیرمسیر — بدون نیاز به تغییر کد.
const basename = import.meta.env.BASE_URL.replace(/\/$/, '') || '/';

export const router = createBrowserRouter([
  {
    element: (
      <AuthGate>
        <Layout />
      </AuthGate>
    ),
    children: [
      { path: '/', element: <DashboardPage /> },
      { path: '/scheduler', element: <SchedulerPage /> },
      { path: '/leave', element: <LeavePage /> },
      { path: '/work-records', element: <WorkRecordsPage /> },
      { path: '/attendance', element: <AttendancePage /> },
      { path: '/personnel', element: <PersonnelPage /> },
      { path: '/karaneh', element: <KaranehPage /> },
      { path: '/nursing-services', element: <NursingServicesPage /> },
      { path: '/accreditation', element: <AccreditationPage /> },
      { path: '/ai', element: <AiAssistantPage /> },
      { path: '/settings', element: <SettingsPage /> },
      { path: '/self-service', element: <SelfServicePage /> },
    ],
  },
], { basename });
