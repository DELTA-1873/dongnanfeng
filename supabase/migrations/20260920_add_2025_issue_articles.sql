-- 东南风文学社 2025 年刊与 35 篇分篇目录
-- 在 Supabase Dashboard > SQL Editor 中完整执行一次。

begin;

alter table public.magazine_issues add column if not exists source_url text;

insert into public.magazine_issues
  (id, issue_number, title, description, cover_url, source_url, is_published, published_at)
values
  (
    '20250000-0000-4000-8000-000000000001',
    '2025 年刊',
    '东南风文学社三十四周年年刊',
    '收录卷首语、随笔评论、小说、诗词、卷末语与社史，共 35 篇独立内容。',
    './magazines/2025/cover.png',
    './magazines/2025/dongnanfeng-2025.pdf',
    true,
    '2025-07-01T00:00:00+08:00'
  )
on conflict (issue_number) do update
set title = excluded.title,
    description = excluded.description,
    cover_url = excluded.cover_url,
    source_url = excluded.source_url,
    is_published = excluded.is_published,
    published_at = excluded.published_at;

with target_issue as (
  select id from public.magazine_issues where issue_number = '2025 年刊' limit 1
), entries(id, slug, title, author_name, category, page_start, page_end, file_url, sort_order) as (
  values
  ('20250000-0000-4001-8000-000000000001'::uuid, 'song', '东南风起时', '石刚、郝辰欣', '社歌', 1, 1, './magazines/2025/articles/song.pdf', 1),
  ('20250000-0000-4001-8000-000000000002'::uuid, 'preface-future', '东南有风，未来可期', '张娟', '卷首语', 2, 3, './magazines/2025/articles/preface-future.pdf', 2),
  ('20250000-0000-4001-8000-000000000003'::uuid, 'once-a-while', '一期一会', '尉思懿', '卷首语', 4, 9, './magazines/2025/articles/once-a-while.pdf', 3),
  ('20250000-0000-4001-8000-000000000004'::uuid, 'timely-and-moving', '时者——任是无情也动人', '初见', '评论', 10, 13, './magazines/2025/articles/timely-and-moving.pdf', 4),
  ('20250000-0000-4001-8000-000000000005'::uuid, 'dream', '梦', '左月', '散文', 14, 16, './magazines/2025/articles/dream.pdf', 5),
  ('20250000-0000-4001-8000-000000000006'::uuid, 'individual-and-political', '关于人的个体性与政治性问题的演讲', '盲莽、安格丽卡', '评论', 17, 21, './magazines/2025/articles/individual-and-political.pdf', 6),
  ('20250000-0000-4001-8000-000000000007'::uuid, 'today-matters', '今朝事', '林雨', '散文', 22, 25, './magazines/2025/articles/today-matters.pdf', 7),
  ('20250000-0000-4001-8000-000000000008'::uuid, 'existential-mcdonalds', '存在主义麦当劳', '觋', '散文', 26, 30, './magazines/2025/articles/existential-mcdonalds.pdf', 8),
  ('20250000-0000-4001-8000-000000000009'::uuid, 'they-raised-a-cat', '他们养了一只猫', '拉南杰', '小说', 31, 33, './magazines/2025/articles/they-raised-a-cat.pdf', 9),
  ('20250000-0000-4001-8000-000000000010'::uuid, 'hadas-hanging', '哈达的自缢', '拉南杰', '小说', 34, 42, './magazines/2025/articles/hadas-hanging.pdf', 10),
  ('20250000-0000-4001-8000-000000000011'::uuid, 'encore-zero', 'encore「0」', '射日户山橙', '小说', 43, 47, './magazines/2025/articles/encore-zero.pdf', 11),
  ('20250000-0000-4001-8000-000000000012'::uuid, 'north-wind-like-blood', '北风如血', '吴榜', '小说', 48, 51, './magazines/2025/articles/north-wind-like-blood.pdf', 12),
  ('20250000-0000-4001-8000-000000000013'::uuid, 'oppressive-moments', '压抑的时刻们', '朱庭轩', '小说', 52, 55, './magazines/2025/articles/oppressive-moments.pdf', 13),
  ('20250000-0000-4001-8000-000000000014'::uuid, 'twelve-equals-zero', '12 = 0', '安格丽卡', '小说', 56, 64, './magazines/2025/articles/twelve-equals-zero.pdf', 14),
  ('20250000-0000-4001-8000-000000000015'::uuid, 'kaishi-zen', '开事禅', '彭金泽', '诗词', 65, 68, './magazines/2025/articles/kaishi-zen.pdf', 15),
  ('20250000-0000-4001-8000-000000000016'::uuid, 'mulberries-west-lake', '采桑子·宝石山望西湖', '施韵东', '诗词', 69, 69, './magazines/2025/articles/mulberries-west-lake.pdf', 16),
  ('20250000-0000-4001-8000-000000000017'::uuid, 'tashaxing-xitang', '踏莎行·西塘汉服节', '施韵东', '诗词', 69, 69, './magazines/2025/articles/tashaxing-xitang.pdf', 17),
  ('20250000-0000-4001-8000-000000000018'::uuid, 'yongyule-years', '永遇乐（岁月如梭）', '徐思哲', '诗词', 69, 69, './magazines/2025/articles/yongyule-years.pdf', 18),
  ('20250000-0000-4001-8000-000000000019'::uuid, 'water-wind', '水风集（三首）', '林染', '诗词', 70, 70, './magazines/2025/articles/water-wind.pdf', 19),
  ('20250000-0000-4001-8000-000000000020'::uuid, 'autumn-moon', '秋月', '陈玺鸣', '诗词', 70, 70, './magazines/2025/articles/autumn-moon.pdf', 20),
  ('20250000-0000-4001-8000-000000000021'::uuid, 'jade-tower-spring', '玉楼春（三首）', '施韵东', '诗词', 71, 71, './magazines/2025/articles/jade-tower-spring.pdf', 21),
  ('20250000-0000-4001-8000-000000000022'::uuid, 'wind-enters-pines-summer', '风入松·夏', '吉他', '诗词', 72, 72, './magazines/2025/articles/wind-enters-pines-summer.pdf', 22),
  ('20250000-0000-4001-8000-000000000023'::uuid, 'hexinlang-graduation', '贺新郎·毕业前游观澜亭有感', '吉他', '诗词', 73, 73, './magazines/2025/articles/hexinlang-graduation.pdf', 23),
  ('20250000-0000-4001-8000-000000000024'::uuid, 'devils-day', '魔鬼日', '街', '诗歌', 75, 75, './magazines/2025/articles/devils-day.pdf', 24),
  ('20250000-0000-4001-8000-000000000025'::uuid, 'late-night-metro', '深夜地铁', '盲莽', '诗歌', 76, 76, './magazines/2025/articles/late-night-metro.pdf', 25),
  ('20250000-0000-4001-8000-000000000026'::uuid, 'low-battery', '电量低', '安格丽卡', '诗歌', 77, 78, './magazines/2025/articles/low-battery.pdf', 26),
  ('20250000-0000-4001-8000-000000000027'::uuid, 'ark-blue-whale', '方舟蓝鲸号', '俞之汜', '诗歌', 79, 82, './magazines/2025/articles/ark-blue-whale.pdf', 27),
  ('20250000-0000-4001-8000-000000000028'::uuid, 'rest-in-a-cup', '杯中小憩', '龙朝洋', '诗歌', 83, 84, './magazines/2025/articles/rest-in-a-cup.pdf', 28),
  ('20250000-0000-4001-8000-000000000029'::uuid, 'rescued-oisin', '被拯救的奥伊辛', '李明瑞', '诗歌', 85, 88, './magazines/2025/articles/rescued-oisin.pdf', 29),
  ('20250000-0000-4001-8000-000000000030'::uuid, 'sky-burial', '天葬', '拉南杰', '诗歌', 89, 89, './magazines/2025/articles/sky-burial.pdf', 30),
  ('20250000-0000-4001-8000-000000000031'::uuid, 'same-symbol', '我以一个同样的符号面对', '拉南杰', '诗歌', 89, 91, './magazines/2025/articles/same-symbol.pdf', 31),
  ('20250000-0000-4001-8000-000000000032'::uuid, 'cat-physics', '猫猫物理学', '盲莽', '诗歌', 92, 93, './magazines/2025/articles/cat-physics.pdf', 32),
  ('20250000-0000-4001-8000-000000000033'::uuid, 'use-of-uselessness', '无用之用', '杨晴晴', '卷末语', 94, 95, './magazines/2025/articles/use-of-uselessness.pdf', 33),
  ('20250000-0000-4001-8000-000000000034'::uuid, 'from-the-sea', '从海水中来', '白乙程', '卷末语', 96, 97, './magazines/2025/articles/from-the-sea.pdf', 34),
  ('20250000-0000-4001-8000-000000000035'::uuid, 'society-history', '东南风文学社社史——兼文化类社团简史', '孟子涵、东南风工作组', '社史', 98, 105, './magazines/2025/articles/society-history.pdf', 35)
)
insert into public.magazine_articles
  (id, issue_id, slug, title, author_name, category, printed_page_start, printed_page_end, file_url, sort_order)
select entries.id, target_issue.id, entries.slug, entries.title, entries.author_name, entries.category,
       entries.page_start, entries.page_end, entries.file_url, entries.sort_order
from entries cross join target_issue
on conflict (issue_id, slug) do update
set title = excluded.title,
    author_name = excluded.author_name,
    category = excluded.category,
    printed_page_start = excluded.printed_page_start,
    printed_page_end = excluded.printed_page_end,
    file_url = excluded.file_url,
    sort_order = excluded.sort_order;

commit;
