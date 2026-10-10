# پلن آماده‌سازی و استقرار Hejleh App روی Vercel (پلن Hobby)

> وضعیت: آماده‌ی اجرا. اجرا باید توسط یک agent با دسترسی کد انجام شود (این پلن در حالت plan تولید شد).
> قاعده‌ی سرنخ: **تا اجازه‌ی صریح کاربر، دیپلوی نکن** (فاز ۷ فقط با تأیید کاربر).

---

## ۱. تصمیمات تأییدشده

| # | تصمیم | مقدار |
|---|-------|-------|
| ۱ | سقف مدت توابع Vercel | `maxDuration: 10` (گاردریل UX/هزینه — سقف واقعی Hobby طبق مستندات ۲۰۲۶ برابر ۳۰۰ ثانیه است، ۱۰ ثانیه اجباری نیست) |
| ۲ | بودجه داخلی AI | `AI_TOTAL_BUDGET_MS=8000` (< ۱۰ ثانیه با حاشیه‌ی خطا) |
| ۳ | Supabase | پیکربندی‌شده؛ `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` به‌عنوان env زمان build |
| ۴ | `VITE_API_BASE_URL` | روی Vercel **تنظیم نشود** (فرانت به `/api/...` همان origin می‌زند) |
| ۵ | کلید Gemini | توسط کاربر در Vercel تنظیم می‌شود؛ executor فقط placeholder راهنما می‌نویسد |
| ۶ | ارکستراسیون | هیبرید: اجرای اصلی در سشن کیلو (Task tool) + ریویو موازی اختیاری با agentic-flow |

## ۲. یافته‌های ریویو کدبیس (زمینه)

**معماری فعلی:** SPA (Vite 6 + React 19 + Tailwind bundled) + سه مسیر بک‌اند:
- `server.ts` — Express خودمیزبار (برای self-host؛ دست‌نخورده می‌ماند)
- `supabase/functions/*` — Edge Functions با Rate Limit مبتنی بر DB (دست‌نخورده می‌ماند)
- `api/*.ts` — مسیر Vercel، نیازمند بازسازی (فاز ۱)

**نقاط ضعف مسیر Vercel (علت فاز ۱–۳):**
1. هر ۴ فایل `api/*` کل اپ Express را export می‌کنند → cold start سنگین، سرو استاتیک تکراری با CDN، `fs.existsSync(process.cwd()+'/dist')` در serverless ناپایدار، و پاسخ HTML ۲۰۰ به‌جای JSON ۴۰۴ برای مسیرهای نامعتبر `/api/*`
2. `express.json({ limit: "5mb" })` از سقف ۴.۵MB بدنه‌ی درخواست توابع Vercel (خطای ۴۱۳ `FUNCTION_PAYLOAD_TOO_LARGE`) تجاوز می‌کند
3. `GEMINI_TIMEOUT_MS=30000` به‌صورت **هر مدل** + دو مدل متوالی → بدترین حالت ۶۰ ثانیه
4. مسیر Vercel هیچ Rate Limiting ندارد (env های `AI_RATE_LIMIT_*` مستند شده‌اند ولی فقط در مسیر Supabase استفاده می‌شوند)
5. مسیر Vercel allowlist `ALLOWED_ORIGINS` سرور Express را از دست داده

**نکات مثبت تثریه‌شده:** RLS کامل در `supabase/schema.sql` (هر کاربر فقط سند خودش)، اعتبارسنجی ورودی در `services/apiCore.ts` (`MAX_PERSONNEL=400`، `MAX_BODY_ARRAY=5000`، ماه/سال جلالی، طول prompt ≤۴۰۰۰)، تاریخچه ≤۲۰ پیام، بدون سکرت هاردکدشده، `.gitignore` صحیح (`.env*`، `dist`)، باندل ۹۶۴KB، تولید برنامه **قطعی** و بدون وابستگی به AI (فقط چت به Gemini نیاز دارد).

**بدهی فنی خارج از دامنه:** تکرار solver در `services/schedulerSolver.ts` (۵۰۲ خط) و کپی Supabase (۵۰۴ خط)؛ عدم ارسال/مصرف `roleSettings` در `handleGenerateSchedule` (کلاینت می‌فرستد، handler نادیده می‌گیرد — بی‌خطر)؛ `reviwe.md` کهن (معماری Firebase).

## ۳. فازهای اجرا

### فاز ۱ — بازسازی توابع Vercel (بدون Express، بدون fs)

