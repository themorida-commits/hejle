import { handlePreflight, jsonResponse } from '../_shared/cors.ts';
import { PayloadTooLargeError, readJsonBody } from '../_shared/http.ts';
import { enforceAiQuota, identifyCaller } from '../_shared/supabaseAdmin.ts';
import { generateScheduleDeterministic } from '../_shared/scheduler/schedulerSolver.ts';

const MAX_PERSONNEL = 400;
const MAX_BODY_ARRAY = 5000;
const PAYLOAD_TOO_LARGE_MESSAGE = 'حجم داده‌های درخواست بیش از حد مجاز (۴.۵ مگابایت) است.';

Deno.serve(async (req: Request) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;

  if (req.method !== 'POST') {
    return jsonResponse(req, { success: false, error: 'متد نامعتبر است.' }, 405);
  }

  const caller = await identifyCaller(req);
  const allowed = await enforceAiQuota({ endpoint: 'generate-schedule', rateLimitKey: caller.rateLimitKey });
  if (!allowed) {
    return jsonResponse(
      req,
      { success: false, error: 'تعداد درخواست‌ها بیش از حد مجاز است. لطفاً کمی بعد دوباره تلاش کنید.' },
      429
    );
  }

  try {
    const body = (await readJsonBody(req)) as Record<string, any>;

    const { personnel, shiftTypes, currentSchedule, requests, jMonth, jYear, rules, aiSettings, dailyReqs, globalSettings, manualBalances } = body ?? {};

    if (!Array.isArray(personnel) || !Array.isArray(shiftTypes)) {
      return jsonResponse(req, { success: false, error: 'ساختار درخواست نامعتبر است.' }, 400);
    }
    if (personnel.length > MAX_PERSONNEL || shiftTypes.length > MAX_BODY_ARRAY) {
      return jsonResponse(req, { success: false, error: 'حجم داده‌های درخواست بیش از حد مجاز است.' }, 413);
    }
    if (!Number.isInteger(jMonth) || jMonth < 1 || jMonth > 12) {
      return jsonResponse(req, { success: false, error: 'ماه جلالی نامعتبر است.' }, 400);
    }
    if (!Number.isInteger(jYear) || jYear < 1300 || jYear > 1500) {
      return jsonResponse(req, { success: false, error: 'سال جلالی نامعتبر است.' }, 400);
    }

    if (personnel.length === 0) {
      return jsonResponse(req, { success: true, schedule: [] });
    }

    const defaultGlobalSettings = {
      employmentStatuses: [],
      roleDeductions: [],
      seniorityDeductions: [],
      reminderLeadDays: 1,
      defaultReminderMinutes: 60,
    };

    const schedule = generateScheduleDeterministic({
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

    return jsonResponse(req, { success: true, schedule });
  } catch (error: unknown) {
    if (error instanceof PayloadTooLargeError) {
      return jsonResponse(req, { success: false, error: PAYLOAD_TOO_LARGE_MESSAGE }, 413);
    }
    const message = error instanceof Error ? error.message : 'internal solver error';
    console.error('Edge Function scheduling error:', error);
    return jsonResponse(req, { success: false, error: message }, 500);
  }
});
