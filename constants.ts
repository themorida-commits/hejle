
import type { Department, Personnel, ShiftType, CustomRule, AiGenerationSettings, GlobalDutySettings, ScheduleEntry } from './types';

export const MOCK_DEPARTMENTS: Department[] = [
  { id: 'dep1', name: 'بخش داخلی', themeColor: '#3b82f6' },
  { id: 'dep2', name: 'بخش جراحی', themeColor: '#ef4444' },
  { id: 'dep3', name: 'اورژانس', themeColor: '#f59e0b' },
];

export const MOCK_PERSONNEL: Personnel[] = [
  // --- بخش داخلی (dep1) --- 14 Person
  { id: 'p1', name: 'سارا رضایی', personnelCode: 'HN-101', role: 'سرپرستار', departmentId: 'dep1', seniorityLevel: 15, nationalCode: '1112223334', contactNumber: '09121111111', employmentStatus: 'رسمی', employmentDate: '1388/01/15' },
  { id: 'p2', name: 'علی محمدی', personnelCode: 'N-102', role: 'پرستار', departmentId: 'dep1', seniorityLevel: 8, nationalCode: '2223334445', contactNumber: '09122222222', employmentStatus: 'رسمی', employmentDate: '1392/05/20' },
  { id: 'p3', name: 'فاطمه کریمی', personnelCode: 'N-103', role: 'پرستار', departmentId: 'dep1', seniorityLevel: 10, nationalCode: '3334445556', contactNumber: '09123333333', employmentStatus: 'قراردادی', employmentDate: '1393/11/01' },
  { id: 'p4', name: 'رضا امینی', personnelCode: 'A-104', role: 'بهیار', departmentId: 'dep1', seniorityLevel: 5, nationalCode: '4445556667', contactNumber: '09124444444', employmentStatus: 'شرکتی', employmentDate: '1398/02/10' },
  { id: 'p5', name: 'زهرا موسوی', personnelCode: 'N-105', role: 'پرستار', departmentId: 'dep1', seniorityLevel: 3, nationalCode: '5556667778', contactNumber: '09125555555', employmentStatus: 'طرحی', employmentDate: '1401/06/01' },
  { id: 'p6', name: 'مهدی حسینی', personnelCode: 'N-106', role: 'پرستار', departmentId: 'dep1', seniorityLevel: 12, nationalCode: '6667778889', contactNumber: '09126666666', employmentStatus: 'رسمی', employmentDate: '1390/12/25' },
  { id: 'p7', name: 'مریم اکبری', personnelCode: 'A-107', role: 'بهیار', departmentId: 'dep1', seniorityLevel: 7, nationalCode: '7778889990', contactNumber: '09127777777', employmentStatus: 'قراردادی', employmentDate: '1395/04/14' },
  { id: 'p8', name: 'سعید احمدی', personnelCode: 'N-108', role: 'پرستار', departmentId: 'dep1', seniorityLevel: 4, nationalCode: '8889990001', contactNumber: '09128888888', employmentStatus: 'طرحی', employmentDate: '1400/08/10' },
  { id: 'p9', name: 'سمیه قربانی', personnelCode: 'N-109', role: 'پرستار', departmentId: 'dep1', seniorityLevel: 6, nationalCode: '9990001112', contactNumber: '09129999999', employmentStatus: 'شرکتی', employmentDate: '1397/09/01' },
  { id: 'p10', name: 'جواد علیزاده', personnelCode: 'A-110', role: 'بهیار', departmentId: 'dep1', seniorityLevel: 2, nationalCode: '1231231234', contactNumber: '09110001111', employmentStatus: 'طرحی', employmentDate: '1402/01/20' },
  { id: 'p11', name: 'نرگس سلطانی', personnelCode: 'N-111', role: 'پرستار', departmentId: 'dep1', seniorityLevel: 9, nationalCode: '2342342345', contactNumber: '09112223333', employmentStatus: 'رسمی', employmentDate: '1394/10/05' },
  { id: 'p12', name: 'حمید صادقی', personnelCode: 'N-112', role: 'پرستار', departmentId: 'dep1', seniorityLevel: 11, nationalCode: '3453453456', contactNumber: '09114445555', employmentStatus: 'قراردادی', employmentDate: '1391/03/30' },
  { id: 'p13', name: 'الناز حیدری', personnelCode: 'A-113', role: 'بهیار', departmentId: 'dep1', seniorityLevel: 1, nationalCode: '4564564567', contactNumber: '09116667777', employmentStatus: 'شرکتی', employmentDate: '1402/11/12' },
  { id: 'p14', name: 'امیر قاسمی', personnelCode: 'N-114', role: 'پرستار', departmentId: 'dep1', seniorityLevel: 2, nationalCode: '5675675678', contactNumber: '09118889999', employmentStatus: 'طرحی', employmentDate: '1402/05/15' },

  // --- بخش جراحی (dep2) --- 14 Person
  { id: 'p15', name: 'مینا خسروی', personnelCode: 'HN-201', role: 'سرپرستار', departmentId: 'dep2', seniorityLevel: 18, nationalCode: '6786786789', contactNumber: '09131112222', employmentStatus: 'رسمی', employmentDate: '1385/06/10' },
  { id: 'p16', name: 'حسین رحیمی', personnelCode: 'N-202', role: 'اتاق عمل', departmentId: 'dep2', seniorityLevel: 10, nationalCode: '7897897890', contactNumber: '09132223333', employmentStatus: 'رسمی', employmentDate: '1393/02/15' },
  { id: 'p17', name: 'مهناز باقری', personnelCode: 'N-203', role: 'بی‌هوشی', departmentId: 'dep2', seniorityLevel: 6, nationalCode: '8908908901', contactNumber: '09134445555', employmentStatus: 'قراردادی', employmentDate: '1397/08/20' },
  { id: 'p18', name: 'محسن کریمی', personnelCode: 'A-204', role: 'بهیار', departmentId: 'dep2', seniorityLevel: 4, nationalCode: '9019019012', contactNumber: '09136667777', employmentStatus: 'شرکتی', employmentDate: '1399/10/01' },
  { id: 'p19', name: 'افسانه نوری', personnelCode: 'N-205', role: 'پرستار', departmentId: 'dep2', seniorityLevel: 2, nationalCode: '0120120123', contactNumber: '09138889999', employmentStatus: 'طرحی', employmentDate: '1402/04/05' },
  { id: 'p20', name: 'فرهاد نصیری', personnelCode: 'N-206', role: 'اتاق عمل', departmentId: 'dep2', seniorityLevel: 13, nationalCode: '1351351357', contactNumber: '09141112222', employmentStatus: 'رسمی', employmentDate: '1390/01/20' },
  { id: 'p21', name: 'الهام زارعی', personnelCode: 'A-207', role: 'بهیار', departmentId: 'dep2', seniorityLevel: 9, nationalCode: '2462462468', contactNumber: '09142223333', employmentStatus: 'قراردادی', employmentDate: '1394/09/12' },
  { id: 'p22', name: 'داریوش راد', personnelCode: 'N-208', role: 'بی‌هوشی', departmentId: 'dep2', seniorityLevel: 1, nationalCode: '3573573579', contactNumber: '09144445555', employmentStatus: 'طرحی', employmentDate: '1403/02/01' },
  { id: 'p23', name: 'نازنین بیاتی', personnelCode: 'N-209', role: 'پرستار', departmentId: 'dep2', seniorityLevel: 7, nationalCode: '4684684680', contactNumber: '09146667777', employmentStatus: 'شرکتی', employmentDate: '1396/05/18' },
  { id: 'p24', name: 'بابک امانی', personnelCode: 'A-210', role: 'بهیار', departmentId: 'dep2', seniorityLevel: 3, nationalCode: '5795795791', contactNumber: '09148889999', employmentStatus: 'شرکتی', employmentDate: '1400/11/15' },
  { id: 'p25', name: 'سحر تهرانی', personnelCode: 'N-211', role: 'اتاق عمل', departmentId: 'dep2', seniorityLevel: 11, nationalCode: '6806806802', contactNumber: '09151112222', employmentStatus: 'رسمی', employmentDate: '1391/12/01' },
  { id: 'p26', name: 'کیوان رحمانی', personnelCode: 'N-212', role: 'بی‌هوشی', departmentId: 'dep2', seniorityLevel: 5, nationalCode: '7917917913', contactNumber: '09152223333', employmentStatus: 'قراردادی', employmentDate: '1398/03/10' },
  { id: 'p27', name: 'آیدا رستمی', personnelCode: 'A-213', role: 'بهیار', departmentId: 'dep2', seniorityLevel: 2, nationalCode: '8028028024', contactNumber: '09154445555', employmentStatus: 'طرحی', employmentDate: '1402/09/20' },
  { id: 'p28', name: 'پیمان معادی', personnelCode: 'N-214', role: 'پرستار', departmentId: 'dep2', seniorityLevel: 8, nationalCode: '9139139135', contactNumber: '09156667777', employmentStatus: 'رسمی', employmentDate: '1395/07/05' },

  // --- اورژانس (dep3) --- 14 Person
  { id: 'p29', name: 'کامران مولایی', personnelCode: 'HN-301', role: 'سرپرستار', departmentId: 'dep3', seniorityLevel: 20, nationalCode: '0240240246', contactNumber: '09161112222', employmentStatus: 'رسمی', employmentDate: '1383/03/25' },
  { id: 'p30', name: 'شیوا فلاحی', personnelCode: 'N-302', role: 'پرستار', departmentId: 'dep3', seniorityLevel: 9, nationalCode: '1357913579', contactNumber: '09162223333', employmentStatus: 'رسمی', employmentDate: '1394/05/10' },
  { id: 'p31', name: 'مرتضی حاتمی', personnelCode: 'N-303', role: 'پرستار', departmentId: 'dep3', seniorityLevel: 6, nationalCode: '2468024680', contactNumber: '09164445555', employmentStatus: 'قراردادی', employmentDate: '1397/11/01' },
  { id: 'p32', name: 'پرستو صالحی', personnelCode: 'A-304', role: 'بهیار', departmentId: 'dep3', seniorityLevel: 10, nationalCode: '3579135791', contactNumber: '09166667777', employmentStatus: 'شرکتی', employmentDate: '1393/06/15' },
  { id: 'p33', name: 'امید زند', personnelCode: 'N-305', role: 'پرستار', departmentId: 'dep3', seniorityLevel: 2, nationalCode: '4680246802', contactNumber: '09168889999', employmentStatus: 'طرحی', employmentDate: '1402/02/20' },
  { id: 'p34', name: 'یلدا عباسی', personnelCode: 'N-306', role: 'پرستار', departmentId: 'dep3', seniorityLevel: 14, nationalCode: '5791357913', contactNumber: '09171112222', employmentStatus: 'رسمی', employmentDate: '1389/10/01' },
  { id: 'p35', name: 'شاهرخ استخری', personnelCode: 'A-307', role: 'بهیار', departmentId: 'dep3', seniorityLevel: 4, nationalCode: '6802468024', contactNumber: '09172223333', employmentStatus: 'شرکتی', employmentDate: '1399/12/05' },
  { id: 'p36', name: 'غزل شاکری', personnelCode: 'N-308', role: 'پرستار', departmentId: 'dep3', seniorityLevel: 5, nationalCode: '7913579135', contactNumber: '09174445555', employmentStatus: 'قراردادی', employmentDate: '1398/08/12' },
  { id: 'p37', name: 'امیر جدیدی', personnelCode: 'N-309', role: 'پرستار', departmentId: 'dep3', seniorityLevel: 3, nationalCode: '8024680246', contactNumber: '09176667777', employmentStatus: 'طرحی', employmentDate: '1401/10/25' },
  { id: 'p38', name: 'شبنم قلی خانی', personnelCode: 'A-310', role: 'بهیار', departmentId: 'dep3', seniorityLevel: 7, nationalCode: '9135791357', contactNumber: '09178889999', employmentStatus: 'قراردادی', employmentDate: '1396/04/01' },
  { id: 'p39', name: 'هومن سیدی', personnelCode: 'N-311', role: 'پرستار', departmentId: 'dep3', seniorityLevel: 12, nationalCode: '0246802468', contactNumber: '09181112222', employmentStatus: 'رسمی', employmentDate: '1391/01/15' },
  { id: 'p40', name: 'ترانه علیدوستی', personnelCode: 'N-312', role: 'پرستار', departmentId: 'dep3', seniorityLevel: 4, nationalCode: '1357924680', contactNumber: '09182223333', employmentStatus: 'شرکتی', employmentDate: '1400/03/20' },
  { id: 'p41', name: 'بهرام رادان', personnelCode: 'A-313', role: 'بهیار', departmentId: 'dep3', seniorityLevel: 1, nationalCode: '2468035791', contactNumber: '09184445555', employmentStatus: 'طرحی', employmentDate: '1403/01/10' },
  { id: 'p42', name: 'الناز شاکردوست', personnelCode: 'N-314', role: 'پرستار', departmentId: 'dep3', seniorityLevel: 10, nationalCode: '3579146802', contactNumber: '09186667777', employmentStatus: 'رسمی', employmentDate: '1393/12/12' },
];

