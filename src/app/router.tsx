import { createBrowserRouter } from 'react-router-dom';
import Layout from '../components/Layout';
import DashboardPage from '../pages/DashboardPage';
import SchedulerPage from '../pages/SchedulerPage';
import LeavePage from '../pages/LeavePage';
import WorkRecordsPage from '../pages/WorkRecordsPage';
import SelfServicePage from '../pages/SelfServicePage';
import AttendancePage from '../pages/AttendancePage';

export const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      { path: '/', element: <DashboardPage /> },
      { path: '/scheduler', element: <SchedulerPage /> },
      { path: '/leave', element: <LeavePage /> },
      { path: '/work-records', element: <WorkRecordsPage /> },
      { path: '/attendance', element: <AttendancePage /> },
      { path: '/self-service', element: <SelfServicePage /> },
    ],
  },
]);
