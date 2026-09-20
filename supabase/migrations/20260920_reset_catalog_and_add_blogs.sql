-- 东南风文学社：清理测试互动、扩充书目、建立匿名用户个人博客
-- 在 Supabase Dashboard > SQL Editor 中完整执行一次。

begin;

-- 清理目前的测试互动；保留已有书目和用户身份。
delete from public.comments;
delete from public.votes;
delete from public.ratings;

-- 所有书目的内置票数与评分归零，前端将显示“未评分”。
update public.books
set base_votes = 0,
    base_rating = 0,
    base_ratings = 0;

-- 新增十二部书目；固定 UUID 使脚本重复执行时不会重复插入。
insert into public.books
  (id, title, author, genre, issue, color, summary, approved, base_votes, base_rating, base_ratings, created_at)
values
  ('00000000-0000-4000-8000-000000000007', '边城', '沈从文', '小说', '经典书目', 'green', '在湘西边城的渡口与山水之间，少女翠翠的成长、等待和朦胧情感缓缓展开。作品以清澈的语言写人情之美，也写命运中的遗憾。', true, 0, 0, 0, '2026-09-19T12:00:00Z'),
  ('00000000-0000-4000-8000-000000000008', '呐喊', '鲁迅', '小说', '经典书目', 'red', '一组直面旧社会精神困境的小说。从熟悉的人物与日常场景出发，作品持续追问清醒、麻木、孤独与改变的可能。', true, 0, 0, 0, '2026-09-19T11:00:00Z'),
  ('00000000-0000-4000-8000-000000000009', '朝花夕拾', '鲁迅', '散文', '经典书目', 'gold', '十篇回忆散文串起童年、求学与成长经历。温情的旧事背后，也保存着作者对教育、世情和时代的清醒观察。', true, 0, 0, 0, '2026-09-19T10:00:00Z'),
  ('00000000-0000-4000-8000-000000000010', '骆驼祥子', '老舍', '小说', '经典书目', 'black', '青年车夫祥子怀着拥有一辆自己的车的愿望来到城市。一次次挣扎与失去，呈现个人尊严在严酷生活中的磨损。', true, 0, 0, 0, '2026-09-19T09:00:00Z'),
  ('00000000-0000-4000-8000-000000000011', '呼兰河传', '萧红', '小说', '经典书目', 'blue', '以童年的目光回望北方小城的风物与人群。明亮、荒凉与幽默交织，普通人的生活在缓慢叙述中显出复杂质地。', true, 0, 0, 0, '2026-09-19T08:00:00Z'),
  ('00000000-0000-4000-8000-000000000012', '城南旧事', '林海音', '小说', '经典书目', 'gold', '小女孩英子的眼睛记录老北京城南的相遇与离别。成长伴随着对人情的理解，也意味着不断向熟悉的世界告别。', true, 0, 0, 0, '2026-09-19T07:00:00Z'),
  ('00000000-0000-4000-8000-000000000013', '围城', '钱钟书', '小说', '经典书目', 'black', '归国青年方鸿渐在事业、婚恋与人际关系中辗转。机敏的语言与层层讽刺，共同描摹现代生活里无处不在的困局。', true, 0, 0, 0, '2026-09-19T06:00:00Z'),
  ('00000000-0000-4000-8000-000000000014', '我与地坛', '史铁生', '散文', '经典书目', 'green', '作者从长期凝视的地坛出发，书写母亲、生命、困境与时间。沉静的思考让个人经验通向对普遍命运的理解。', true, 0, 0, 0, '2026-09-19T05:00:00Z'),
  ('00000000-0000-4000-8000-000000000015', '人间草木', '汪曾祺', '散文', '经典书目', 'green', '草木、饮食、故乡与旅途在从容笔调中次第出现。细小日常被重新看见，平淡生活由此生出温度和趣味。', true, 0, 0, 0, '2026-09-19T04:00:00Z'),
  ('00000000-0000-4000-8000-000000000016', '平凡的世界', '路遥', '小说', '经典书目', 'red', '以普通家庭与青年人的生活道路为中心，展开城乡变化中的劳动、爱情、挫折与选择，呈现平凡者持续向前的力量。', true, 0, 0, 0, '2026-09-19T03:00:00Z'),
  ('00000000-0000-4000-8000-000000000017', '额尔古纳河右岸', '迟子建', '小说', '经典书目', 'blue', '一位鄂温克族老人的讲述连接起部族迁徙、亲情、信仰与自然。个人记忆也成为一段生活方式逐渐远去的见证。', true, 0, 0, 0, '2026-09-19T02:00:00Z'),
  ('00000000-0000-4000-8000-000000000018', '台北人', '白先勇', '小说', '经典书目', 'red', '多篇小说共同勾勒一群离开故土、生活在台北的人。往昔与当下相互映照，繁华、失落和身份记忆层层交叠。', true, 0, 0, 0, '2026-09-19T01:00:00Z')