export const MOCK_SHIFT_TYPES: ShiftType[] = [
  { id: 's-m', name: 'صبح', symbol: 'M', displayColor: '#34d399', realDuration: 6, calculatedValue: 6, fridayCalculatedValue: 6, holidayCalculatedValue: 6, departmentIds: ['dep1', 'dep2', 'dep3'], description: 'شیفت کاری صبح' },
  { id: 's-e', name: 'عصر', symbol: 'E', displayColor: '#fbbf24', realDuration: 6, calculatedValue: 6, fridayCalculatedValue: 6, holidayCalculatedValue: 6, departmentIds: ['dep1', 'dep2', 'dep3'], description: 'شیفت کاری عصر' },
  { id: 's-n', name: 'شب', symbol: 'N', displayColor: '#1e3a8a', realDuration: 12, calculatedValue: 12, fridayCalculatedValue: 12, holidayCalculatedValue: 12, departmentIds: ['dep1', 'dep2', 'dep3'], description: 'شیفت کاری شب' },
  { id: 's-en', name: 'عصر و شب', symbol: 'EN', displayColor: '#6366f1', realDuration: 22.5, calculatedValue: 22.5, fridayCalculatedValue: 22.5, holidayCalculatedValue: 22.5, departmentIds: ['dep1', 'dep2', 'dep3'], description: 'ترکیب عصر و شب' },
  { id: 's-he', name: 'تشویقی', symbol: 'HE', displayColor: '#ec4899', realDuration: 6, calculatedValue: 6, fridayCalculatedValue: 6, holidayCalculatedValue: 6, departmentIds: ['dep1', 'dep2', 'dep3'] },
  { id: 's-eo', name: 'آنکال عصر', symbol: 'EO', displayColor: '#f97316', realDuration: 0.5, calculatedValue: 0.5, fridayCalculatedValue: 0.5, holidayCalculatedValue: 0.5, departmentIds: ['dep1', 'dep2', 'dep3'] },
  { id: 's-ko', name: 'نگهبانی', symbol: 'KO', displayColor: '#64748b', realDuration: 6, calculatedValue: 6, fridayCalculatedValue: 6, holidayCalculatedValue: 6, departmentIds: ['dep1', 'dep2', 'dep3'] },
  { id: 's-mo', name: 'آنکال صبح', symbol: 'MO', displayColor: '#0ea5e9', realDuration: 0.5, calculatedValue: 0.5, fridayCalculatedValue: 0.5, holidayCalculatedValue: 0.5, departmentIds: ['dep1', 'dep2', 'dep3'] },
  { id: 's-on', name: 'آنکال شب', symbol: 'ON', displayColor: '#4f46e5', realDuration: 1, calculatedValue: 1, fridayCalculatedValue: 1, holidayCalculatedValue: 1, departmentIds: ['dep1', 'dep2', 'dep3'] },
  { id: 's-sh', name: 'استعلاجی', symbol: 'SH', displayColor: '#f43f5e', realDuration: 7, calculatedValue: 7, fridayCalculatedValue: 7, holidayCalculatedValue: 7, departmentIds: ['dep1', 'dep2', 'dep3'] },
  { id: 's-mi', name: 'ماموریت', symbol: 'MI', displayColor: '#8b5cf6', realDuration: 7, calculatedValue: 7, fridayCalculatedValue: 7, holidayCalculatedValue: 7, departmentIds: ['dep1', 'dep2', 'dep3'] },
  { id: 's-h', name: 'مرخصی استحقاقی', symbol: 'H', displayColor: '#10b981', realDuration: 0, calculatedValue: 0, fridayCalculatedValue: 0, holidayCalculatedValue: 0, departmentIds: ['dep1', 'dep2', 'dep3'], description: 'مرخصی استحقاقی' },
  { id: 's-off', name: 'اف', symbol: '-', displayColor: '#e5e7eb', realDuration: 0, calculatedValue: 0, fridayCalculatedValue: 0, holidayCalculatedValue: 0, departmentIds: ['dep1', 'dep2', 'dep3'], description: 'آف یا تعطیل' },
];

