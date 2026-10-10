import {
  applyApiHeaders,
  handleChatResponse,
  isBodyTooLarge,
  type ApiRequestLike,
  type ApiResponseLike,
} from "../services/apiCore.js";

const BODY_TOO_LARGE_MESSAGE = 'حجم داده‌های درخواست بیش از حد مجاز (۴.۵ مگابایت) است.';

/**
 * POST /api/get-chat-response
 * تابع سرورلس Vercel — منطق مشترک در services/apiCore.ts نگهداری می‌شود.
 */
export default async function handler(req: ApiRequestLike, res: ApiResponseLike) {
  if (applyApiHeaders(req, res)) return;

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'متد نامعتبر است.' });
  }

  if (isBodyTooLarge(req)) {
    return res.status(413).json({ success: false, error: BODY_TOO_LARGE_MESSAGE });
  }

  return handleChatResponse(req, res);
}
