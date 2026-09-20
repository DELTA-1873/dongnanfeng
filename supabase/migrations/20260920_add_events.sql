-- 东南风文学社：近期活动表
-- 在 Supabase Dashboard > SQL Editor 中完整执行一次。

begin;

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 80),
  summary text not null default '' check (char_length(summary) <= 300),
  event_type text not null default '文学活动' check (char_length(event_type) between 1 and 30),
  starts_at timestamptz not null,
  location text not null default '' check (char_length(location) <= 100),
  is_published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists events_published_starts_idx
on public.events(is_published, starts_at);

drop trigger if exists events_set_updated_at on public.events;
create trigger events_set_updated_at
before update on public.events
for each row execute function public.set_updated_at();

alter table public.events enable row level security;
revoke all on table public.events from anon, authenticated;
grant select on table public.events to authenticated;

drop policy if exists events_select_published on public.events;
create policy events_select_published on public.events for select to authenticated
using (is_published = true);

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'events'
  ) then
    alter publication supabase_realtime add table public.events;
  end if;
end $$;

commit;
