-- Minimal stand-in for the parts of a Supabase database that our migrations
-- depend on: the auth and storage schemas, the anon/authenticated/service_role
-- roles, and auth.uid().
--
-- Used by `npm run db:verify` to apply supabase/migrations against a throwaway
-- local Postgres, so schema errors are caught without touching a real project.
-- It is NOT applied to a real Supabase database, where all of this already
-- exists and is managed by the platform.

create schema if not exists auth;
create schema if not exists storage;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
end
$$;

create table if not exists auth.users (
  id             uuid primary key default gen_random_uuid(),
  email          text unique,
  -- Local harness only: a salted SHA-256 digest, never a production scheme.
  -- Real Supabase stores a bcrypt hash and we never see or manage it.
  password_hash  text,
  user_metadata  jsonb not null default '{}'::jsonb,
  email_confirmed_at timestamptz,
  created_at     timestamptz not null default now()
);

-- Supabase reads the user id from the request JWT.
--
-- PostgREST 12 exposes the whole claim set as a JSON GUC (`request.jwt.claims`),
-- while older versions and our own SQL tests set the individual
-- `request.jwt.claim.sub` GUC. Both are supported so the same policies work
-- under PostgREST and under direct psql verification.
create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')::json ->> 'sub'
  )::uuid;
$$;

create or replace function auth.role()
returns text
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')::json ->> 'role',
    'anon'
  );
$$;

-- Columns added after the table first shipped; `create table if not exists`
-- above will not add them to an existing local database.
alter table auth.users add column if not exists password_hash text;
alter table auth.users add column if not exists user_metadata jsonb not null default '{}'::jsonb;
alter table auth.users add column if not exists email_confirmed_at timestamptz;

create table if not exists storage.buckets (
  id                 text primary key,
  name               text not null,
  public             boolean not null default false,
  file_size_limit    bigint,
  allowed_mime_types text[],
  created_at         timestamptz not null default now()
);

create table if not exists storage.objects (
  id          uuid primary key default gen_random_uuid(),
  bucket_id   text references storage.buckets (id),
  name        text,
  owner       uuid,
  metadata    jsonb,
  created_at  timestamptz not null default now()
);

alter table storage.objects enable row level security;

grant usage on schema public to anon, authenticated, service_role;
grant usage on schema storage to anon, authenticated, service_role;
