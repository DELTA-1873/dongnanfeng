-- 社刊 / 社刊文章 / 成员作品点评与评分，以及创作 Bucket 的 PDF-only 新上传规则。
-- 在 Supabase Dashboard > SQL Editor 中完整执行一次。

begin;

create table if not exists public.content_comments (
  id uuid primary key default gen_random_uuid(),
  target_type text not null check (target_type in ('magazine', 'article', 'creation')),
  target_id uuid not null,
  author_id uuid not null references auth.users(id) on delete cascade,
  display_name text not null default '社员' check (char_length(display_name) between 1 and 24),
  body text not null check (char_length(body) between 1 and 500),
  created_at timestamptz not null default now()
);

create table if not exists public.content_ratings (
  target_type text not null check (target_type in ('magazine', 'article', 'creation')),
  target_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  score integer not null check (score between 1 and 5),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (target_type, target_id, user_id)
);

-- 兼容已经执行过旧版本迁移的项目。
alter table public.content_comments drop constraint if exists content_comments_target_type_check;
alter table public.content_comments add constraint content_comments_target_type_check
check (target_type in ('magazine', 'article', 'creation'));

alter table public.content_ratings drop constraint if exists content_ratings_target_type_check;
alter table public.content_ratings add constraint content_ratings_target_type_check
check (target_type in ('magazine', 'article', 'creation'));

create index if not exists content_comments_target_idx
on public.content_comments(target_type, target_id, created_at desc);

create index if not exists content_ratings_target_idx
on public.content_ratings(target_type, target_id);

create or replace function public.feedback_target_is_public(p_target_type text, p_target_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case p_target_type
    when 'magazine' then exists (
      select 1 from public.magazine_issues
      where id = p_target_id and is_published = true
    )
    when 'article' then exists (
      select 1
      from public.magazine_articles article
      join public.magazine_issues issue on issue.id = article.issue_id
      where article.id = p_target_id and issue.is_published = true
    )
    when 'creation' then exists (
      select 1 from public.creations
      where id = p_target_id and status = 'published'
    )
    else false
  end;
$$;

create or replace function public.prepare_content_feedback()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.feedback_target_is_public(new.target_type, new.target_id) then
    raise exception '点评对象不存在或尚未公开';
  end if;

  if tg_table_name = 'content_comments' then
    select username into new.display_name
    from public.member_profiles
    where user_id = new.author_id;
    if new.display_name is null then
      raise exception '正式账号资料不存在';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists content_comments_prepare on public.content_comments;
create trigger content_comments_prepare
before insert or update on public.content_comments
for each row execute function public.prepare_content_feedback();

drop trigger if exists content_ratings_prepare on public.content_ratings;
create trigger content_ratings_prepare
before insert or update on public.content_ratings
for each row execute function public.prepare_content_feedback();

drop trigger if exists content_ratings_set_updated_at on public.content_ratings;
create trigger content_ratings_set_updated_at
before update on public.content_ratings
for each row execute function public.set_updated_at();

create or replace function public.delete_content_feedback()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.content_comments
  where target_type = tg_argv[0] and target_id = old.id;
  delete from public.content_ratings
  where target_type = tg_argv[0] and target_id = old.id;
  return old;
end;
$$;

drop trigger if exists magazine_feedback_cleanup on public.magazine_issues;
create trigger magazine_feedback_cleanup
after delete on public.magazine_issues
for each row execute function public.delete_content_feedback('magazine');

drop trigger if exists creation_feedback_cleanup on public.creations;
create trigger creation_feedback_cleanup
after delete on public.creations
for each row execute function public.delete_content_feedback('creation');

drop trigger if exists article_feedback_cleanup on public.magazine_articles;
create trigger article_feedback_cleanup
after delete on public.magazine_articles
for each row execute function public.delete_content_feedback('article');

alter table public.content_comments enable row level security;
alter table public.content_ratings enable row level security;

revoke all on table public.content_comments, public.content_ratings from anon, authenticated;
grant select, insert on table public.content_comments to authenticated;
grant select, insert, update on table public.content_ratings to authenticated;

drop policy if exists content_comments_select on public.content_comments;
create policy content_comments_select on public.content_comments for select to authenticated
using (public.feedback_target_is_public(target_type, target_id));

drop policy if exists content_comments_insert on public.content_comments;
create policy content_comments_insert on public.content_comments for insert to authenticated
with check (
  author_id = (select auth.uid())
  and coalesce((select (auth.jwt() ->> 'is_anonymous')::boolean), false) = false
  and public.feedback_target_is_public(target_type, target_id)
);

drop policy if exists content_ratings_select on public.content_ratings;
create policy content_ratings_select on public.content_ratings for select to authenticated
using (public.feedback_target_is_public(target_type, target_id));

drop policy if exists content_ratings_insert on public.content_ratings;
create policy content_ratings_insert on public.content_ratings for insert to authenticated
with check (
  user_id = (select auth.uid())
  and coalesce((select (auth.jwt() ->> 'is_anonymous')::boolean), false) = false
  and public.feedback_target_is_public(target_type, target_id)
);

drop policy if exists content_ratings_update on public.content_ratings;
create policy content_ratings_update on public.content_ratings for update to authenticated
using (
  user_id = (select auth.uid())
  and coalesce((select (auth.jwt() ->> 'is_anonymous')::boolean), false) = false
)
with check (
  user_id = (select auth.uid())
  and coalesce((select (auth.jwt() ->> 'is_anonymous')::boolean), false) = false
  and public.feedback_target_is_public(target_type, target_id)
);

-- 从本迁移开始，新的成员作品统一以 PDF 保存。已有 Word 对象不会被删除。
update storage.buckets
set allowed_mime_types = array['application/pdf'],
    file_size_limit = 15728640
where id = 'creations';

do $$
declare table_name text;
begin
  foreach table_name in array array['content_comments', 'content_ratings'] loop
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
