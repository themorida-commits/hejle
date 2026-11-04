// ─────────────────────────────────────────────────────────────────────────────
// پروکسی سروری AI (P0-07): کلید Gemini فقط روی سرور (env) می‌ماند و هرگز به
// باندل کلاینت نمی‌رسد — مشکل نشت کلید در نسخهٔ فعلی حجله همین‌جا بسته می‌شود.
// Netlify Functions v2 — POST /.netlify/functions/ai-chat  { prompt, system? }
// ─────────────────────────────────────────────────────────────────────────────

const MODEL = 'gemini-2.5-flash';
const MAX_PROMPT_CHARS = 8000;

// محدودیت نرخ سادهٔ درون‌حافظه‌ای (بهترین تلاش؛ نمونهٔ تابع بی‌حالت است)
const hits = new Map<string, { count: number; windowStart: number }>();
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 20;

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const rec = hits.get(ip);
  if (!rec || now - rec.windowStart > WINDOW_MS) {
    hits.set(ip, { count: 1, windowStart: now });
    return false;
  }
  rec.count += 1;
  return rec.count > MAX_PER_WINDOW;
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return json(500, { error: 'ai_not_configured' });

  const ip = req.headers.get('x-nf-client-connection-ip') ?? 'unknown';
  if (rateLimited(ip)) return json(429, { error: 'rate_limited' });

  let payload: { prompt?: unknown; system?: unknown };
  try {
    payload = (await req.json()) as typeof payload;
  } catch {
    return json(400, { error: 'invalid_json' });
  }
  const prompt = typeof payload.prompt === 'string' ? payload.prompt.trim() : '';
  const system = typeof payload.system === 'string' ? payload.system : undefined;
  if (!prompt) return json(400, { error: 'prompt_required' });
  if (prompt.length > MAX_PROMPT_CHARS) return json(413, { error: 'prompt_too_long' });

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
      }),
    },
  );
  if (!res.ok) return json(502, { error: 'ai_upstream_error', status: res.status });

  const data = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const text = data.candidates?.[0]?.content?.parts?.map(p => p.text ?? '').join('') ?? '';
  return json(200, { text });
}
