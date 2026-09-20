-- 东南风文学社 2026 年刊与分篇目录
-- 在 Supabase Dashboard > SQL Editor 中完整执行一次。

begin;

alter table public.magazine_issues
add column if not exists source_url text;

create table if not exists public.magazine_articles (
  id uuid primary key default gen_random_uuid(),
  issue_id uuid not null references public.magazine_issues(id) on delete cascade,
  slug text not null check (slug ~ '^[a-z0-9-]+$'),
  title text not null check (char_length(title) between 1 and 100),
  author_name text not null check (char_length(author_name) between 1 and 80),
  category text not null check (char_length(category) between 1 and 30),
  printed_page_start integer not null check (printed_page_start > 0),
  printed_page_end integer not null check (printed_page_end >= printed_page_start),
  file_url text not null,
  sort_order integer not null,
  created_at timestamptz not null default now(),
  unique (issue_id, slug),
  unique (issue_id, sort_order)
);

create index if not exists magazine_articles_issue_idx
on public.magazine_articles(issue_id, sort_order);

alter table public.magazine_articles enable row level security;
revoke all on table public.magazine_articles from anon, authenticated;
grant select on table public.magazine_articles to authenticated;

drop policy if exists magazine_articles_select on public.magazine_articles;
create policy magazine_articles_select on public.magazine_articles for select to authenticated
using (exists (
  select 1 from public.magazine_issues
  where magazine_issues.id = issue_id and magazine_issues.is_published = true
));

insert into public.magazine_issues
  (id, issue_number, title, description, cover_url, source_url, is_published, published_at)
values
  (
    '20260000-0000-4000-8000-000000000001',
    '2026 年刊',
    '东南风文学社三十五周年年刊',
    '收录卷首语、影像辑录、书单、小说、散文、诗歌与社史，共 35 篇独立内容。',
    './magazines/2026/cover.png',
    './magazines/2026/dongnanfeng-2026.pdf',
    true,
    '2026-08-01T00:00:00+08:00'
  )
on conflict (issue_number) do update
set title = excluded.title,
    description = excluded.description,
    cover_url = excluded.cover_url,
    source_url = excluded.source_url,
    is_published = excluded.is_published,
    published_at = excluded.published_at;

insert into public.magazine_articles
  (issue_id, slug, title, author_name, category, printed_page_start, printed_page_end, file_url, sort_order)
