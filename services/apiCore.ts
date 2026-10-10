import { generateScheduleDeterministic } from './schedulerSolver';
import type { ScheduleEntry } from '../types';

/**
 * هسته‌ی مشترک endpointهای سرور.
 * این ماژول هم توسط سرور Express (server.ts) و هم توسط توابع
 * سرورلس Vercel (api/index.ts) استفاده می‌شود تا منطق API
 * فقط در یک نقطه نگهداری شود.
 *
 * نکته امنیتی: GEMINI_API_KEY فقط در سمت سرور خوانده می‌شود و
 * هرگز به کلاینت نمی‌رود.
 */

export interface ApiResponseLike {
  status(code: number): ApiResponseLike;
  json(body: unknown): void;
  setHeader?(name: string, value: string): void;
}

export interface ApiRequestLike<TBody = any> {
  body?: TBody;
  method?: string;
  headers?: Record<string, string | string[] | undefined>;
}

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const PRIMARY_MODEL = process.env.GEMINI_MODEL_PRIMARY || 'gemini-3.5-flash';
const FALLBACK_MODEL = process.env.GEMINI_MODEL_FALLBACK || 'gemini-3.1-flash-lite';
// سقف زمان هر تلاش درخواست به Gemini: ۸ ثانیه (بودجه کل در AI_TOTAL_BUDGET_MS کنترل می‌شود)
const GEMINI_TIMEOUT_MS = Number(process.env.GEMINI_TIMEOUT_MS) || 8000;
// بودجه‌ی کل زمانی برای کل زنجیره (مدل اصلی + جایگزین) — باید کمتر از maxDuration تابع Vercel باشد
const AI_TOTAL_BUDGET_MS = Number(process.env.AI_TOTAL_BUDGET_MS ?? 8000);
// حاشیه‌ی امنیتی: شروع fallback فقط اگر این مقدار زمان باقی مانده باشد
const AI_BUDGET_MIN_REMAINING_MS = 250;

const MAX_PERSONNEL = 400;
const MAX_BODY_ARRAY = 5000;

function resolveMaxBodyBytes(): number {
    const fromEnv = Number(process.env.MAX_PAYLOAD_BYTES);
    if (Number.isFinite(fromEnv) && fromEnv > 0) {
        return fromEnv;
    }
    return 4.5 * 1024 * 1024;
}

// سقف بدنه‌ی درخواست/پاسخ توابع Vercel: ۴.۵ مگابایت (قابل تنظیم با MAX_PAYLOAD_BYTES)
export const MAX_BODY_BYTES = resolveMaxBodyBytes();

const AI_BUDGET_MESSAGE = 'زمان پاسخ‌دهی سرویس هوش مصنوعی به سر رسید. لطفاً دوباره تلاش کنید.';

// ---------------------------------------------------------------------------
// محدودسازی نرخ (اسلایدینگ‌ویندو درون‌حافظه‌ای؛ هم‌ارز با مسیر Supabase)
// ---------------------------------------------------------------------------
const RATE_LIMIT_MESSAGE =
  'تعداد درخواست‌ها به این سرویس بیش از حد مجاز است. لطفاً کمی بعد دوباره تلاش کنید.';
const RATE_LIMIT_MAX = Number(process.env.AI_RATE_LIMIT_MAX ?? 30);
const RATE_LIMIT_WINDOW_MS = Number(process.env.AI_RATE_LIMIT_WINDOW_SECONDS ?? 60) * 1000;
const RATE_LIMIT_MAX_BUCKETS = 5000;

const rateLimitBuckets = new Map<string, number[]>();

function getClientIp(req: ApiRequestLike): string {
    const forwarded = req.headers?.['x-forwarded-for'];
    const raw = Array.isArray(forwarded) ? forwarded[0] : forwarded ?? '';
    return raw.split(',')[0].trim() || 'unknown';
}

export function checkRateLimit(req: ApiRequestLike, endpoint: string): boolean {
    const now = Date.now();
    const key = `${endpoint}:${getClientIp(req)}`;
    const recent = (rateLimitBuckets.get(key) ?? []).filter((ts) => now - ts < RATE_LIMIT_WINDOW_MS);

    if (recent.length >= RATE_LIMIT_MAX) {
        rateLimitBuckets.set(key, recent);
        return false;
    }

    recent.push(now);
    rateLimitBuckets.set(key, recent);

    // پاکسازی فرصت‌ساز تا حافظه بی‌حد نباشد
    if (rateLimitBuckets.size > RATE_LIMIT_MAX_BUCKETS) {
        for (const [bucketKey, timestamps] of rateLimitBuckets) {
            if (timestamps.every((ts) => now - ts >= RATE_LIMIT_WINDOW_MS)) {
                rateLimitBuckets.delete(bucketKey);
            }
        }
    }

    return true;
}

