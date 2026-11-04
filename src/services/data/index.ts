import type { DataRepositories } from './types';
import { createDemoRepositories } from './demoRepositories';
import { createSupabaseRepositories } from './supabaseRepositories';
import { supabase, isSupabaseConfigured } from '../supabaseClient';

export type DataSource = 'demo' | 'supabase';

/** منبع داده از env: VITE_DATA_SOURCE=supabase (پیش‌فرض demo تا فعال‌سازی واقعی). */
export function currentDataSource(): DataSource {
  const metaEnv = (import.meta as { env?: Record<string, string | undefined> }).env;
  const v = metaEnv?.VITE_DATA_SOURCE ?? (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env.VITE_DATA_SOURCE;
  return v === 'supabase' && isSupabaseConfigured ? 'supabase' : 'demo';
}

export function createRepositories(source: DataSource = currentDataSource()): DataRepositories {
  return source === 'supabase' ? createSupabaseRepositories(supabase) : createDemoRepositories();
}

export * from './types';
export * from './mappers';
export { loadHospitalSnapshot } from './supabaseRepositories';
export { buildDemoSnapshot, createDemoRepositories, DEMO_HOSPITAL_ID } from './demoRepositories';
