import healthHandler from '../api/health';
import scheduleHandler from '../api/generate-schedule';
import chatHandler from '../api/get-chat-response';
import apiIndexHandler from '../api/index';
import { MOCK_PERSONNEL, MOCK_SHIFT_TYPES, DEFAULT_RULES } from '../constants';

/**
 * دودتست قرارداد API توابع Vercel (api/*.ts) بدون نیاز به استقرار.
 * اجرا: npx tsx scripts/api-smoke.ts
 */

type MockResponse = {
  statusCode: number;
  body: unknown;
  headers: Record<string, string>;
  status(code: number): MockResponse;
  json(body: unknown): MockResponse;
  setHeader(name: string, value: string): void;
};

function mockResponse(): MockResponse {
  const res: MockResponse = {
    statusCode: 200,
    body: undefined,
    headers: {},
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(body: unknown) {
      res.body = body;
      return res;
    },
    setHeader(name: string, value: string) {
      res.headers[name] = value;
    },
  };
  return res;
}

async function call(
  handler: (req: any, res: any) => Promise<unknown>,
  method: string,
  body?: unknown,
  headers: Record<string, string> = {},
): Promise<MockResponse> {
  const req = { method, headers, body };
  const res = mockResponse();
  await handler(req, res);
  return res;
}

let failures = 0;
function check(name: string, condition: boolean, detail?: unknown): void {
  if (condition) {
    console.log(`PASS  ${name}`);
  } else {
    failures += 1;
    console.error(`FAIL  ${name}`, detail ?? '');
  }
}

async function main(): Promise<void> {
  const globalSettings = {
    employmentStatuses: [],
    roleDeductions: [],
    seniorityDeductions: [],
    reminderLeadDays: 1,
    defaultReminderMinutes: 60,
  };

  // ۱) سلامت سرویس
  const health = await call(healthHandler, 'GET');
  check('health 200 + status ok', health.statusCode === 200 && (health.body as any)?.status === 'ok', health.body);
  check('health security headers set', health.headers['X-Content-Type-Options'] === 'nosniff', health.headers);

  // ۲) پیش‌پرواز OPTIONS
  const preflight = await call(scheduleHandler, 'OPTIONS', {}, { origin: 'https://example.com' });
  check('OPTIONS 204', preflight.statusCode === 204, preflight.statusCode);

  // ۳) متد نامعتبر
  const wrongMethod = await call(scheduleHandler, 'GET');
  check('wrong method 405', wrongMethod.statusCode === 405, wrongMethod.body);

  // ۴) تولید برنامه‌ی معتبر
  const validBody = {
    personnel: MOCK_PERSONNEL.slice(0, 12),
    shiftTypes: MOCK_SHIFT_TYPES,
    currentSchedule: [],
    requests: [],
    jMonth: 6,
    jYear: 1404,
    rules: DEFAULT_RULES,
    aiSettings: {
      distributionAlgorithm: 'even',
      minRestHours: 12,
      maxConsecutiveWorkDays: 3,
      weekendDistribution: 'even',
    },
    globalSettings,
    manualBalances: {},
  };
  const schedule = await call(scheduleHandler, 'POST', validBody, { 'content-length': '1000' });
  const scheduleResult = schedule.body as any;
  check(
    'generate-schedule 200 + success + schedule array',
    schedule.statusCode === 200 && scheduleResult?.success === true && Array.isArray(scheduleResult?.schedule) && scheduleResult.schedule.length > 0,
    { status: schedule.statusCode, body: schedule.body },
  );

  // ۵) اعتبارسنجی بدنه‌ی نامعتبر
  const invalidBody = await call(scheduleHandler, 'POST', { personnel: 'x', shiftTypes: [] }, { 'content-length': '10' });
  check('generate-schedule 400 on invalid shape', invalidBody.statusCode === 400, invalidBody.body);

  // ۶) سقف ۴.۵ مگابایت
  const hugeBody = { personnel: [], shiftTypes: [], jMonth: 1, jYear: 1404, pad: 'x'.repeat(5 * 1024 * 1024) };
  const tooLarge = await call(scheduleHandler, 'POST', hugeBody, { 'content-length': String(6 * 1024 * 1024) });
  check('generate-schedule 413 on >4.5MB', tooLarge.statusCode === 413, tooLarge.statusCode);

  // ۷) چت بدون GEMINI_API_KEY → خطای فارسیِ قراردادی
  delete process.env.GEMINI_API_KEY;
  const consoleError = console.error;
  console.error = () => {};
  let chatNoKey: MockResponse;
  let lastChatStatus = 0;
  let lastChatBody: unknown;
  try {
    chatNoKey = await call(chatHandler, 'POST', { prompt: 'سلام', history: [] }, { 'content-length': '20' });
    check(
      'chat 500 + missing-key message',
      chatNoKey.statusCode === 500 && String((chatNoKey.body as any)?.error ?? '').includes('GEMINI_API_KEY'),
      chatNoKey.body,
    );

    // ۸) محدودسازی نرخ: ۳۰ درخواست مجاز، درخواست ۳۱ام → ۴۲۹
    for (let i = 0; i < 31; i += 1) {
      const res = await call(chatHandler, 'POST', { prompt: 'سلام', history: [] }, { 'content-length': '20' });
      lastChatStatus = res.statusCode;
      lastChatBody = res.body;
    }
  } finally {
    console.error = consoleError;
  }
  check('chat rate limit 429 on request 31', lastChatStatus === 429, { status: lastChatStatus, body: lastChatBody });

  // ۹) مسیر نامعتبر /api
  const notFound = await call(apiIndexHandler, 'GET');
  check('api root 404 JSON', notFound.statusCode === 404 && (notFound.body as any)?.success === false, notFound.body);

  if (failures > 0) {
    console.error(`\n${failures} check(s) failed.`);
    process.exit(1);
  }
  console.log('\nAll smoke checks passed.');
}

void main();
