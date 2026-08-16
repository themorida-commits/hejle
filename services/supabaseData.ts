import type {
  ArchivedSchedule,
  CalendarEvent,
  CustomRule,
  Department,
  GlobalDutySettings,
  Personnel,
  ScheduleEntry,
  ShiftType,
  StaffRequest,
} from '../types';
import { supabase } from './supabase';

export interface UserDataPayload {
  departments: Department[];
  personnel: Personnel[];
  shiftTypes: ShiftType[];
  schedule: ScheduleEntry[];
  requests: StaffRequest[];
  rules: CustomRule[];
  archives: ArchivedSchedule[];
  calendarEvents: CalendarEvent[];
  globalSettings: GlobalDutySettings | null;
  manualBalances: Record<string, number>;
}

interface AppDataRow {
  collection_name: string;
  document_id: string;
  payload: object;
}

function getScheduleEntryId(entry: ScheduleEntry): string {
  return `${entry.personnelId}_${entry.date}`;
}

async function upsertCollectionItems<T extends object>(
  userId: string,
  collectionName: string,
  items: T[],
  documentIdResolver: (item: T, index: number) => string,
) {
  if (!items.length) {
    return;
  }

  const rows: AppDataRow[] = items.map((item, index) => ({
    collection_name: collectionName,
    document_id: documentIdResolver(item, index),
    payload: item,
  }));

  const { error } = await supabase
    .from('app_data')
    .upsert(
      rows.map((row) => ({
        user_id: userId,
        collection_name: row.collection_name,
        document_id: row.document_id,
        payload: row.payload,
      })),
      { onConflict: 'user_id,collection_name,document_id' },
    );

  if (error) {
    throw error;
  }
}

async function upsertSingletonItem<T extends object>(
  userId: string,
  collectionName: string,
  documentId: string,
  payload: T,
) {
  const { error } = await supabase
    .from('app_data')
    .upsert(
      {
        user_id: userId,
        collection_name: collectionName,
        document_id: documentId,
        payload,
      },
      { onConflict: 'user_id,collection_name,document_id' },
    );

  if (error) {
    throw error;
  }
}

async function fetchCollectionItems<T>(userId: string, collectionName: string): Promise<T[]> {
  const { data, error } = await supabase
    .from('app_data')
    .select('payload')
    .eq('user_id', userId)
    .eq('collection_name', collectionName);

  if (error) {
    throw error;
  }

  return (data ?? []).map((row) => row.payload as T);
}

async function fetchSingletonItem<T>(userId: string, collectionName: string, documentId: string): Promise<T | null> {
  const { data, error } = await supabase
    .from('app_data')
    .select('payload')
    .eq('user_id', userId)
    .eq('collection_name', collectionName)
    .eq('document_id', documentId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return (data?.payload as T) ?? null;
}

export async function saveUserDataToSupabase(userId: string, payload: UserDataPayload) {
  await upsertCollectionItems(userId, 'departments', payload.departments, (item) => item.id);
  await upsertCollectionItems(userId, 'personnel', payload.personnel, (item) => item.id);
  await upsertCollectionItems(userId, 'shiftTypes', payload.shiftTypes, (item) => item.id);
  await upsertCollectionItems(userId, 'schedule', payload.schedule, (item) => getScheduleEntryId(item));
  await upsertCollectionItems(userId, 'requests', payload.requests, (item) => item.id);
  await upsertCollectionItems(userId, 'rules', payload.rules, (item) => item.id);
  await upsertCollectionItems(userId, 'archives', payload.archives, (item) => item.id);
  await upsertCollectionItems(userId, 'calendarEvents', payload.calendarEvents, (item) => item.id);

  await upsertSingletonItem(userId, 'globalSettings', 'default', payload.globalSettings ?? {});
  await upsertSingletonItem(userId, 'manualBalances', 'all', payload.manualBalances ?? {});
}

export async function loadUserDataFromSupabase(userId: string): Promise<UserDataPayload> {
  const [departments, personnel, shiftTypes, schedule, requests, rules, archives, calendarEvents, globalSettings, manualBalances] = await Promise.all([
    fetchCollectionItems<Department>(userId, 'departments'),
    fetchCollectionItems<Personnel>(userId, 'personnel'),
    fetchCollectionItems<ShiftType>(userId, 'shiftTypes'),
    fetchCollectionItems<ScheduleEntry>(userId, 'schedule'),
    fetchCollectionItems<StaffRequest>(userId, 'requests'),
    fetchCollectionItems<CustomRule>(userId, 'rules'),
    fetchCollectionItems<ArchivedSchedule>(userId, 'archives'),
    fetchCollectionItems<CalendarEvent>(userId, 'calendarEvents'),
    fetchSingletonItem<GlobalDutySettings>(userId, 'globalSettings', 'default'),
    fetchSingletonItem<Record<string, number>>(userId, 'manualBalances', 'all'),
  ]);

  return {
    departments,
    personnel,
    shiftTypes,
    schedule,
    requests,
    rules,
    archives,
    calendarEvents,
    globalSettings,
    manualBalances: manualBalances ?? {},
  };
}
