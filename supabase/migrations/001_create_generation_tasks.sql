create extension if not exists pgcrypto;

create table if not exists public.generation_tasks (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  image_url text not null,
  style text not null,
  prompt text,
  status text not null default 'queued' check (status in ('queued', 'running', 'succeeded', 'failed')),
  provider_task_id text,
  result_video_url text,
  error_message text
);

create index if not exists generation_tasks_created_at_idx
  on public.generation_tasks (created_at desc);

create index if not exists generation_tasks_status_idx
  on public.generation_tasks (status);

alter table public.generation_tasks enable row level security;

revoke all on public.generation_tasks from anon;
revoke all on public.generation_tasks from authenticated;

grant usage on schema public to service_role;
grant select, insert, update on public.generation_tasks to service_role;
