const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const PRIMARY_MODEL = Deno.env.get('GEMINI_MODEL_PRIMARY') || 'gemini-3.5-flash';
const FALLBACK_MODEL = Deno.env.get('GEMINI_MODEL_FALLBACK') || 'gemini-3.1-flash-lite';
// سقف زمان هر تلاش درخواست به Gemini: ۸ ثانیه
const GEMINI_TIMEOUT_MS = Number(Deno.env.get('GEMINI_TIMEOUT_MS') ?? '8000');
// بودجه‌ی کل زمانی برای کل زنجیره (مدل اصلی + جایگزین)
const AI_TOTAL_BUDGET_MS = Number(Deno.env.get('AI_TOTAL_BUDGET_MS') ?? '8000');
// حاشیه‌ی امنیتی: شروع fallback فقط اگر این مقدار زمان باقی مانده باشد
const AI_BUDGET_MIN_REMAINING_MS = 250;

export const GEMINI_QUOTA_MESSAGE =
  'سهمیه رایگان درخواست‌های هوش مصنوعی (Quota Limit) برای سرور موقتاً به پایان رسیده است. لطفا چند دقیقه بعد دوباره امتحان کنید یا از پنل تنظیمات یک کلید تجاری فعال نمایید.';

export const AI_BUDGET_MESSAGE =
  'زمان پاسخ‌دهی سرویس هوش مصنوعی به سر رسید. لطفاً دوباره تلاش کنید.';

function isQuotaError(message: string): boolean {
  return (
    message.includes('limit') ||
    message.includes('quota') ||
    message.includes('RESOURCE_EXHAUSTED') ||
    message.includes('429') ||
    message.includes('PERMISSION_DENIED')
  );
}

export async function generateWithGemini(parts: string[], systemInstruction?: string): Promise<string> {
  const apiKey = Deno.env.get('GEMINI_API_KEY');
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
    } catch (error: unknown) {
      lastError = error instanceof Error ? error.message : String(error);
      console.warn(`Model ${model} failed, trying next fallback. Error:`, lastError);
    } finally {
      clearTimeout(timeout);
    }
  }

  if (isQuotaError(lastError)) {
    throw new Error(GEMINI_QUOTA_MESSAGE);
  }

  throw new Error(lastError || 'ارتباط با سرویس هوش مصنوعی ناموفق بود.');
}
