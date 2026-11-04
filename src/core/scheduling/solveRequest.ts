import { generateScheduleDeterministic, type GenerateScheduleParams } from './schedulerSolver';
import type { ScheduleEntry } from '../types';

// پروتکل پیام ورکر حل‌کننده — هم ورکر و هم مسیر جایگزین (تست/بدون ورکر) از همین‌جا می‌گذرند.
export interface SolveRequestMessage {
  id: number;
  type: 'solve';
  params: GenerateScheduleParams;
}

export interface SolveResponseMessage {
  id: number;
  type: 'solved';
  entries: ScheduleEntry[];
}

export function solveOnce(params: GenerateScheduleParams): ScheduleEntry[] {
  return generateScheduleDeterministic(params);
}
