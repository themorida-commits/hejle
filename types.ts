
export interface Department {
  id: string;
  name: string;
  themeColor: string;
}

export interface Personnel {
  id: string;
  name: string;
  personnelCode: string;
  role: string;
  departmentId: string;
  seniorityLevel: number;
  nationalCode: string;
  contactNumber: string;
  address?: string; // فیلد جدید آدرس
  employmentStatus: string; 
  baseDutyHours?: number; 
  employmentDate?: string; 
  profileImage?: string;
}

export interface CalendarEvent {
  id: string;
  year: number;
  month: number;
  day: number;
  time?: string; // Format: "HH:mm"
  reminderLeadMinutes?: number; // Lead time for this specific event
  title: string;
  description?: string;
  type: 'meeting' | 'reminder' | 'deadline';
  createdAt: string;
}

export interface ArchivedSchedule {
  id: string;
  departmentId: string;
  year: number;
  month: number;
  entries: ScheduleEntry[];
  personnelSnapshot: Personnel[];
  notes: string;
  archivedAt: string;
}

export interface RoleDutySetting {
  role: string;
  deduction: number; 
}

export interface EmploymentStatusSetting {
  status: string;
  baseHours: number;
}

export interface SeniorityDeduction {
  minMonths: number;
  maxMonths: number;
  deduction: number;
}

export interface GlobalDutySettings {
  employmentStatuses: EmploymentStatusSetting[];
  roleDeductions: RoleDutySetting[];
  seniorityDeductions: SeniorityDeduction[];
  reminderLeadDays: number; 
  defaultReminderMinutes: number; 
}

export interface ShiftType {
  id: string;
  name: string;
  symbol: string;
  displayColor: string;
  realDuration: number;
  calculatedValue: number; 
  fridayCalculatedValue: number;
  holidayCalculatedValue: number;
  departmentIds: string[];
  description?: string;
}

export interface ScheduleEntry {
  personnelId: string;
  shiftTypeId: string;
  date: string; 
  isManualEntry: boolean;
}

export interface StaffRequest {
  id: string;
  personnelId: string;
  date: string; 
  requestType: 'Leave' | 'Preferred Shift';
  preferredShiftId?: string;
  isSuggestion?: boolean;
}

export type RulePriority = 'CRITICAL' | 'IMPORTANT' | 'RECOMMENDED';
export type RuleCategory = 'LABOR_LAW' | 'PATIENT_SAFETY' | 'STAFF_WELLBEING' | 'FAIRNESS';

export interface CustomRule {
  id: string;
  description: string;
  isEnabled: boolean;
  type: 'custom' | 'max_consecutive_nights' | 'national_holidays' | 'head_nurse_morning' | 'min_rest_hours' | 'weekend_balance';
  value?: number; 
  priority: RulePriority;
  category: RuleCategory;
}

export interface ChatMessage {
  role: 'user' | 'model';
  content: string;
}

export interface AiGenerationSettings {
  distributionAlgorithm: 'even' | 'seniority' | 'random';
  minRestHours: number;
  maxConsecutiveWorkDays: number;
  weekendDistribution: 'even' | 'seniority' | 'none';
}

export enum Page {
  Scheduler = 'Scheduler',
  Personnel = 'Personnel',
  ShiftTypes = 'ShiftTypes',
  Rules = 'Rules',
  Calendar = 'Calendar',
  AiAssistant = 'AiAssistant',
  Archive = 'Archive',
  DepartmentManagement = 'DepartmentManagement',
  Settings = 'Settings',
}

export interface ChangeLogEntry {
  fromShiftId: string | null;
  toShiftId: string | null;
  timestamp: string;
  user: string;
}

export type ChangeLog = Record<string, ChangeLogEntry[]>;