export const INITIAL_SCHEDULE: ScheduleEntry[] = [];

export const NATIONAL_HOLIDAYS = [
    { month: 1, day: 1, name: 'نوروز' },
    { month: 1, day: 2, name: 'نوروز' },
    { month: 1, day: 3, name: 'نوروز' },
    { month: 1, day: 4, name: 'نوروز' },
    { month: 1, day: 12, name: 'روز جمهوری اسلامی' },
    { month: 1, day: 13, name: 'روز طبیعت' },
    { month: 3, day: 14, name: 'رحلت امام خمینی' },
    { month: 3, day: 15, name: 'قیام ۱۵ خرداد' },
    { month: 11, day: 22, name: 'پیروزی انقلاب' },
    { month: 12, day: 29, name: 'ملی شدن صنعت نفت' },
];

export const MONTHS = [
    { value: 1, name: 'فروردین' }, { value: 2, name: 'اردیبهشت' }, { value: 3, name: 'خرداد' },
    { value: 4, name: 'تیر' }, { value: 5, name: 'مرداد' }, { value: 6, name: 'شهریور' },
    { value: 7, name: 'مهر' }, { value: 8, name: 'آبان' }, { value: 9, name: 'آذر' },
    { value: 10, name: 'دی' }, { value: 11, name: 'بهمن' }, { value: 12, name: 'اسفند' },
];

