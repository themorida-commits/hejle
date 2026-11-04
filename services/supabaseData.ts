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
import { supabase, isSupabaseConfigured } from './supabase';

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

// PostgREST caps every response at 1000 rows by default and truncates the
// rest silently. A single month of `schedule` for a mid-size ward is already
// larger than that, so every collection read must page explicitly.
const PAGE_SIZE = 1000;

async function fetchPagedColumn<T>(
  userId: string,
  collectionName: string,
  column: 'payload' | 'document_id',
): Promise<T[]> {
  const values: T[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from('app_data')
      .select(column)
      .eq('user_id', userId)
      .eq('collection_name', collectionName)
      .order('id')
      .range(from, from + PAGE_SIZE - 1);

    if (error) {
      throw error;
    }

    const page = data ?? [];
    for (const row of page) {
      values.push(row[column] as T);
    }
    if (page.length < PAGE_SIZE) {
      return values;
    }
    from += PAGE_SIZE;
  }
}

// The save path is whole-state: the payload handed in IS the full current
// state of the collection. Rows stored for this user+collection whose
// document_id is no longer present locally were deleted in the app and must
// be deleted remotely too — an upsert-only sync resurrects them on the next
// load.
async function deleteStaleCollectionItems(
  userId: string,
  collectionName: string,
  keepDocumentIds: Set<string>,
) {
  const existingIds = await fetchPagedColumn<string>(userId, collectionName, 'document_id');
  const staleIds = existingIds.filter((id) => !keepDocumentIds.has(id));
  const DELETE_CHUNK = 200;
  for (let i = 0; i < staleIds.length; i += DELETE_CHUNK) {
    const chunk = staleIds.slice(i, i + DELETE_CHUNK);
    const { error } = await supabase
      .from('app_data')
      .delete()
      .eq('user_id', userId)
      .eq('collection_name', collectionName)
      .in('document_id', chunk);

    if (error) {
      throw error;
    }
  }
}

async function upsertCollectionItems<T extends object>(
  userId: string,
  collectionName: string,
  items: T[],
  documentIdResolver: (item: T, index: number) => string,
) {
  const rows: AppDataRow[] = items.map((item, index) => ({
    collection_name: collectionName,
    document_id: documentIdResolver(item, index),
    payload: item,
  }));

  if (rows.length) {
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

  await deleteStaleCollectionItems(
    userId,
    collectionName,
    new Set(rows.map((row) => row.document_id)),
  );
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
  return fetchPagedColumn<T>(userId, collectionName, 'payload');
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
  if (!isSupabaseConfigured) {
    return;
  }
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
  if (!isSupabaseConfigured) {
    return {
      departments: [],
      personnel: [],
      shiftTypes: [],
      schedule: [],
      requests: [],
      rules: [],
      archives: [],
      calendarEvents: [],
      globalSettings: null,
      manualBalances: {},
    };
  }
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