`api/generate-schedule.ts`:
```ts
import { handleGenerateSchedule, type ApiRequestLike, type ApiResponseLike } from "../services/apiCore";

const MAX_BODY_BYTES = 4.5 * 1024 * 1024; // سقف Vercel

export default async function handler(req: ApiRequestLike, res: ApiResponseLike) {
  if (req.method !== "POST") return res.status(405).json({ success: false, error: "متد نامعتبر است." });
  const length = Number(req.headers?.["content-length"] ?? 0);
  const size = length || JSON.stringify(req.body ?? {}).length;
  if (size > MAX_BODY_BYTES) return res.status(413).json({ success: false, error: "حجم داده‌های درخواست بیش از حد مجاز (۴.۵ مگابایت) است." });
  return handleGenerateSchedule(req, res);
}
```
- `api/get-chat-response.ts`: همان الگو با `handleChatResponse`
- `api/health.ts`: متد GET + `handleHealth`
- `api/index.ts` → تبدیل به handler حداقلیِ JSON 404 برای مسیرهای نامعتبر `/api/*`
- حذف کامل `import express` و `fs` و `express.static` و catch-all از `api/*` (استاتیک را CDN ورسل سرو می‌کند)
- بازگرداندن CORS هم‌ارز `server.ts`: ACAO فقط اگر origin در `ALLOWED_ORIGINS` باشد + هدرهای `X-Content-Type-Options: nosniff` و `Referrer-Policy`
- `server.ts` و وابستگی `express` در `package.json` دست‌نخورده (مسیر self-host)

**تایپ‌ها:** دقیقاً از `ApiRequestLike` / `ApiResponseLike` موجود در `services/apiCore.ts` استفاده شود؛ در صورت نیاز به IP برای Rate Limit، تایپ لوکال handler با `headers` گسترش یابد. **هیچ وابستگی npm جدیدی اضافه نشود** (به‌ویژه `express-rate-limit` که فقط transitive است).

### فاز ۲ — بودجه‌ی زمان Gemini

`vercel.json`:
```json
{ "version": 2, "framework": "vite", "outputDirectory": "dist",
  "functions": { "api/*.ts": { "maxDuration": 10 } },
  "headers": [{ "source": "/(.*)", "headers": [
    { "key": "X-Content-Type-Options", "value": "nosniff" },
    { "key": "Referrer-Policy", "value": "strict-origin-when-cross-origin" }]}] }
```
`services/apiCore.ts` — `generateWithGemini`:
- `const TOTAL_BUDGET_MS = Number(process.env.AI_TOTAL_BUDGET_MS ?? 8000)` و `deadline = Date.now() + TOTAL_BUDGET_MS`
- در حلقه‌ی دو مدل: اگر `Date.now() >= deadline` → شکست با خطای فارسی «زمان پاسخ‌دهی به سر رسید»؛ timeout هر تلاش = `min(GEMINI_TIMEOUT_MS, deadline - Date.now())`
- `GEMINI_TIMEOUT_MS` به‌عنوان سقف **هر تلاش** حفظ شود (نه بودجه‌ی کل)
- fallback مدل فقط وقتی اجرا شود که خطای primary سریع باشد (مثلاً quota/429) — با بودجه‌ی باقی‌مانده

### فاز ۳ — Rate Limiting مسیر Vercel

- limiter slid-window درون‌حافظه‌ای (Map) در `apiCore.ts` (~۲۰ خط، بدون وابستگی جدید)
- کلید: IP از `x-forwarded-for[0]` (ورژن Vercel آن را ست می‌کند) + نام endpoint
- سقف: `AI_RATE_LIMIT_MAX` (پیش‌فرض ۳۰) / `AI_RATE_LIMIT_WINDOW_SECONDS` (پیش‌فرض ۶۰) — همان envهای مستندشده در `.env.example`
- پاسخ ۴۲۹: همان پیام فارسی مسیر Supabase («تعداد درخواست‌ها ... بیش از حد مجاز است»)
- محدودیت شناخته‌شده: حافظه‌ی per-instance (با cold start ری‌ست می‌شود) — برای مقیاس Hobby قابل قبول؛ جایگزین DB-backed (RPC موجود در Supabase) به‌صورت بهبود آتی ثبت شود

### فاز ۴ — پیکربندی env

- `.env.example`: افزودن `AI_TOTAL_BUDGET_MS=8000`، یادداشت «روی Vercel خالی bماند: VITE_API_BASE_URL»، یادداشت سقف ۴.۵MB و `maxDuration=10`
- Vercel env زمان **اجرا**: `GEMINI_API_KEY` (کاربر)، `GEMINI_MODEL_PRIMARY`، `GEMINI_MODEL_FALLBACK`، `AI_TOTAL_BUDGET_MS=8000`، `AI_RATE_LIMIT_MAX`، `AI_RATE_LIMIT_WINDOW_SECONDS`، `ALLOWED_ORIGINS` (خالی یا دامنه‌ی deploy)
- Vercel env زمان **build**: `VITE_SUPABASE_URL`، `VITE_SUPABASE_ANON_KEY` (از پروژه‌ی Supabase کاربر)
- Supabase Dashboard → Authentication → URL Configuration: افزودن `https://<domain-deploy>` به Site URL و `<origin>/**` به redirect allowlist (OAuth گوگل `redirectTo: window.location.origin` است — `App.tsx:195`)

### فاز ۵ — اعتبارسنجی پیش از دیپلوی

