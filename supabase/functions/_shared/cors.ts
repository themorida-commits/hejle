const DEFAULT_ALLOWED_ORIGINS = ['*'];

function getAllowedOrigins(): string[] {
  const raw = Deno.env.get('ALLOWED_ORIGINS') ?? '';
  const origins = raw.split(',').map((origin) => origin.trim()).filter(Boolean);
  return origins.length > 0 ? origins : DEFAULT_ALLOWED_ORIGINS;
}

function resolveCorsOrigin(req: Request): string {
  const allowed = getAllowedOrigins();
  if (allowed.includes('*')) {
    return '*';
  }
  const origin = req.headers.get('Origin') ?? '';
  return allowed.includes(origin) ? origin : allowed[0];
}

export function withCors(req: Request, response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set('Access-Control-Allow-Origin', resolveCorsOrigin(req));
  headers.set('Vary', 'Origin');
  headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, apikey');
  headers.set('X-Content-Type-Options', 'nosniff');

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export function jsonResponse(req: Request, body: unknown, status = 200): Response {
  return withCors(
    req,
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
    })
  );
}

export function handlePreflight(req: Request): Response | null {
  if (req.method === 'OPTIONS') {
    return withCors(req, new Response(null, { status: 204 }));
  }
  return null;
}