values
  ('20260000-0000-4000-8000-000000000001', 'song', '东南风起时', '石刚、郝辰欣', '社歌', 1, 1, './magazines/2026/articles/song.pdf', 1),
  ('20260000-0000-4000-8000-000000000001', 'preface-future', '东南有风，未来可期', '张娟', '卷首语', 2, 3, './magazines/2026/articles/preface-future.pdf', 2),
  ('20260000-0000-4000-8000-000000000001', 'once-a-while', '一期一会', '尉思懿', '卷首语', 4, 4, './magazines/2026/articles/once-a-while.pdf', 3),
  ('20260000-0000-4000-8000-000000000001', 'ten-years', '风从此间起', '东南风工作组', '影像辑录', 10, 19, './magazines/2026/articles/ten-years.pdf', 4),
  ('20260000-0000-4000-8000-000000000001', 'reading-list', '风从书页来', '东南风社员', '书单', 20, 29, './magazines/2026/articles/reading-list.pdf', 5),
  ('20260000-0000-4000-8000-000000000001', 'structure-or-content', '结构 or 内容，谁更重要？', '蔡佳辰', '评论', 30, 36, './magazines/2026/articles/structure-or-content.pdf', 6),
  ('20260000-0000-4000-8000-000000000001', 'xiaoling-autumn', '孝陵观秋', '邹昊轩', '散文', 38, 44, './magazines/2026/articles/xiaoling-autumn.pdf', 7),
  ('20260000-0000-4000-8000-000000000001', 'essay-event', '随笔写作活动简介', '东南风工作组', '活动', 45, 45, './magazines/2026/articles/essay-event.pdf', 8),
  ('20260000-0000-4000-8000-000000000001', 'tunnel-end', '隧道已尽', '雾攸', '散文', 46, 47, './magazines/2026/articles/tunnel-end.pdf', 9),
  ('20260000-0000-4000-8000-000000000001', 'winter-chapter', '冬章', '孙睿妍', '散文', 48, 50, './magazines/2026/articles/winter-chapter.pdf', 10),
  ('20260000-0000-4000-8000-000000000001', 'rewind', '倒带', '巫见', '小说', 51, 59, './magazines/2026/articles/rewind.pdf', 11),
  ('20260000-0000-4000-8000-000000000001', 'elephant-slide', '中原大象滑梯消亡实录', '巫见', '小说', 60, 69, './magazines/2026/articles/elephant-slide.pdf', 12),
  ('20260000-0000-4000-8000-000000000001', 'chance', '偶然', '巫见', '小说', 70, 87, './magazines/2026/articles/chance.pdf', 13),
  ('20260000-0000-4000-8000-000000000001', 'rain-after-fifty-million-minutes', '五千万分钟后下雨', '海市', '小说', 88, 95, './magazines/2026/articles/rain-after-fifty-million-minutes.pdf', 14),
  ('20260000-0000-4000-8000-000000000001', 'tropic-of-cancer', '雨还在下', '参显', '小说', 96, 110, './magazines/2026/articles/tropic-of-cancer.pdf', 15),
  ('20260000-0000-4000-8000-000000000001', 'red-leaf', '红叶', '子玉', '小说', 111, 117, './magazines/2026/articles/red-leaf.pdf', 16),
  ('20260000-0000-4000-8000-000000000001', 'kill-sasha', '杀死萨沙', '陈年老尸', '小说', 118, 119, './magazines/2026/articles/kill-sasha.pdf', 17),
  ('20260000-0000-4000-8000-000000000001', 'ai-writing-event', 'AI 写作活动简介', '东南风工作组', '活动', 120, 120, './magazines/2026/articles/ai-writing-event.pdf', 18),
  ('20260000-0000-4000-8000-000000000001', 'escape-in-fiction', '虚构下的遁逃', '拾蓱', '小说', 121, 125, './magazines/2026/articles/escape-in-fiction.pdf', 19),
  ('20260000-0000-4000-8000-000000000001', 'osmanthus-path', '桂花小径（外二首）', '任绪成', '诗歌', 126, 128, './magazines/2026/articles/osmanthus-path.pdf', 20),
  ('20260000-0000-4000-8000-000000000001', 'cleaning-two', '大扫除 II', '街', '诗歌', 129, 131, './magazines/2026/articles/cleaning-two.pdf', 21),
  ('20260000-0000-4000-8000-000000000001', 'polar-bear-rice-sauce', '冰熊拌饭酱（YEars）', '俞之汜', '诗歌', 132, 132, './magazines/2026/articles/polar-bear-rice-sauce.pdf', 22),
  ('20260000-0000-4000-8000-000000000001', 'shadow', '影子', '参显', '诗歌', 133, 133, './magazines/2026/articles/shadow.pdf', 23),
  ('20260000-0000-4000-8000-000000000001', 'sail', '帆', '拾蓱', '诗歌', 134, 134, './magazines/2026/articles/sail.pdf', 24),
  ('20260000-0000-4000-8000-000000000001', 'last-love-poem', '最后一首情诗', '雾攸', '诗歌', 135, 135, './magazines/2026/articles/last-love-poem.pdf', 25),
  ('20260000-0000-4000-8000-000000000001', 'many-years-before', '此前许多年', '雾攸', '诗歌', 136, 136, './magazines/2026/articles/many-years-before.pdf', 26),
  ('20260000-0000-4000-8000-000000000001', 'scale-window', '鳞窗', '雾攸', '诗歌', 137, 137, './magazines/2026/articles/scale-window.pdf', 27),
  ('20260000-0000-4000-8000-000000000001', 'bad-ending', '坏结局', '安格丽卡', '诗歌', 138, 139, './magazines/2026/articles/bad-ending.pdf', 28),
  ('20260000-0000-4000-8000-000000000001', 'magpie-spring', '惊鹊·上巳人间', '拾蓱', '诗歌', 140, 143, './magazines/2026/articles/magpie-spring.pdf', 29),
  ('20260000-0000-4000-8000-000000000001', 'toward-bianjing', '向汴京奔去', '明和', '诗歌', 144, 146, './magazines/2026/articles/toward-bianjing.pdf', 30),
  ('20260000-0000-4000-8000-000000000001', 'old-temple', '泛咏古庙陵', '薯片塔居士', '诗歌', 147, 147, './magazines/2026/articles/old-temple.pdf', 31),
  ('20260000-0000-4000-8000-000000000001', 'garden-sitting', '沁园春·记闲坐观小园', '画心玲珑', '诗歌', 147, 147, './magazines/2026/articles/garden-sitting.pdf', 32),
  ('20260000-0000-4000-8000-000000000001', 'mr-wuwei-poems', '无为先生诗选', '无为先生', '诗歌', 148, 149, './magazines/2026/articles/mr-wuwei-poems.pdf', 33),
  ('20260000-0000-4000-8000-000000000001', 'unrepeatable-life', '诗境下无可复刻的生命', '画心玲珑', '评论', 150, 153, './magazines/2026/articles/unrepeatable-life.pdf', 34),
  ('20260000-0000-4000-8000-000000000001', 'society-history', '东南风文学社社史', '孟子涵、东南风工作组', '社史', 154, 161, './magazines/2026/articles/society-history.pdf', 35)
on conflict (issue_id, slug) do update
set title = excluded.title,
    author_name = excluded.author_name,
    category = excluded.category,
    printed_page_start = excluded.printed_page_start,
    printed_page_end = excluded.printed_page_end,
    file_url = excluded.file_url,
    sort_order = excluded.sort_order;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'magazine_articles'
  ) then
    alter publication supabase_realtime add table public.magazine_articles;
  end if;
end $$;

commit;
