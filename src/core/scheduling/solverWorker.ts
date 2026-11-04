import { solveOnce, type SolveRequestMessage, type SolveResponseMessage } from './solveRequest';

// ورکر حل‌کننده (P0-05): اجرای ۵۰۰ تلاش حل‌کننده نباید نخ اصلی و UI را قفل کند.
const ctx = self as unknown as {
  onmessage: ((e: MessageEvent<SolveRequestMessage>) => void) | null;
  postMessage: (msg: SolveResponseMessage) => void;
};

ctx.onmessage = (e) => {
  const { id, params } = e.data;
  const entries = solveOnce(params);
  ctx.postMessage({ id, type: 'solved', entries });
};
