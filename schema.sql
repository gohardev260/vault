-- schema.sql
-- Setup SQL for the Vault Password Manager database and storage

-- 1. Create passwords table
create table if not exists public.passwords (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  account_name text not null,
  username text,
  password text not null, -- Stores the base64-encoded encrypted ciphertext
  iv text not null,        -- Stores the base64-encoded initialization vector (IV) for AES-GCM
  sort_order integer default 0 not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Migration queries if table already exists
alter table public.passwords add column if not exists sort_order integer default 0;
alter table public.passwords drop column if exists pinned;

-- Enable Row Level Security (RLS)
alter table public.passwords enable row level security;

-- Create policies for passwords
drop policy if exists "Users can manage their own passwords" on public.passwords;

create policy "Users can manage their own passwords"
  on public.passwords
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- 2. Create updated_at trigger helper function
create or replace function public.handle_updated_at()
returns trigger as $$
begin
  new.updated_at = timezone('utc'::text, now());
  return new;
end;
$$ language plpgsql;

-- 3. Create trigger on passwords table
drop trigger if exists set_passwords_updated_at on public.passwords;
create trigger set_passwords_updated_at
  before update on public.passwords
  for each row
  execute function public.handle_updated_at();
