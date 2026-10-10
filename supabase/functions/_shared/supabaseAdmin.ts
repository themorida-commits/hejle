const supabaseUrl = (Deno.env.get('SUPABASE_URL') ?? '').replace(/\/+$/, '');
const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

export const isSupabaseEnvReady = Boolean(supabaseUrl && anonKey);

export interface CallerIdentity {
  userId: string | null;
  rateLimitKey: string;
}

function hashString(value: string): string {
  let hash = 5381;
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 33) ^ value.charCodeAt(i);
  }
  return (hash >>> 0).toString(36);
}

function getClientIp(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for') ?? req.headers.get('cf-connecting-ip') ?? '';
  const first = forwarded.split(',')[0]?.trim();
  return first || 'unknown';
}

/**
 * توکن JWT را از طریق سرویس Auth اعتبارسنجی می‌کند.
 * اگر توکن معتبر نبود، درخواست به‌عنوان مهمان در نظر گرفته
 * و بر اساس IP محدودسازی می‌شود.
 */
export async function identifyCaller(req: Request): Promise<CallerIdentity> {
  const authorization = req.headers.get('Authorization') ?? '';
  const token = authorization.replace(/^Bearer\s+/i, '').trim();

  if (token && isSupabaseEnvReady) {
    try {
      const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
        headers: {
          apikey: anonKey,
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const user = await response.json() as { id?: string };
        if (user?.id) {
          return { userId: user.id, rateLimitKey: `user:${user.id}` };
        }
      }
    } catch (error) {
      console.warn('JWT verification request failed:', error);
    }
  }

  return { userId: null, rateLimitKey: `ip:${hashString(getClientIp(req))}` };
}

export interface AiQuotaOptions {
  endpoint: string;
  rateLimitKey: string;
}

/**
 * بررسی سهمیه‌ی درخواست‌های هوش مصنوعی از طریق تابع دیتابیس.
 * در صورت بروز خطای دیتابیس، اجازه‌ی ادامه داده می‌شود (fail-open)
 * تا سرویس به‌کلی قطع نشود.
 */
export async function enforceAiQuota(options: AiQuotaOptions): Promise<boolean> {
  if (!supabaseUrl || !serviceRoleKey) {
    return true;
  }

  const maxRequests = Number(Deno.env.get('AI_RATE_LIMIT_MAX') ?? '30');
  const windowSeconds = Number(Deno.env.get('AI_RATE_LIMIT_WINDOW_SECONDS') ?? '60');

  try {
    const response = await fetch(`${supabaseUrl}/rest/v1/rpc/try_consume_ai_quota`, {
      method: 'POST',
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        p_user_key: options.rateLimitKey,
        p_endpoint: options.endpoint,
        p_max_requests: maxRequests,
        p_window_seconds: windowSeconds,
      }),
    });

    if (!response.ok) {
      console.error('Rate limit RPC failed, allowing request:', response.status);
      return true;
    }

    return Boolean(await response.json());
  } catch (error) {
    console.error('Rate limit check crashed, allowing request:', error);
    return true;
  }
}
