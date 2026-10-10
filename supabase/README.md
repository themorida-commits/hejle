# استقرار Hejleh App روی Supabase

این پروژه از **Supabase** به‌عنوان بک‌اند کامل استفاده می‌کند:

| سرویس Supabase | کاربرد در این پروژه |
|---|---|
| **Postgres + RLS** | ذخیره‌ی تمام داده‌ها (پرسنل، شیفت‌ها، قوانین، بایگانی...) در جدول `app_data` |
| **Auth (Google OAuth)** | ورود کاربران با حساب گوگل |
| **Edge Functions** | endpointهای هوش مصنوعی (`generate-schedule`, `get-chat-response`, `health`) |
| **Functions + RPC** | جایگزینی اتمیک مجموعه‌ها و محدودسازی نرخ درخواست |

نکته: Supabase خودش میزبان فرانت‌اند (SPA) نیست؛ خروجی `dist/` را روی
هر میزبان استاتیک (Vercel / Netlify / Nginx / Object Storage) قرار دهید.

---

## ۱. ساخت پروژه و دیتابیس

```bash
# نصب CLI (یک‌بار)
npm install -g supabase

# ورود و اتصال به پروژه
supabase login
supabase link --project-ref YOUR-PROJECT-REF
```

سپس در **Supabase Dashboard → SQL Editor → New query** محتوای
`schema.sql` را اجرا کنید. این فایل:

- جدول `app_data` را با RLS (هر کاربر فقط داده‌ی خودش) می‌سازد
- تابع `replace_collection` را برای نوشتن اتمیک یک مجموعه می‌سازد
- جدول و تابع محدودسازی نرخ (`try_consume_ai_quota`) را می‌سازد
- `user_id` را به `auth.users` متصل می‌کند (حذف کاربر = حذف داده‌ها)

## ۲. فعال‌سازی ورود با گوگل

Dashboard → **Authentication → Providers → Google**:

1. یک OAuth Client ID در Google Cloud Console بسازید.
2. Authorized redirect URI را دقیقاً به این شکل وارد کنید:
   `https://YOUR-PROJECT-REF.supabase.co/auth/v1/callback`
3. Client ID و Client Secret را در پنل Supabase ذخیره کنید.

Dashboard → **Authentication → URL Configuration**:

- Site URL: آدرس نهایی فرانت‌اند (مثلاً `https://hejleh.example.com`)
- Redirect URLs: همان Site URL (و `http://localhost:3000` برای توسعه)

## ۳. استقرار Edge Functions

```bash
# کلیدهای سرور (فقط سمت سرور؛ هیچ‌وقت با VITE_ ذخیره نشوند)
supabase secrets set GEMINI_API_KEY=YOUR-GEMINI-API-KEY
supabase secrets set GEMINI_MODEL_PRIMARY=gemini-3.5-flash
supabase secrets set GEMINI_MODEL_FALLBACK=gemini-3.1-flash-lite
supabase secrets set AI_RATE_LIMIT_MAX=30
supabase secrets set AI_RATE_LIMIT_WINDOW_SECONDS=60
supabase secrets set ALLOWED_ORIGINS=https://hejleh.example.com

supabase functions deploy health
supabase functions deploy generate-schedule
supabase functions deploy get-chat-response
```

سرویس‌های Supabase (Auth و RPC) به‌صورت خودکار در توابع از طریق
`SUPABASE_URL`، `SUPABASE_ANON_KEY` و `SUPABASE_SERVICE_ROLE_KEY`
در دسترس هستند و نیازی به تنظیم دستی ندارند.

تست سریع:

```bash
curl https://YOUR-PROJECT-REF.supabase.co/functions/v1/health
# {"status":"ok","supabase":true,...}
```

## ۴. ساخت و استقرار فرانت‌اند

```bash
cp .env.example .env.local      # و مقادیر را پر کنید
npm ci
npm run build                  # خروجی در dist/
```

محتوای `dist/` را روی میزبان استاتیکی خود آپلود کنید.
برای میزبان‌های رایج:

- **Vercel**: `vercel.json` از قبل تنظیم است (`npm run build` → `dist`)
- **Netlify**: build command `npm run build`، publish directory `dist`
- **Nginx**: `root /var/www/hejleh/dist;` + `try_files $uri /index.html;`

### گزینه‌ی جایگزین: سرور Express خودمیزبان

اگر ترجیح می‌دهید کل برنامه (فرانت + API) یک‌جا و بدون Edge Functions اجرا شود:

```bash
npm ci && npm run build
GEMINI_API_KEY=... PORT=3000 NODE_ENV=production npm start
```

در این حالت `VITE_API_BASE_URL` را **خالی** بگذارید تا فرانت‌اند
`/api/...` را روی همان origin صدا بزند.

## ۵. بایدها و نبایدها