1. `npm run lint` (tsc --noEmit) → بدون خطا
2. `npm run build` → موفق؛ `du -sh dist` < ۱MB
3. `grep -r "GEMINI_API_KEY\|apiKey" dist/assets` → خالی (کلید نباید در باندل کلاینت باشد)
4. `grep -rn "express\|from \"fs\"" api/` → خالی
5. آزمون محلی handlers (tsx/node مستقیم یا `npx vercel dev`): `/api/health` → ۲۰۰؛ `/api/generate-schedule` با payload کوچک (از `MOCK_PERSONNEL` در `constants.ts`) → schedule؛ `/api/get-chat-response` → متن فارسی؛ پاسخ ۴۱۳/۴۲۹/۴۰۵ طبق قرارداد خطای JSON
6. SPA fallback: مسیر عمیق (مثل `/settings`) → ۲۰۰ + `index.html`

### فاز ۶ — استقرار (فقط با اجازه‌ی صریح کاربر)

پیش‌نیازها: فاز ۱–۵ سبز، `GEMINI_API_KEY` و `VITE_*` در Vercel تنظیم‌شده.

```bash
# توکن فقط از env خوانده شود؛ هرگز در فایل/آرگومان ذخیره نشود
VERCEL_TOKEN=<token-provided-by-user-at-deploy-time> npx vercel --prod
```
- اگر پروژه‌ی Vercel موجود نیست: `npx vercel link` / ساخت پروژه‌ی جدید (نام پیشنهادی: `hejleh-app`)
- تست‌های دود بعد از deploy:
  - `GET https://<domain>/api/health` → ۲۰۰ JSON
  - `POST /api/generate-schedule` (payload کوچک) → `{success:true, schedule:[...]}`
  - `POST /api/get-chat-response` → متن فارسی (تأیید کارکرد `GEMINI_API_KEY`)
- بررسی لاگ‌های Vercel برای `FUNCTION_INVOCATION_TIMEOUT` / `FUNCTION_PAYLOAD_TOO_LARGE` / ۴۲۹

### فاز ۷ — پس از استقرار و بهداشت امنیتی

1. **چرخش توکن**: توکن ورسل در چت به‌صورت متن ساده ارسال شد → کاربر آن را revoke/rotate کند. executor توکن را فقط در همان لحظه‌ی deploy از متغیر محیطی می‌خواند و در هیچ فایلی (از جمله همین پلن) ذخیره نمی‌کند
2. تأیید end-to-end ورود گوگل (redirect allowlist)
3. توصیه: فعال‌سازی Vercel Authentication برای Preview Deployment ها (Hobby پشتیبانی می‌کند)
4. اختیاری/بعداً: دامنه‌ی اختصاصی، بازگرداندن `roleSettings` در handler، یکسان‌سازی solverهای تکراری، به‌روزرسانی `reviwe.md`

## ۴. ریسک‌ها

| ریسک | کاهش |
|------|------|
| تأخیر Gemini > ۸ ثانیه → تایم‌اوت تابع | بودجه‌ی کل + خطای فارسی خوانا؛ سقف ۴۲۹ کوتاه‌مدت بوده و مسیر quota message پوشش دارد |
| تنظیم‌نشدن `VITE_SUPABASE_*` در build → fallback خاموش به localStorage | بخش «تایپ‌ها» فاز ۵ غلظ‌یابی با grep باندل برای project ref؛ چک‌لیست تأیید قبل از deploy |
| سهمیه‌ی رایگان Gemini RPM | Rate limiter فاز ۳ + fallback مدل سبک‌تر |
| limiter درون‌حافظه‌ای با cold start ری‌ست می‌شود | برای مقیاس Hobby کافی؛ DB-backed به‌عنوان بهبود آتی |
| استفاده‌ی تجاری (بیمارستان) روی Hoby طبق ToS ورسل مجاز نیست | اطلاع‌رسانی به کاربر؛ ارتقا به Pro در صورت نیاز تجاری |
| توکن در چت لو رفته | چرخش فوری پس از deploy (فاز ۷) |

## ۵. سوالات باز

- دامنه‌ی اختصاصی؟ (بعد از استقرار اولیه)
- اگر AI در تولید ۴۲۹/تایم‌اوت زیاد دید، بودجه به ۳۰ ثانیه (`maxDuration: 30`) رفت؟ — تصمیم پس از داشتن لاگ واقعی

## ۶. ارکستراسیون اجرا (هیبرید)

- **تنفیذ اصلی:** agent کدِ درون همین سشن؛ زیروظایفه‌های موازی با Task tool (مثلاً یک explorer برای grepهای تاییدی، یک tester برای اسکریپت دود)
- **ریویو موازی اختیاری:** پس از تغییرها، در صورت تمایل کاربر: `npx agentic-flow --agent reviewer` / `tester` به‌عنوان نظریه‌ی دومِ مستقل (کانتکست این سشن را ندارند؛ یافته‌ها باید صریح به executor داده شوند)
