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
import type { Json } from '../database.types';
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

export type CollectionName =
  | 'departments'
  | 'personnel'
  | 'shiftTypes'
  | 'schedule'
  | 'requests'
  | 'rules'
  | 'archives'
  | 'calendarEvents';

const COLLECTION_NAMES: readonly CollectionName[] = [
  'departments',
  'personnel',
  'shiftTypes',
  'schedule',
  'requests',
  'rules',
  'archives',
  'calendarEvents',
];

export function isCollectionName(value: string): value is CollectionName {
  return (COLLECTION_NAMES as readonly string[]).includes(value);
}

/** Stable, order-independent signature used to detect real content changes. */
export function stableSignature(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value) ?? 'null';
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableSignature).join(',')}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
    a < b ? -1 : a > b ? 1 : 0
  );
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableSignature(v)}`).join(',')}}`;
}

function getScheduleEntryId(entry: ScheduleEntry): string {
  return `${entry.personnelId}_${entry.date}`;
}

function getCollectionItems(collection: CollectionName, payload: UserDataPayload): object[] {
  return payload[collection] as unknown as object[];
}

function getDocumentIds(collection: CollectionName, payload: UserDataPayload): string[] {
  switch (collection) {
    case 'schedule':
      return (payload.schedule ?? []).map(getScheduleEntryId);
    default:
      return (getCollectionItems(collection, payload) as { id?: string }[]).map((item) =>
        item.id ? String(item.id) : ''
      );
  }
}

/**
 * Replaces one collection in a single transactional round-trip.
 * The database function removes rows that no longer exist locally and
 * upserts (insert or update) every current row.
 */
async function replaceCollection(collectionName: CollectionName, payload: UserDataPayload) {
  const items = getCollectionItems(collectionName, payload);
  const documentIds = getDocumentIds(collectionName, payload);

  const rows = items.map((item, index) => ({
    document_id: documentIds[index],
    payload: item as Json,
  }));

  const { error } = await supabase.rpc('replace_collection', {
    p_collection: collectionName,
    p_rows: rows,
  });

  if (error) {
    throw error;
  }
}

async function saveSingleton<T extends object>(
  userId: string,
  collectionName: string,
  documentId: string,
  value: T | null
) {
  if (!value || Object.keys(value).length === 0) {
    return;
  }

  const { error } = await supabase.from('app_data').upsert(
    {
      user_id: userId,
      collection_name: collectionName,
      document_id: documentId,
      payload: value as Json,
    },
    { onConflict: 'user_id,collection_name,document_id' }
  );

  if (error) {
    throw error;
  }
}

/**
 * Persists user data to Supabase. When `dirtyCollections` is provided only
 * those collections are rewritten; otherwise every collection is written.
 */
export async function saveUserDataToSupabase(
  userId: string,
  payload: UserDataPayload,
  dirtyCollections?: CollectionName[],
  includeSingletons = true
) {
  if (!isSupabaseConfigured) {
    return;
  }

  const collections =
    dirtyCollections && dirtyCollections.length > 0 ? dirtyCollections : [...COLLECTION_NAMES];

  for (const collection of collections) {
    await replaceCollection(collection, payload);
  }

  if (includeSingletons) {
    await saveSingleton(userId, 'globalSettings', 'default', payload.globalSettings);
    await saveSingleton(userId, 'manualBalances', 'all', payload.manualBalances);
  }
}

async function fetchCollectionItems<T>(userId: string, collectionName: CollectionName): Promise<T[]> {
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

async function fetchSingletonItem<T>(
  userId: string,
  collectionName: string,
  documentId: string
): Promise<T | null> {
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
