import { applyApiHeaders, type ApiRequestLike, type ApiResponseLike } from "../services/apiCore";

/**
 * /api — مسیر نامعتبر: پاسخ JSON ۴۰۴ (به‌جای HTML پیش‌فرض SPA).
 */
export default async function handler(req: ApiRequestLike, res: ApiResponseLike) {
  if (applyApiHeaders(req, res)) return;

  res.status(404).json({ success: false, error: 'مسیر API یافت نشد.' });
}
