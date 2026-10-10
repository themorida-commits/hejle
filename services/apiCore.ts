import { generateScheduleDeterministic } from './schedulerSolver';
import type { ScheduleEntry } from '../types';

/**
 * هسته‌ی مشترک endpointهای سرور.
 * این ماژول هم توسط سرور Express (server.ts) و هم توسط توابع
 * سرورلس Vercel (api/index.ts) استفاده می‌شود تا منطق API
 * در exactly یک نقطه نگهداری شود.
 *
 * نکته امنیتی: GEMINI_API_KEY فقط در سمت سرور خوانده می‌شود و
 * هرگز به کلاینت نمی‌رود.
 */

export interface ApiResponseLike {
  status(code: number): ApiResponseLike;
  json(body: unknown): void;
}

export interface ApiRequestLike<TBody = any> {
  body?: TBody;
}

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const PRIMARY_MODEL = process.env.GEMINI_MODEL_PRIMARY || 'gemini-3.5-flash';
const FALLBACK_MODEL = process.env.GEMINI_MODEL_FALLBACK || 'gemini-3.1-flash-lite';
const GEMINI_TIMEOUT_MS = Number(process.env.GEMINI_TIMEOUT_MS) || 30000;

const MAX_PERSONNEL = 400;
const MAX_BODY_ARRAY = 5000;

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
  let lastError = '';

  for (const model of models) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);

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
      clearTimeout(timeout);

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

    const schedule: ScheduleEntry[] = generateScheduleDeterministic({
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
