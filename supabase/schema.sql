-- 东南风文学社：Supabase 初始数据库结构
-- 在 Supabase Dashboard > SQL Editor 中完整执行一次。

create extension if not exists pgcrypto;

create table if not exists public.books (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 40),
  author text not null check (char_length(author) between 1 and 24),
  genre text not null check (genre in ('小说', '诗歌', '散文', '评论', '戏剧')),
  issue text check (issue is null or char_length(issue) <= 30),
  color text not null default 'blue' check (color in ('blue', 'red', 'green', 'gold', 'black')),
  summary text not null check (char_length(summary) between 1 and 300),
  created_by uuid references auth.users(id) on delete set null,
  approved boolean not null default false,
  base_votes integer not null default 0 check (base_votes >= 0),
  base_rating numeric(2,1) not null default 0 check (base_rating between 0 and 5),
  base_ratings integer not null default 0 check (base_ratings >= 0),
  created_at timestamptz not null default now()
);

create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.books(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 20),
  body text not null check (char_length(body) between 1 and 240),
  created_at timestamptz not null default now()
);

create table if not exists public.votes (
  book_id uuid not null references public.books(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (book_id, user_id)
);

create table if not exists public.ratings (
  book_id uuid not null references public.books(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  score integer not null check (score between 1 and 5),
  created_at timestamptz not null default now(),
  primary key (book_id, user_id)
);

create index if not exists comments_book_id_idx on public.comments(book_id, created_at desc);
create index if not exists votes_book_id_idx on public.votes(book_id);
create index if not exists ratings_book_id_idx on public.ratings(book_id);
create index if not exists books_created_at_idx on public.books(created_at desc);

alter table public.books enable row level security;
alter table public.comments enable row level security;
alter table public.votes enable row level security;
alter table public.ratings enable row level security;

revoke all on table public.books, public.comments, public.votes, public.ratings from anon, authenticated;
grant select, insert on table public.books, public.comments, public.votes to authenticated;
grant delete on table public.votes to authenticated;
grant select, insert, update on table public.ratings to authenticated;

drop policy if exists books_select on public.books;
create policy books_select on public.books for select to authenticated
using (approved = true or created_by = (select auth.uid()));

drop policy if exists books_insert on public.books;
create policy books_insert on public.books for insert to authenticated
with check (created_by = (select auth.uid()) and approved = false);

drop policy if exists comments_select on public.comments;
create policy comments_select on public.comments for select to authenticated
using (exists (
  select 1 from public.books
  where books.id = book_id
    and (books.approved = true or books.created_by = (select auth.uid()))
));

drop policy if exists comments_insert on public.comments;
create policy comments_insert on public.comments for insert to authenticated
with check (
  author_id = (select auth.uid())
  and exists (
    select 1 from public.books
    where books.id = book_id
      and (books.approved = true or books.created_by = (select auth.uid()))
  )
);

drop policy if exists votes_select on public.votes;
create policy votes_select on public.votes for select to authenticated
using (exists (
  select 1 from public.books
  where books.id = book_id
    and (books.approved = true or books.created_by = (select auth.uid()))
));

drop policy if exists votes_insert on public.votes;
create policy votes_insert on public.votes for insert to authenticated
with check (
  user_id = (select auth.uid())
  and exists (
    select 1 from public.books
    where books.id = book_id
      and (books.approved = true or books.created_by = (select auth.uid()))
  )
);

drop policy if exists votes_delete on public.votes;
create policy votes_delete on public.votes for delete to authenticated
using (user_id = (select auth.uid()));

drop policy if exists ratings_select on public.ratings;
create policy ratings_select on public.ratings for select to authenticated
using (exists (
  select 1 from public.books
  where books.id = book_id
    and (books.approved = true or books.created_by = (select auth.uid()))
));

drop policy if exists ratings_insert on public.ratings;
create policy ratings_insert on public.ratings for insert to authenticated
with check (
  user_id = (select auth.uid())
  and exists (
    select 1 from public.books
    where books.id = book_id
      and (books.approved = true or books.created_by = (select auth.uid()))
  )
);

drop policy if exists ratings_update on public.ratings;
create policy ratings_update on public.ratings for update to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

-- 初始刊物数据；固定 UUID 使脚本重复执行时不会重复插入。
insert into public.books
  (id, title, author, genre, issue, color, summary, approved, base_votes, base_rating, base_ratings, created_at)
values
  ('00000000-0000-4000-8000-000000000001', '候鸟没有寄回的信', '林屿', '小说', '第 24 期 · 2026 秋', 'blue', '那年九月，整座城都在等一场台风。只有我知道，真正要离开的并不是夏天。一封迟到多年的信，让两个在海边长大的年轻人重新面对告别与故乡。', true, 86, 4.7, 42, '2026-09-18T00:00:00Z'),
  ('00000000-0000-4000-8000-000000000002', '潮汐练习曲', '周见山', '诗歌', '第 24 期 · 2026 秋', 'red', '十二首关于海、离别与重逢的短诗。诗人把潮汐当作时间的另一副面孔，在反复抵达与离去之间，辨认生活留下的微光。', true, 64, 4.8, 36, '2026-09-16T00:00:00Z'),
  ('00000000-0000-4000-8000-000000000003', '夜车经过旧城', '陈未晚', '散文', '第 23 期 · 2026 春', 'green', '车窗像一卷缓慢展开的胶片，收藏沿途每一盏未眠的灯。作者从一趟夜车出发，写下记忆中的旧街、家人和不断改变的城市。', true, 51, 4.5, 29, '2026-05-20T00:00:00Z'),
  ('00000000-0000-4000-8000-000000000004', '春天的另一种译法', '许南枝', '诗歌', '第 23 期 · 2026 春', 'gold', '我们把新叶叫作重逢，把雨声叫作尚未说完。这组诗尝试翻译春天，也翻译成长中那些无法直接说出的情绪。', true, 73, 4.6, 31, '2026-05-12T00:00:00Z'),
  ('00000000-0000-4000-8000-000000000005', '岛屿书店', '唐砚', '小说', '第 22 期 · 2025 冬', 'black', '一间只在退潮后开门的书店，替岛上的人保管未曾寄出的故事。年轻的店员逐渐发现，书架上也藏着属于自己的那一本。', true, 92, 4.9, 55, '2025-12-08T00:00:00Z'),
  ('00000000-0000-4000-8000-000000000006', '南窗手记', '闻舟', '散文', '第 22 期 · 2025 冬', 'blue', '从宿舍朝南的窗口望出去，是操场、树梢和四年里不断迁徙的云。二十篇短章，记录一段校园生活中容易被忽略的时刻。', true, 47, 4.4, 25, '2025-12-01T00:00:00Z')
on conflict (id) do nothing;

-- 开启四张表的实时变更通知（重复执行也安全）。
do $$
declare table_name text;
begin
  foreach table_name in array array['books', 'comments', 'votes', 'ratings'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = table_name
    ) then
      execute format('alter publication supabase_realtime add table public.%I', table_name);
    end if;
  end loop;
end $$;