// ---------------------------------------------------------------------------
// هدرهای امنیتی و CORS (هم‌ارز با میان‌افزار server.ts)
// ---------------------------------------------------------------------------
function getAllowedOrigins(): string[] {
    return (process.env.ALLOWED_ORIGINS || '')
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean);
}

/**
 * هدرهای مشترک امنیتی/CORS را ست می‌کند.
 * خروجی true به‌معنای پاسخ‌دهی کامل به درخواست OPTIONS است.
 */
export function applyApiHeaders(req: ApiRequestLike, res: ApiResponseLike): boolean {
    const allowedOrigins = getAllowedOrigins();
    const rawOrigin = req.headers?.origin;
    const origin = Array.isArray(rawOrigin) ? rawOrigin[0] : rawOrigin;

    if (origin && allowedOrigins.length > 0 && allowedOrigins.includes(origin)) {
        res.setHeader?.('Access-Control-Allow-Origin', origin);
        res.setHeader?.('Vary', 'Origin');
        res.setHeader?.('Access-Control-Allow-Credentials', 'true');
    }
    res.setHeader?.('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader?.('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader?.('X-Content-Type-Options', 'nosniff');
    res.setHeader?.('Referrer-Policy', 'strict-origin-when-cross-origin');

    if (req.method === 'OPTIONS') {
        res.status(204).json({});
        return true;
    }
    return false;
}

/** بررسی حجم بدنه در مرز سیستم (سقف ۴.۵ مگابایتی توابع Vercel). */
export function isBodyTooLarge(req: ApiRequestLike): boolean {
    const rawLength = req.headers?.['content-length'];
    const contentLength = Number(Array.isArray(rawLength) ? rawLength[0] : rawLength);
    if (Number.isFinite(contentLength) && contentLength > 0) {
        return contentLength > MAX_BODY_BYTES;
    }
    try {
        return Buffer.byteLength(JSON.stringify(req.body ?? {}), 'utf8') > MAX_BODY_BYTES;
    } catch {
        return false;
    }
}

const BODY_TOO_LARGE_MESSAGE = 'حجم داده‌های درخواست بیش از حد مجاز (۴.۵ مگابایت) است.';

/**
 * گارد سقف حجم بدنه در سطح خود handler — مستقل از مسیر صدا زدن
 * (Vercel route یا Express) اجرا می‌شود. خروجی true یعنی درخواست
 * با خطای ۴۱۳ پاسخ داده شده است.
 */
function rejectIfBodyTooLarge(req: ApiRequestLike, res: ApiResponseLike): boolean {
    if (!isBodyTooLarge(req)) {
        return false;
    }
    res.status(413).json({ success: false, error: BODY_TOO_LARGE_MESSAGE });
    return true;
}

function isQuotaError(message: string): boolean {
  return (
    message.includes('limit') ||
    message.includes('quota') ||
    message.includes('RESOURCE_EXHAUSTED') ||
    message.includes('429') ||
    message.includes('PERMISSION_DENIED')
  );
}

async function generateWithGemini(parts: string[], systemInstruction?: string): Promise<string> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        throw new Error('کلید هوش مصنوعی روی سرور تنظیم نشده است (GEMINI_API_KEY).');
    }

    const models = [PRIMARY_MODEL, FALLBACK_MODEL];
    const deadline = Date.now() + AI_TOTAL_BUDGET_MS;
    let lastError = '';

    for (const model of models) {
        const remaining = deadline - Date.now();
        if (remaining <= AI_BUDGET_MIN_REMAINING_MS) {
            lastError = AI_BUDGET_MESSAGE;
            break;
        }

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), Math.min(GEMINI_TIMEOUT_MS, remaining));

        try {
            const response = await fetch(`${GEMINI_API_BASE}/${model}:generateContent?key=${encodeURIComponent(apiKey)}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: parts.map((text) => ({ role: 'user', parts: [{ text }] })),
                    ...(systemInstruction ? { systemInstruction: { parts: [{ text: systemInstruction }] } } : {}),
                    generationConfig: {
                        temperature: 0.7,
                        maxOutputTokens: 2048,
                    },
                }),
                signal: controller.signal,
            });

            if (!response.ok) {
                const errorBody = await response.text().catch(() => '');
                throw new Error(`Gemini ${model} responded ${response.status}: ${errorBody.slice(0, 300)}`);
            }

            const data = await response.json();
            const text: string =
                data?.candidates?.[0]?.content?.parts
                    ?.map((part: { text?: string }) => part?.text ?? '')
                    .filter(Boolean)
                    .join('\n') ?? '';

            if (!text.trim()) {
                throw new Error(`Gemini ${model} returned an empty response`);
            }

            return text;
        } catch (error: any) {
            lastError = String(error?.message ?? error);
            console.warn(`Model ${model} failed, trying next fallback. Error:`, lastError);
        } finally {
            clearTimeout(timeout);
        }
    }

    if (isQuotaError(lastError)) {
        throw new Error(
            'سهمیه رایگان درخواست‌های هوش مصنوعی (Quota Limit) برای سرور موقتاً به پایان رسیده است. لطفا چند دقیقه بعد دوباره امتحان کنید یا از پنل تنظیمات یک کلید تجاری فعال نمایید.'
        );
    }

    throw new Error(lastError || 'ارتباط با سرویس هوش مصنوعی ناموفق بود.');
}

export async function handleHealth(_req: ApiRequestLike, res: ApiResponseLike) {
  res.status(200).json({
    status: 'ok',
    supabase: true,
    timestamp: new Date().toISOString(),
  });
}

export async function handleGenerateSchedule(req: ApiRequestLike, res: ApiResponseLike) {
  try {
    if (!checkRateLimit(req, 'generate-schedule')) {
      return res.status(429).json({ success: false, error: RATE_LIMIT_MESSAGE });
    }

    if (rejectIfBodyTooLarge(req, res)) {
      return;
    }

    const {
      personnel,
      shiftTypes,
      currentSchedule,
      requests,
      jMonth,
      jYear,
      rules,
      aiSettings,
      dailyReqs,
      globalSettings,
      manualBalances,
    } = req.body ?? {};

    // اعتبارسنجی در مرز سیستم
    if (!Array.isArray(personnel) || !Array.isArray(shiftTypes)) {
      return res.status(400).json({ success: false, error: 'ساختار درخواست نامعتبر است.' });
    }
    if (personnel.length > MAX_PERSONNEL || shiftTypes.length > MAX_BODY_ARRAY) {
      return res.status(413).json({ success: false, error: 'حجم داده‌های درخواست بیش از حد مجاز است.' });
    }
    if (!Number.isInteger(jMonth) || jMonth < 1 || jMonth > 12) {
      return res.status(400).json({ success: false, error: 'ماه جلالی نامعتبر است.' });
    }
    if (!Number.isInteger(jYear) || jYear < 1300 || jYear > 1500) {
      return res.status(400).json({ success: false, error: 'سال جلالی نامعتبر است.' });
    }

    if (personnel.length === 0) {
      return res.json({ success: true, schedule: [] });
    }

    const defaultGlobalSettings = {
      employmentStatuses: [],
      roleDeductions: [],
      seniorityDeductions: [],
      reminderLeadDays: 1,
      defaultReminderMinutes: 60,
    };

    const schedule: ScheduleEntry[] = generateScheduleDeterministic({
      personnel,
      shiftTypes,
      currentSchedule: Array.isArray(currentSchedule) ? currentSchedule : [],
      requests: Array.isArray(requests) ? requests : [],
      jMonth,
      jYear,
      rules: Array.isArray(rules) ? rules : [],
      aiSettings: aiSettings ?? {
        distributionAlgorithm: 'even',
        minRestHours: 12,
        maxConsecutiveWorkDays: 3,
        weekendDistribution: 'even',
      },
      dailyReqs,
      globalSettings: globalSettings ?? defaultGlobalSettings,
      manualBalances: manualBalances ?? {},
    });

    res.json({ success: true, schedule });
  } catch (error: any) {
    console.error('Server Deterministic Scheduling Error:', error);
    res.status(500).json({
      success: false,
      error: error?.message || 'Failed to generate schedule due to internal solver error',
    });
  }
}

export async function handleChatResponse(req: ApiRequestLike, res: ApiResponseLike) {
  try {
    if (!checkRateLimit(req, 'get-chat-response')) {
      return res.status(429).json({ success: false, error: RATE_LIMIT_MESSAGE });
    }

    if (rejectIfBodyTooLarge(req, res)) {
      return;
    }

    const { prompt, history, personnel, shiftTypes } = req.body ?? {};

    if (typeof prompt !== 'string' || prompt.trim().length === 0) {
      return res.status(400).json({ success: false, error: 'متن پیام خالی است.' });
    }
    if (prompt.length > 4000) {
      return res.status(413).json({ success: false, error: 'متن پیام بیش از حد طولانی است.' });
    }

    const safeHistory = Array.isArray(history) ? history.slice(-20) : [];

    const systemInstruction = `
You are Hejleh Logistics Assistant. A professional, polite assistant specializing in Iranian nurse shift logistics and Jalali calendar coordination.
Current state of the ward:
- Regular staff size: ${Array.isArray(personnel) ? personnel.length : 0}
- Configured Shift Types: ${Array.isArray(shiftTypes) ? shiftTypes.map((s: any) => `${s.name} (${s.symbol})`).join(', ') : ''}

Previous Conversation Context:
${safeHistory.map((m: any) => `${m.role}: ${m.content}`).join('\n')}

Respond accurately in Persian (Farsi), offering excellent feedback.
`;

    const text = await generateWithGemini([prompt], systemInstruction);

    res.json({ success: true, text });
  } catch (error: any) {
    console.error('Server AI Chat Error:', error);
    res.status(500).json({
      success: false,
      error: error?.message || 'Could not retrieve answer from AI assistant',
    });
  }
}
