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
  pinned boolean default false not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

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
