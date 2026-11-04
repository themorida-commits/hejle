import { createBrowserRouter } from 'react-router-dom';

// اسکلت مسیرها — صفحات واقعی در تسک‌های فاز ۱ ساخته می‌شوند (P1-01 به بعد).
function Placeholder({ title }: { title: string }) {
  return (
    <main dir="rtl" style={{ fontFamily: 'Vazirmatn, system-ui', padding: 32 }}>
      <h1>{title}</h1>
      <p>اسکلت فاز ۰ — این صفحه در فاز ۱ ساخته می‌شود.</p>
    </main>
  );
}

export const router = createBrowserRouter([
  { path: '/', element: <Placeholder title="داشبورد سرپرستار" /> },
  { path: '/scheduler', element: <Placeholder title="برنامهٔ شیفت" /> },
  { path: '/leave', element: <Placeholder title="مرخصی‌ها" /> },
  { path: '/work-records', element: <Placeholder title="کارکرد ماهانه" /> },
  { path: '/self-service', element: <Placeholder title="سلف‌سرویس پرستار" /> },
]);