export const DEFAULT_RULES: CustomRule[] = [
  {
    id: 'rule-max-nights',
    type: 'max_consecutive_nights',
    value: 2,
    description: 'یک فرد نمی‌تواند بیش از ۲ شیفت شب متوالی کار کند.',
    isEnabled: true,
    priority: 'IMPORTANT',
    category: 'PATIENT_SAFETY',
  },
  {
    id: 'rule-head-nurse',
    type: 'head_nurse_morning',
    description: 'سرپرستار همیشه شیفت صبح می‌باشد مگر با تغییر دستی.',
    isEnabled: true,
    priority: 'IMPORTANT',
    category: 'PATIENT_SAFETY',
  },
  {
    id: 'rule-holidays',
    type: 'national_holidays',
    description: "در روزهای تعطیل رسمی، برای تمام پرسنل شیفت 'تعطیل' ثبت شود.",
    isEnabled: true,
    priority: 'CRITICAL',
    category: 'LABOR_LAW',
  },
];

export const DEFAULT_AI_SETTINGS: AiGenerationSettings = {
  distributionAlgorithm: 'even',
  minRestHours: 24,
  maxConsecutiveWorkDays: 6,
  weekendDistribution: 'even',
};

export const DEFAULT_SCHEDULE_NOTES = "برنامه تنظیمی با رعایت قوانین ریکاوری و ایمنی بیمار.";

export const DEFAULT_GLOBAL_SETTINGS: GlobalDutySettings = {
  employmentStatuses: [
    { status: 'رسمی', baseHours: 176 },
    { status: 'قراردادی', baseHours: 176 },
    { status: 'طرحی', baseHours: 176 },
    { status: 'شرکتی', baseHours: 176 },
  ],
  roleDeductions: [
    { role: 'سرپرستار', deduction: 0 },
    { role: 'پرستار', deduction: 0 },
    { role: 'بهیار', deduction: 0 },
    { role: 'بی‌هوشی', deduction: 0 },
    { role: 'اتاق عمل', deduction: 0 },
  ],
  seniorityDeductions: [
    { minMonths: 120, maxMonths: 180, deduction: 5 },
    { minMonths: 180, maxMonths: 240, deduction: 10 },
    { minMonths: 240, maxMonths: 300, deduction: 15 },
    { minMonths: 300, maxMonths: 600, deduction: 20 },
  ],
  reminderLeadDays: 1,
  defaultReminderMinutes: 60
};
