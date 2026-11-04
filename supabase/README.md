# Supabase — حجله نسخهٔ ۲

## چیدمان

- `migrations/20261103000001_core_schema.sql` — اسکیمای رابطه‌ای چندمستأجری + RLS (۱۸ جدول، گیت G2).
  روی پروژهٔ Supabase حجله فقط با دستور صریح «اجرا کن» اعمال می‌شود؛ تا آن زمان فقط روی دیتابیس محلی تست شده است.
- `tests/00_local_stub.sql` — استاب اسکیمای `auth` برای Postgres خام (فقط تست محلی؛ روی Supabase واقعی هرگز اجرا نشود).
- `tests/01_rls_leak_tests.sql` — ۸ تست نشت بین‌مستأجری و نقش‌ها.
- `tests/run_rls_tests.sh` — اجرای کامل: ساخت دیتابیس موقت، اعمال استاب + مایگریشن، اجرای تست‌ها، پاک‌سازی. (`npm run test:rls`)

## مدل دسترسی

دسترسی فقط از `memberships` می‌گذرد: نقش‌های `hospital_admin` / `hr_admin` / `ward_manager` / `staff`؛
عضویت با `ward_id` تهی = کل بیمارستان، با `ward_id` = فقط همان بخش.
توابع کمکی `member_hospital_ids` / `can_view_ward` / `has_ward_role` / `has_hospital_role` (همه security definer) قلب سیاست‌ها هستند.
`audit_log` فقط درج و خواندن مدیریتی دارد؛ grant ویرایش/حذف از همه گرفته شده است.
