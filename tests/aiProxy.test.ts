// P0-07: تست پروکسی AI — بدون کلید خطا می‌دهد، ورودی را اعتبارسنجی می‌کند،
// و درخواست سالم را با کلید سرور به بالادست می‌فرستد (fetch بالادست mock است).
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import handler from '../netlify/functions/ai-chat';

const realFetch = globalThis.fetch;
const realKey = process.env.GEMINI_API_KEY;

function post(body: unknown): Request {
  return new Request('https://example.netlify.app/.netlify/functions/ai-chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => { process.env.GEMINI_API_KEY = 'server-only-key'; });
afterEach(() => {
  globalThis.fetch = realFetch;
  if (realKey === undefined) delete process.env.GEMINI_API_KEY;
  else process.env.GEMINI_API_KEY = realKey;
});

test('A-1 بدون کلید سرور: ۵۰۰ و هیچ فراخوانی بالادستی', async () => {
  delete process.env.GEMINI_API_KEY;
  let called = false;
  globalThis.fetch = async () => { called = true; return new Response('{}'); };
  const res = await handler(post({ prompt: 'سلام' }));
  assert.equal(res.status, 500);
  assert.equal(called, false);
});

test('A-2 پرامپت خالی: ۴۰۰', async () => {
  const res = await handler(post({ prompt: '  ' }));
  assert.equal(res.status, 400);
});

test('A-3 درخواست سالم: متن مدل برمی‌گردد و کلید فقط در هدر سرور است', async () => {
  let seenKey: string | null = null;
  globalThis.fetch = async (_input: unknown, init?: RequestInit) => {
    seenKey = new Headers(init?.headers).get('x-goog-api-key');
    return new Response(JSON.stringify({
      candidates: [{ content: { parts: [{ text: 'پاسخ دستیار' }] } }],
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  const res = await handler(post({ prompt: 'برنامه را توضیح بده' }));
  assert.equal(res.status, 200);
  const body = (await res.json()) as { text: string };
  assert.equal(body.text, 'پاسخ دستیار');
  assert.equal(seenKey, 'server-only-key');
});

test('A-4 خطای بالادست: ۵۰۲', async () => {
  globalThis.fetch = async () => new Response('nope', { status: 503 });
  const res = await handler(post({ prompt: 'تست' }));
  assert.equal(res.status, 502);
});
