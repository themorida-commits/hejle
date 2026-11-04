import { solveOnce, type SolveResponseMessage } from '../core/scheduling/solveRequest';
import type { GenerateScheduleParams } from '../core/scheduling/schedulerSolver';
import type { ScheduleEntry } from '../core/types';

// کلاینت حل‌کننده: اگر Web Worker در دسترس باشد حل در ورکر انجام می‌شود،
// وگرنه (تست، SSR، مرورگر قدیمی) روی نخ اصلی — خروجی هر دو مسیر قطعی و یکسان است.
export class ScheduleSolverClient {
  private worker: Worker | null = null;
  private seq = 0;
  private pending = new Map<number, (entries: ScheduleEntry[]) => void>();

  private ensureWorker(): Worker | null {
    if (this.worker) return this.worker;
    if (typeof Worker === 'undefined') return null;
    try {
      this.worker = new Worker(
        new URL('../core/scheduling/solverWorker.ts', import.meta.url),
        { type: 'module' },
      );
      this.worker.onmessage = (e: MessageEvent<SolveResponseMessage>) => {
        const resolve = this.pending.get(e.data.id);
        if (resolve) {
          this.pending.delete(e.data.id);
          resolve(e.data.entries);
        }
      };
      return this.worker;
    } catch {
      return null;
    }
  }

  async solve(params: GenerateScheduleParams): Promise<ScheduleEntry[]> {
    const worker = this.ensureWorker();
    if (!worker) return solveOnce(params);
    const id = ++this.seq;
    return new Promise((resolve) => {
      this.pending.set(id, resolve);
      worker.postMessage({ id, type: 'solve', params });
    });
  }

  dispose(): void {
    this.worker?.terminate();
    this.worker = null;
    this.pending.clear();
  }
}

export const scheduleSolver = new ScheduleSolverClient();
