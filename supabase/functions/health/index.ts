import { handlePreflight, jsonResponse } from '../_shared/cors.ts';

Deno.serve((req: Request) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;

  return jsonResponse(req, {
    status: 'ok',
    supabase: true,
    timestamp: new Date().toISOString(),
  });
});
