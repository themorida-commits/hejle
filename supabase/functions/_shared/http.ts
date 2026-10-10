export const MAX_PAYLOAD_BYTES = resolveMaxPayloadBytes();

function resolveMaxPayloadBytes(): number {
  const fromEnv = Number(Deno.env.get('MAX_PAYLOAD_BYTES'));
  if (Number.isFinite(fromEnv) && fromEnv > 0) {
    return fromEnv;
  }
  // هم‌ارز با سقف بدنه‌ی توابع Vercel: ۴.۵ مگابایت
  return 4.5 * 1024 * 1024;
}

export class PayloadTooLargeError extends Error {
  constructor() {
    super('PAYLOAD_TOO_LARGE');
    this.name = 'PayloadTooLargeError';
  }
}

/** آیا هدر content-length از سقف مجاز بیشتر است؟ */
export function isPayloadTooLarge(req: Request): boolean {
  const contentLength = Number(req.headers.get('content-length') ?? 0);
  return Number.isFinite(contentLength) && contentLength > 0 && contentLength > MAX_PAYLOAD_BYTES;
}

/**
 * بدنه‌ی JSON را با رعایت سقف حجم می‌خواند.
 * ابتدا content-length بررسی می‌شود و سپس حجم واقعی بدنه اندازه‌گیری می‌گردد.
 */
export async function readJsonBody(req: Request): Promise<unknown> {
  if (isPayloadTooLarge(req)) {
    throw new PayloadTooLargeError();
  }

  const buffer = await req.arrayBuffer();
  if (buffer.byteLength > MAX_PAYLOAD_BYTES) {
    throw new PayloadTooLargeError();
  }

  return JSON.parse(new TextDecoder().decode(buffer));
}
