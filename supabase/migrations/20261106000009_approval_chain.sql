-- ─────────────────────────────────────────────────────────────────────────────
-- مایگریشن ۰۰۰۹ — زنجیرهٔ تأیید چندمرحله‌ای مرخصی: گام فعلی + تاریخچهٔ اقدام‌ها
-- روی leave_requests. خودِ زنجیره (ترتیب نقش‌ها) در hospitals.settings با کلید
-- leaveApprovalChain نگه داشته می‌شود (ستون jsonb از مایگریشن ۰۰۰۱ هست و
-- سیاست hospitals_update نوشتن را به hospital_admin محدود کرده است).
-- approvals: آرایهٔ {step, role, by, decision, at} — ردپای حسابرسی در خود رکورد.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.leave_requests
  add column if not exists approval_step integer not null default 0;

alter table public.leave_requests
  add column if not exists approvals jsonb not null default '[]'::jsonb;