on conflict (id) do update
set title = excluded.title,
    author = excluded.author,
    genre = excluded.genre,
    issue = excluded.issue,
    color = excluded.color,
    summary = excluded.summary,
    approved = true,
    base_votes = 0,
    base_rating = 0,
    base_ratings = 0;

-- 匿名用户公开资料：每位 Supabase 匿名用户拥有一个博客身份。
create table if not exists public.blog_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  pen_name text not null check (char_length(pen_name) between 1 and 24),
  bio text not null default '' check (char_length(bio) <= 240),
  accent_color text not null default 'blue' check (accent_color in ('blue', 'red', 'green', 'gold', 'black')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 博客文章：草稿只有作者可见，发布文章对所有已建立匿名身份的读者可见。
create table if not exists public.blog_posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 80),
  excerpt text not null default '' check (char_length(excerpt) <= 300),
  body text not null check (char_length(body) between 1 and 20000),
  status text not null default 'draft' check (status in ('draft', 'published')),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status = 'draft' or published_at is not null)
);

-- 博客文章评论。
create table if not exists public.blog_post_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.blog_posts(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 20),
  body text not null check (char_length(body) between 1 and 500),
  created_at timestamptz not null default now()
);

create index if not exists blog_posts_author_idx on public.blog_posts(author_id, created_at desc);
create index if not exists blog_posts_published_idx on public.blog_posts(status, published_at desc);
create index if not exists blog_post_comments_post_idx on public.blog_post_comments(post_id, created_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists blog_profiles_set_updated_at on public.blog_profiles;
create trigger blog_profiles_set_updated_at
before update on public.blog_profiles
for each row execute function public.set_updated_at();

drop trigger if exists blog_posts_set_updated_at on public.blog_posts;
create trigger blog_posts_set_updated_at
before update on public.blog_posts
for each row execute function public.set_updated_at();

alter table public.blog_profiles enable row level security;
alter table public.blog_posts enable row level security;
alter table public.blog_post_comments enable row level security;

revoke all on table public.blog_profiles, public.blog_posts, public.blog_post_comments from anon, authenticated;
grant select, insert, update on table public.blog_profiles to authenticated;
grant select, insert, update, delete on table public.blog_posts to authenticated;
grant select, insert, delete on table public.blog_post_comments to authenticated;

drop policy if exists blog_profiles_select on public.blog_profiles;
create policy blog_profiles_select on public.blog_profiles for select to authenticated using (true);
drop policy if exists blog_profiles_insert on public.blog_profiles;
create policy blog_profiles_insert on public.blog_profiles for insert to authenticated
with check (user_id = (select auth.uid()));
drop policy if exists blog_profiles_update on public.blog_profiles;
create policy blog_profiles_update on public.blog_profiles for update to authenticated
using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

drop policy if exists blog_posts_select on public.blog_posts;
create policy blog_posts_select on public.blog_posts for select to authenticated
using (status = 'published' or author_id = (select auth.uid()));
drop policy if exists blog_posts_insert on public.blog_posts;
create policy blog_posts_insert on public.blog_posts for insert to authenticated
with check (author_id = (select auth.uid()));
drop policy if exists blog_posts_update on public.blog_posts;
create policy blog_posts_update on public.blog_posts for update to authenticated
using (author_id = (select auth.uid())) with check (author_id = (select auth.uid()));
drop policy if exists blog_posts_delete on public.blog_posts;
create policy blog_posts_delete on public.blog_posts for delete to authenticated
using (author_id = (select auth.uid()));

drop policy if exists blog_post_comments_select on public.blog_post_comments;
create policy blog_post_comments_select on public.blog_post_comments for select to authenticated
using (exists (
  select 1 from public.blog_posts
  where blog_posts.id = post_id
    and (blog_posts.status = 'published' or blog_posts.author_id = (select auth.uid()))
));
drop policy if exists blog_post_comments_insert on public.blog_post_comments;
create policy blog_post_comments_insert on public.blog_post_comments for insert to authenticated
with check (
  author_id = (select auth.uid())
  and exists (
    select 1 from public.blog_posts
    where blog_posts.id = post_id and blog_posts.status = 'published'
  )
);
drop policy if exists blog_post_comments_delete on public.blog_post_comments;
create policy blog_post_comments_delete on public.blog_post_comments for delete to authenticated
using (author_id = (select auth.uid()));

-- 开启博客三张表的实时变更通知。
do $$
declare table_name text;
begin
  foreach table_name in array array['blog_profiles', 'blog_posts', 'blog_post_comments'] loop
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

commit;
