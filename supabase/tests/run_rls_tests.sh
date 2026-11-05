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
  -f supabase/migrations/20261104000004_credentials.sql \
  -f supabase/migrations/20261104000005_nursing_services.sql \
  -f supabase/migrations/20261105000006_karaneh_profiles.sql \
  -f supabase/migrations/20261105000007_special_leave_types.sql
psql -d "$DB" -f supabase/tests/01_rls_leak_tests.sql
psql -d "$DB" -f supabase/tests/02_audit_trigger_tests.sql
# تست‌های ۰۳ و ۰۴ روی صحنهٔ سید دمو اجرا می‌شوند (کارمند/بخش واقعیِ سید لازم دارند)
psql -d "$DB" -v ON_ERROR_STOP=1 -q -f supabase/seed.sql
psql -d "$DB" -f supabase/tests/03_attendance_tests.sql
psql -d "$DB" -f supabase/tests/04_credentials_tests.sql
psql -d "$DB" -f supabase/tests/05_nursing_services_tests.sql
psql -d "$DB" -f supabase/tests/06_karaneh_profiles_tests.sql
# تست ابزار Bootstrap: خروجی سمپل روی همین دیتابیس اعمال و شمارش‌ها سنجیده می‌شود
node tools/bootstrap/bootstrap-hospital.mjs --config tools/bootstrap/sample/hospital.json \
  --personnel tools/bootstrap/sample/staff.csv --out /tmp/bootstrap-test.sql >/dev/null
psql -d "$DB" -v ON_ERROR_STOP=1 -q -f /tmp/bootstrap-test.sql
psql -d "$DB" -v ON_ERROR_STOP=1 -q -c "do \$\$ declare e int; p int; begin
  select count(*) into e from public.employees where hospital_id = '9f37c415-56f2-5697-a49b-b4cc46ff66e9';
  select count(*) into p from public.nursing_packages where hospital_id = '9f37c415-56f2-5697-a49b-b4cc46ff66e9';
  if e <> 3 then raise exception 'BOOTSTRAP employees expected 3, got %', e; end if;
  if p <> 12 then raise exception 'BOOTSTRAP packages expected 12, got %', p; end if;
end \$\$;"
dropdb "$DB"
echo "G2+ATTENDANCE+CREDENTIALS+NURSING+KARANEH+BOOTSTRAP OK — دیتابیس تستی پاک شد."
