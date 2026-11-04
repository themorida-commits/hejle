#!/usr/bin/env bash
# تست نشت RLS (گیت G2) روی Postgres محلی مک — دیتابیس موقت ساخته و پاک می‌شود.
# پیش‌نیاز: Postgres محلی در حال اجرا (brew services). روی Supabase واقعی لازم نیست.
set -euo pipefail
cd "$(dirname "$0")/../.."

DB=hejleh_v2_test
dropdb --if-exists "$DB"
createdb "$DB"
psql -d "$DB" -v ON_ERROR_STOP=1 -q \
  -f supabase/tests/00_local_stub.sql \
  -f supabase/migrations/20261103000001_core_schema.sql \
  -f supabase/migrations/20261103000002_audit_triggers.sql \
  -f supabase/migrations/20261104000003_attendance.sql \
  -f supabase/migrations/20261104000004_credentials.sql
psql -d "$DB" -f supabase/tests/01_rls_leak_tests.sql
psql -d "$DB" -f supabase/tests/02_audit_trigger_tests.sql
# تست‌های ۰۳ و ۰۴ روی صحنهٔ سید دمو اجرا می‌شوند (کارمند/بخش واقعیِ سید لازم دارند)
psql -d "$DB" -v ON_ERROR_STOP=1 -q -f supabase/seed.sql
psql -d "$DB" -f supabase/tests/03_attendance_tests.sql
psql -d "$DB" -f supabase/tests/04_credentials_tests.sql
dropdb "$DB"
echo "G2+ATTENDANCE+CREDENTIALS OK — دیتابیس تستی پاک شد."
