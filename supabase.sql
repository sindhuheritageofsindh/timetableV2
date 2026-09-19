-- Timetable MVP Supabase schema
create extension if not exists pgcrypto;

create table if not exists schools (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  campus_name text default '',
  logo_url text default '',
  academic_year text default '',
  address text default '',
  created_at timestamptz not null default now()
);
create table if not exists classes (
  id uuid primary key default gen_random_uuid(), school_id uuid not null references schools(id) on delete cascade,
  name text not null, section text default '', active boolean not null default true, created_at timestamptz not null default now()
);
create table if not exists teachers (
  id uuid primary key default gen_random_uuid(), school_id uuid not null references schools(id) on delete cascade,
  name text not null, employee_id text default '', min_weekly_periods integer not null default 32,
  target_weekly_periods integer not null default 32, max_weekly_periods integer not null default 33,
  active boolean not null default true, created_at timestamptz not null default now(),
  check (min_weekly_periods >= 0), check (min_weekly_periods <= target_weekly_periods and target_weekly_periods <= max_weekly_periods)
);
create table if not exists subjects (
  id uuid primary key default gen_random_uuid(), school_id uuid not null references schools(id) on delete cascade,
  name text not null, short_name text default '', active boolean not null default true, created_at timestamptz not null default now()
);
create table if not exists class_subjects (
  id uuid primary key default gen_random_uuid(), class_id uuid not null references classes(id) on delete cascade,
  subject_id uuid not null references subjects(id) on delete cascade, weekly_periods integer not null default 1, priority integer not null default 1,
  unique(class_id, subject_id), check (weekly_periods >= 0), check (priority between 1 and 5)
);
create table if not exists teacher_assignments (
  id uuid primary key default gen_random_uuid(), class_id uuid not null references classes(id) on delete cascade,
  subject_id uuid not null references subjects(id) on delete cascade, teacher_id uuid not null references teachers(id) on delete cascade,
  unique(class_id, subject_id)
);
create table if not exists teacher_availability (
  id uuid primary key default gen_random_uuid(), teacher_id uuid not null references teachers(id) on delete cascade,
  day text not null, period integer not null, available boolean not null default true,
  unique(teacher_id, day, period), check (period > 0)
);
create table if not exists school_settings (
  id uuid primary key default gen_random_uuid(), school_id uuid not null unique references schools(id) on delete cascade,
  working_days text[] not null default array['Monday','Tuesday','Wednesday','Thursday','Friday'],
  periods_per_day integer not null default 8, period_duration integer not null default 40,
  break_configuration text not null default 'Break after Period 4',
  check (periods_per_day > 0), check (period_duration > 0)
);
create table if not exists timetables (
  id uuid primary key default gen_random_uuid(), school_id uuid not null references schools(id) on delete cascade,
  name text not null, status text not null default 'draft', created_at timestamptz not null default now(),
  check (status in ('draft','generated','published'))
);
create table if not exists timetable_entries (
  id uuid primary key default gen_random_uuid(), timetable_id uuid not null references timetables(id) on delete cascade,
  class_id uuid not null references classes(id) on delete cascade, subject_id uuid not null references subjects(id) on delete cascade,
  teacher_id uuid not null references teachers(id) on delete cascade, day text not null, period integer not null,
  locked boolean not null default false, unique(timetable_id, class_id, day, period), unique(timetable_id, teacher_id, day, period),
  check (period > 0)
);
create table if not exists constraints (
  id uuid primary key default gen_random_uuid(), school_id uuid not null references schools(id) on delete cascade,
  type text not null, configuration jsonb not null default '{}'::jsonb
);

create index if not exists idx_classes_school on classes(school_id);
create index if not exists idx_teachers_school on teachers(school_id);
create index if not exists idx_subjects_school on subjects(school_id);
create index if not exists idx_class_subjects_class on class_subjects(class_id);
create index if not exists idx_teacher_assignments_teacher on teacher_assignments(teacher_id);
create index if not exists idx_availability_teacher_day on teacher_availability(teacher_id, day, period);
create index if not exists idx_timetables_school on timetables(school_id, created_at desc);
create index if not exists idx_entries_timetable_day_period on timetable_entries(timetable_id, day, period);


-- Public schema/table grants are required in addition to RLS policies for the browser anon role.
-- Without these grants PostgREST can return PostgreSQL 42501 (permission denied).
grant usage on schema public to anon;
grant select, insert, update, delete on all tables in schema public to anon;
alter default privileges in schema public grant select, insert, update, delete on tables to anon;

-- No-auth MVP: the anon client must be able to read/write the app's own tables.
-- This is intentionally permissive because Supabase Auth is not used in this version.
-- Replace these policies with tenant-scoped RLS policies when authentication is introduced.
do $$
declare t text;
begin
  foreach t in array array['schools','classes','teachers','subjects','class_subjects','teacher_assignments','teacher_availability','school_settings','timetables','timetable_entries','constraints'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists %I_anon_all on %I', t, t);
    execute format('create policy %I_anon_all on %I for all to anon using (true) with check (true)', t, t);
  end loop;
end $$;

-- Seed one school record if the database is empty; the UI can replace it during setup.
insert into schools (name, campus_name, academic_year)
select 'Your School', 'Main Campus', '2026-27'
where not exists (select 1 from schools);

insert into school_settings (school_id)
select id from schools s where not exists (select 1 from school_settings ss where ss.school_id = s.id)
  and s.name = 'Your School';
