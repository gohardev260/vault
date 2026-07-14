-- ============================================================
--  Vault — Supabase Schema
--  Run this in Supabase → SQL Editor → New Query → Run
-- ============================================================

-- Saved passwords table (pointing user_id to Supabase's native auth.users table)
create table if not exists saved_passwords (
  id                 uuid        primary key default gen_random_uuid(),
  user_id            uuid        not null references auth.users (id) on delete cascade,
  account_name       text        not null,
  username           text        default '',
  encrypted_password text        not null,
  is_pinned          boolean     not null default false,
  created_at         timestamptz default now(),
  updated_at         timestamptz default now()
);

create index if not exists idx_saved_passwords_user_id on saved_passwords (user_id);

-- Auto-update updated_at on row change
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_saved_passwords_updated_at on saved_passwords;
create trigger trg_saved_passwords_updated_at
  before update on saved_passwords
  for each row execute function update_updated_at();

-- Row Level Security: disabled — Worker uses service-role key which bypasses RLS anyway
alter table saved_passwords disable row level security;

