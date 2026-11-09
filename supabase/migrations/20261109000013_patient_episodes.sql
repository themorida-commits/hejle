-- حجله v2 — مایگریشن ۰۰۱۳: پروندهٔ بیمار (لایهٔ پاسخگویی اپیزود — دور ۱۶)
-- مبنای طراحی: پژوهش استانداردهای پرونده/مستندسازی پرستاری (برگ پذیرش ایران،
-- راهنمای وزارت بهداشت ۱۴۰۲، FHIR Encounter/CareTeam) — سند طراحی:
-- hejleh-patient-episode-design-fa.md. مرز با HIS: دستورات، کاردکس، نتایج و
-- سیر بیماری اینجا نیست؛ این جداول فقط پاسخگویی را نگه می‌دارند: چرا پذیرش شد،
-- پزشک معالج کیست، هر شیفت پرستار مسئول کیست، گزارش امضاشده‌اش چیست و تحویل
-- به چه کسی انجام شد. اعمال روی دیتابیس زنده فقط با دستور صریح سعید.

create table public.patients (
  id uuid primary key default gen_random_uuid(),
  hospital_id uuid not null references public.hospitals(id) on delete cascade,
  full_name text not null,
  national_code text,
  file_no text not null,
  birth_date date,
  gender text check (gender in ('female','male')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (hospital_id, file_no)
);

create table public.admissions (
  id uuid primary key default gen_random_uuid(),
  hospital_id uuid not null references public.hospitals(id) on delete cascade,
  ward_id uuid not null references public.wards(id) on delete cascade,
  patient_id uuid not null references public.patients(id) on delete cascade,
  admitted_at timestamptz not null default now(),
  admission_type text not null default 'elective' check (admission_type in ('emergency','elective','transfer')),
  admission_source text,
  chief_complaint text,
  admission_reason text not null,
  diagnosis_text text,
  diagnosis_icd10 text,
  attending_name text not null,
  attending_council_no text,
  attending_service text,
  bed_label text,
  insurance_type text,
  insurance_no text,
  allergy_summary text,
  status text not null default 'admitted' check (status in ('admitted','discharged','transferred','deceased','lama')),
  discharged_at timestamptz,
  discharge_note text,
  created_by uuid references public.employees(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index admissions_ward_status_idx on public.admissions (ward_id, status);
create index admissions_patient_idx on public.admissions (patient_id);

create table public.patient_assignments (
  id uuid primary key default gen_random_uuid(),
  hospital_id uuid not null references public.hospitals(id) on delete cascade,
  ward_id uuid not null references public.wards(id) on delete cascade,
  admission_id uuid not null references public.admissions(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  role text not null default 'responsible' check (role in ('responsible','associate','charge')),
  shift text not null check (shift in ('morning','evening','night')),
  service_date date not null,
  assigned_by uuid references public.employees(id),
  source text not null default 'manual' check (source in ('roster','manual','handover')),
  created_at timestamptz not null default now()
);
create index assignments_admission_idx on public.patient_assignments (admission_id, service_date);
create index assignments_employee_idx on public.patient_assignments (employee_id, service_date);

create table public.nursing_reports (
  id uuid primary key default gen_random_uuid(),
  hospital_id uuid not null references public.hospitals(id) on delete cascade,
  ward_id uuid not null references public.wards(id) on delete cascade,
  admission_id uuid not null references public.admissions(id) on delete cascade,
  assignment_id uuid references public.patient_assignments(id) on delete set null,
  author_employee_id uuid not null references public.employees(id) on delete cascade,
  shift text not null check (shift in ('morning','evening','night')),
  report_date date not null,
  body jsonb not null default '{}',
  status text not null default 'draft' check (status in ('draft','signed')),
  signed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index reports_admission_idx on public.nursing_reports (admission_id, report_date);

create table public.handovers (
  id uuid primary key default gen_random_uuid(),
  hospital_id uuid not null references public.hospitals(id) on delete cascade,
  ward_id uuid not null references public.wards(id) on delete cascade,
  admission_id uuid not null references public.admissions(id) on delete cascade,
  from_assignment_id uuid references public.patient_assignments(id) on delete set null,
  to_assignment_id uuid references public.patient_assignments(id) on delete set null,
  giver_employee_id uuid not null references public.employees(id) on delete cascade,
  receiver_employee_id uuid not null references public.employees(id) on delete cascade,
  handover_at timestamptz not null default now(),
  sbar jsonb not null default '{}',
  state_summary text,
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);
create index handovers_admission_idx on public.handovers (admission_id, handover_at);

alter table public.patients enable row level security;
alter table public.admissions enable row level security;
alter table public.patient_assignments enable row level security;
alter table public.nursing_reports enable row level security;
alter table public.handovers enable row level security;
grant select, insert, update, delete on public.patients to authenticated;
grant select, insert, update, delete on public.admissions to authenticated;
grant select, insert, update, delete on public.patient_assignments to authenticated;
grant select, insert, update, delete on public.nursing_reports to authenticated;
grant select, insert, update, delete on public.handovers to authenticated;

-- خواندن: هر عضو بیمارستان (نقش‌های بالینی و مدیریتی در رابط کاربری محدود می‌شوند).
create policy patients_select on public.patients for select to authenticated
  using (hospital_id in (select public.member_hospital_ids()));
create policy admissions_select on public.admissions for select to authenticated
  using (hospital_id in (select public.member_hospital_ids()));
create policy assignments_select on public.patient_assignments for select to authenticated
  using (hospital_id in (select public.member_hospital_ids()));
create policy reports_select on public.nursing_reports for select to authenticated
  using (hospital_id in (select public.member_hospital_ids()));
create policy handovers_select on public.handovers for select to authenticated
  using (hospital_id in (select public.member_hospital_ids()));

-- نوشتن: سرپرستار بخش، مترون و مدیر بیمارستان (سطح بیمارستان)؛ گزارش را خود
-- پرستارِ نویسنده هم می‌تواند بنویسد/امضا کند.
-- بیمار موجودیت سطح بیمارستان است (بخش ندارد)؛ نوشتن برای اعضای بیمارستان
-- آزاد است و پذیرشِ بخش‌دار گیت اصلی است (نقش‌ها در رابط کاربری محدودند).
create policy patients_write on public.patients for all to authenticated
  using (hospital_id in (select public.member_hospital_ids()))
  with check (hospital_id in (select public.member_hospital_ids()));
create policy admissions_write on public.admissions for all to authenticated
  using (public.has_hospital_role(hospital_id, array['hospital_admin','matron']::public.membership_role[])
         or public.has_ward_role(hospital_id, ward_id, array['ward_manager']::public.membership_role[]))
  with check (public.has_hospital_role(hospital_id, array['hospital_admin','matron']::public.membership_role[])
         or public.has_ward_role(hospital_id, ward_id, array['ward_manager']::public.membership_role[]));
create policy assignments_write on public.patient_assignments for all to authenticated
  using (public.has_hospital_role(hospital_id, array['hospital_admin','matron']::public.membership_role[])
         or public.has_ward_role(hospital_id, ward_id, array['ward_manager']::public.membership_role[]))
  with check (public.has_hospital_role(hospital_id, array['hospital_admin','matron']::public.membership_role[])
         or public.has_ward_role(hospital_id, ward_id, array['ward_manager']::public.membership_role[]));
create policy reports_write on public.nursing_reports for all to authenticated
  using (public.has_hospital_role(hospital_id, array['hospital_admin','matron']::public.membership_role[])
         or public.has_ward_role(hospital_id, ward_id, array['ward_manager']::public.membership_role[])
         or author_employee_id in (select public.my_employee_ids()))
  with check (public.has_hospital_role(hospital_id, array['hospital_admin','matron']::public.membership_role[])
         or public.has_ward_role(hospital_id, ward_id, array['ward_manager']::public.membership_role[])
         or author_employee_id in (select public.my_employee_ids()));
create policy handovers_write on public.handovers for all to authenticated
  using (public.has_hospital_role(hospital_id, array['hospital_admin','matron']::public.membership_role[])
         or public.has_ward_role(hospital_id, ward_id, array['ward_manager']::public.membership_role[])
         or giver_employee_id in (select public.my_employee_ids())
         or receiver_employee_id in (select public.my_employee_ids()))
  with check (public.has_hospital_role(hospital_id, array['hospital_admin','matron']::public.membership_role[])
         or public.has_ward_role(hospital_id, ward_id, array['ward_manager']::public.membership_role[])
         or giver_employee_id in (select public.my_employee_ids())
         or receiver_employee_id in (select public.my_employee_ids()));
