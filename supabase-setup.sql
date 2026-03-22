-- Run this in the Supabase SQL Editor (one time setup)
-- Go to: your project → SQL Editor → New query → paste this → click Run

-- Create lists table
create table lists (
  id text primary key,
  name text not null,
  created_at timestamptz default now()
);

-- Create tasks table
create table tasks (
  id text primary key,
  list_id text references lists(id) on delete cascade,
  name text not null,
  notes text default '',
  completed boolean default false,
  created_at timestamptz default now()
);

-- Create index for fast task lookups by list
create index tasks_list_id_idx on tasks(list_id);

-- Enable Row Level Security (required by Supabase)
alter table lists enable row level security;
alter table tasks enable row level security;

-- Allow anyone to read and write (no login required)
create policy "Public access to lists" on lists
  for all using (true) with check (true);

create policy "Public access to tasks" on tasks
  for all using (true) with check (true);
