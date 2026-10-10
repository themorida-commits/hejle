<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# Hejleh App — مدیریت هوشمند شیفت

سامانه مدیریت و برنامه‌ریزی شیفت پرسنل بیمارستان/کلینیک با تقویم جلالی،
موتور برخوردگری قوانین و دستیار هوش مصنوعی. بک‌اند کامل روی **Supabase**
(Postgres + RLS + Auth + Edge Functions).

## اجرای محلی

**پیش‌نیازها:** Node.js 22+

```bash
npm ci
cp .env.example .env.local   # مقادیر را پر کنید
npm run dev                  # http://localhost:3000
```

بدون تنظیم `VITE_SUPABASE_*` برنامه در حالت محلی (localStorage) کار می‌کند.

## استقرار روی Supabase

راهنمای کامل (دیتابیس، Auth، Edge Functions، CORS، امنیت، سرعت و
عیب‌یابی) در [`supabase/README.md`](supabase/README.md) آماده است.

خلاصه:

```bash
# ۱. اجرای supabase/schema.sql در SQL Editor پروژه
# ۲. استقرار توابع سرور
supabase secrets set GEMINI_API_KEY=...
supabase functions deploy health
supabase functions deploy generate-schedule
supabase functions deploy get-chat-response
# ۳. ساخت فرانت‌اند و آپلود dist/ روی میزبان استاتیک
npm run build
```

## اسکریپت‌ها

| دستور | کار |
|---|---|
| `npm run dev` | سرور توسعه (Vite + Express) |
| `npm run build` | بیلد فرانت‌اند (`dist/`) و سرور (`dist/server.cjs`) |
| `npm start` | اجرای سرور production (فرانت + API یک‌جا) |
| `npm run lint` | بررسی تایپ‌ها (`tsc --noEmit`) |
| `npm run check:supabase` | تست اتصال به Supabase |