### بایدها

- ✅ `schema.sql` را **قبل از** اولین ورود کاربر اجرا کنید (بدون آن هیچ داده‌ای ذخیره نمی‌شود)
- ✅ کلید `anon` را در فرانت‌اند استفاده کنید؛ ایمنی داده‌ها از جانب **RLS** تأمین می‌شود، نه پنهان‌سازی کلید
- ✅ کلید `service_role` را **فقط** در Edge Functions / سرور نگه دارید (هرگز در مرورگر)
- ✅ در Google Cloud Console محدوده‌ی OAuth consent را تنظیم و در production روی «Verified» قرار دهید
- ✅ برای سرویس‌گر واقعی از دامنه‌ی اختصاصی + HTTPS استفاده کنید
- ✅ `ALLOWED_ORIGINS` را در production روی دامنه‌ی واقعی محدود کنید
- ✅ از Supabase Backups (نقطه‌ی بازیابی/PITR) برای پشتیبان‌گیری دوره‌ای استفاده کنید

### نبایدها

- ❌ `GEMINI_API_KEY` را با پیشوند `VITE_` ذخیره نکنید (در باندل مرورگر افشا می‌شود)
- ❌ کلید `service_role` را در کلاینت استفاده نکنید (دسترسی کامل به دیتابیس)
- ❌ RLS را غیرفعال نکنید و policy جدیدی با `using (true)` نسازید
- ❌ در توابع Edge از `verify_jwt = false` گذر نکنید مگر برای endpoint عمومی؛ محدودسازی نرخ همیشه فعال باشد
- ❌ داده‌های حساس (کد ملی، شماره تماس) را در لاگ بنویسید
- ❌ از CDN‌های شخص ثالث برای اسکریپت/فونت در production استفاده نکنید (پروژه فونت را self-host می‌کند)

## ۶. امنیت

- **RLS**: چهار policy (`select/insert/update/delete`) فقط با `user_id = auth.uid()`
- **جایگزینی اتمیک**: `replace_collection` با `security invoker` اجرا می‌شود؛ کاربر نمی‌تواند داده‌ی کاربر دیگر را بنویسد
- **محدودسازی نرخ**: `try_consume_ai_quota` سهمیه‌ی هر کاربر/IP را در جدول `ai_request_log` می‌شمارد؛ لاگ‌ها با pg_cron پاک می‌شوند
- **سقف داده**: هر سند حداکثر ۱ مگابایت؛ فقط مجموعه‌های مجاز پذیرفته می‌شوند
- **CORS**: در Edge Functions و Express فقط originهای تعریف‌شده در `ALLOWED_ORIGINS`
- **کلید Gemini**: فقط در سرور/Edge Function؛ کلاینت با fetch به endpointها وصل می‌شود

## ۷. سرعت و بهینه‌سازی

- فرانت‌اند بصورت **code-split** بیلد می‌شود (هر صفحه به‌صورت lazy)
- Tailwind در زمان build کامپایل می‌شود (بدون CDN و بدون FOUC)
- فونت Vazirmatn self-host شده (بدون درخواست به Google Fonts)
- همگام‌سازی ابری **debounce ۱.۵ ثانیه‌ای** و فقط برای مجموعه‌های تغییرکرده
- نوشتن روی ابر با یک RPC تراکنشنی به‌جای ۱۰ درخواست جدا
- کش طولانی برای `assets/*` در میزبان استاتیک (Vite هش می‌زند)

## ۸. عیب‌یابی

| نشانه | علت | راه‌حل |
|---|---|---|
| لاگین کار نمی‌کند | Redirect URI اشتباه | `https://<ref>.supabase.co/auth/v1/callback` |
| داده‌ها ذخیره نمی‌شوند | `schema.sql` اجرا نشده | SQL Editor را دوباره اجرا کنید |
| خطای ۴۲۹ از AI | سهمیه نرخ | `AI_RATE_LIMIT_MAX` را تنظیم یا کلید تجاری بگذارید |
| «سرویس ابری پیکربندی نشده» | `VITE_SUPABASE_*` خالی است | `.env.local` را پر و دوباره build کنید |
| توابع ۴۰۴ می‌دهند | deploy نشده‌اند | `supabase functions deploy <name>` |
| CORS error | Allowlist | `ALLOWED_ORIGINS` را شامل origin فرانت‌اند کنید |

## ۹. همگام‌سازی کد scheduler در Edge Functions

`supabase/functions/_shared/scheduler/` نسخه‌ی آینه‌ای از
`services/schedulerSolver.ts`، `utils.ts`، `constants.ts` و `types.ts`
است (بدون وابستگی به Node). هر تغییر در نسخه‌ی اصلی باید در این
پوشه هم اعمال شود تا خروجی scheduling یکسان بماند.
