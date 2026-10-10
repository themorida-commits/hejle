import { handlePreflight, jsonResponse } from '../_shared/cors.ts';
import { generateWithGemini } from '../_shared/gemini.ts';
import { enforceAiQuota, identifyCaller } from '../_shared/supabaseAdmin.ts';

const MAX_PROMPT_LENGTH = 4000;
const MAX_HISTORY_ITEMS = 20;

Deno.serve(async (req: Request) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;

  if (req.method !== 'POST') {
    return jsonResponse(req, { success: false, error: 'متد نامعتبر است.' }, 405);
  }

  const caller = await identifyCaller(req);
  const allowed = await enforceAiQuota({ endpoint: 'get-chat-response', rateLimitKey: caller.rateLimitKey });
  if (!allowed) {
    return jsonResponse(
      req,
      { success: false, error: 'تعداد درخواست‌ها به دستیار هوش مصنوعی بیش از حد مجاز است. لطفاً کمی بعد دوباره تلاش کنید.' },
      429
    );
  }

  try {
    const { prompt, history, personnel, shiftTypes } = await req.json();

    if (typeof prompt !== 'string' || prompt.trim().length === 0) {
      return jsonResponse(req, { success: false, error: 'متن پیام خالی است.' }, 400);
    }
    if (prompt.length > MAX_PROMPT_LENGTH) {
      return jsonResponse(req, { success: false, error: 'متن پیام بیش از حد طولانی است.' }, 413);
    }

    const safeHistory = Array.isArray(history) ? history.slice(-MAX_HISTORY_ITEMS) : [];

    const systemInstruction = `
You are Hejleh Logistics Assistant. A professional, polite assistant specializing in Iranian nurse shift logistics and Jalali calendar coordination.
Current state of the ward:
- Regular staff size: ${Array.isArray(personnel) ? personnel.length : 0}
- Configured Shift Types: ${Array.isArray(shiftTypes) ? shiftTypes.map((s: { name: string; symbol: string }) => `${s.name} (${s.symbol})`).join(', ') : ''}

Previous Conversation Context:
${safeHistory.map((m: { role: string; content: string }) => `${m.role}: ${m.content}`).join('\n')}

Respond accurately in Persian (Farsi), offering excellent feedback.
`;

    const text = await generateWithGemini([prompt], systemInstruction);

    return jsonResponse(req, { success: true, text });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Could not retrieve answer from AI assistant';
    console.error('Edge Function chat error:', error);
    return jsonResponse(req, { success: false, error: message }, 500);
  }
});
