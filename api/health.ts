import { applyApiHeaders, handleHealth, type ApiRequestLike, type ApiResponseLike } from "../services/apiCore";

/**
 * GET /api/health
 * تابع سرورلس Vercel برای بررسی سلامت سرویس.
 */
export default async function handler(req: ApiRequestLike, res: ApiResponseLike) {
  if (applyApiHeaders(req, res)) return;

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return res.status(405).json({ success: false, error: 'متد نامعتبر است.' });
  }

  return handleHealth(req, res);
}
