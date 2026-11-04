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
  -f supabase/migrations/20261103000002_audit_triggers.sql
psql -d "$DB" -f supabase/tests/01_rls_leak_tests.sql
psql -d "$DB" -f supabase/tests/02_audit_trigger_tests.sql
dropdb "$DB"
echo "G2 OK — دیتابیس تستی پاک شد."
