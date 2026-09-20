-- 东南风文学社：正式账号、社刊、创作发布与私有文件存储
-- 在 Supabase Dashboard > SQL Editor 中完整执行一次。

begin;

create table if not exists public.member_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  username text not null check (char_length(username) between 2 and 24),
  bio text not null default '' check (char_length(bio) <= 240),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists member_profiles_username_lower_idx
on public.member_profiles(lower(username));

create table if not exists public.magazine_issues (
  id uuid primary key default gen_random_uuid(),
  issue_number text not null unique check (char_length(issue_number) between 1 and 30),
  title text not null check (char_length(title) between 1 and 80),
  description text not null default '' check (char_length(description) <= 500),
  cover_url text,
  file_path text unique,
  is_published boolean not null default false,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (is_published = false or published_at is not null)
);

create table if not exists public.creations (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 80),
  summary text not null default '' check (char_length(summary) <= 500),
  category text not null check (category in ('小说', '诗歌', '散文', '评论', '戏剧', '其他')),
  publish_anonymously boolean not null default false,
  public_author text check (public_author is null or char_length(public_author) between 2 and 24),
  file_path text not null unique,
  file_name text not null check (char_length(file_name) between 1 and 255),
  mime_type text not null check (mime_type in (
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  )),
  file_size bigint not null check (file_size > 0 and file_size <= 15728640),
  status text not null default 'published' check (status in ('draft', 'published', 'hidden')),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status <> 'published' or published_at is not null)
);

create index if not exists creations_published_idx on public.creations(status, published_at desc);
create index if not exists creations_author_idx on public.creations(author_id, created_at desc);
create index if not exists magazine_issues_published_idx on public.magazine_issues(is_published, published_at desc);

drop trigger if exists member_profiles_set_updated_at on public.member_profiles;
create trigger member_profiles_set_updated_at before update on public.member_profiles
for each row execute function public.set_updated_at();

drop trigger if exists magazine_issues_set_updated_at on public.magazine_issues;
create trigger magazine_issues_set_updated_at before update on public.magazine_issues
for each row execute function public.set_updated_at();

drop trigger if exists creations_set_updated_at on public.creations;
create trigger creations_set_updated_at before update on public.creations
for each row execute function public.set_updated_at();

create or replace function public.set_creation_public_author()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.publish_anonymously then
    new.public_author := null;
  else
    select username into new.public_author
    from public.member_profiles
    where user_id = new.author_id;
    if new.public_author is null then
      raise exception '正式账号资料不存在';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists creations_set_public_author on public.creations;
create trigger creations_set_public_author before insert or update of author_id, publish_anonymously
on public.creations for each row execute function public.set_creation_public_author();

create or replace function public.handle_member_signup()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare requested_username text;
begin
  if coalesce(new.is_anonymous, false) = false then
    requested_username := nullif(trim(new.raw_user_meta_data ->> 'username'), '');
    if requested_username is null or char_length(requested_username) not between 2 and 24 then
      raise exception '账号名长度必须为 2–24 个字符';
    end if;
    insert into public.member_profiles(user_id, username)
    values (new.id, requested_username);
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_member_profile on auth.users;
create trigger on_auth_user_created_member_profile
after insert on auth.users
for each row execute function public.handle_member_signup();

alter table public.member_profiles enable row level security;
alter table public.magazine_issues enable row level security;
alter table public.creations enable row level security;

revoke all on table public.member_profiles, public.magazine_issues, public.creations from anon, authenticated;
grant select, update on table public.member_profiles to authenticated;
grant select on table public.magazine_issues to authenticated;
grant insert, update, delete on table public.creations to authenticated;
grant select (
  id, title, summary, category, publish_anonymously, public_author,
  file_path, file_name, mime_type, file_size, status,
  published_at, created_at, updated_at
) on table public.creations to authenticated;

-- 访客虽然通过匿名 Auth 获得 authenticated 角色，但所有写入均要求正式账号。
drop policy if exists books_insert on public.books;
create policy books_insert on public.books for insert to authenticated
with check (
  created_by = (select auth.uid())
  and approved = false
  and coalesce((select (auth.jwt() ->> 'is_anonymous')::boolean), false) = false
);

drop policy if exists comments_insert on public.comments;
create policy comments_insert on public.comments for insert to authenticated
with check (
  author_id = (select auth.uid())
  and coalesce((select (auth.jwt() ->> 'is_anonymous')::boolean), false) = false
  and exists (
    select 1 from public.books
    where books.id = book_id
      and (books.approved = true or books.created_by = (select auth.uid()))
  )
);

drop policy if exists votes_insert on public.votes;
create policy votes_insert on public.votes for insert to authenticated
with check (
  user_id = (select auth.uid())
  and coalesce((select (auth.jwt() ->> 'is_anonymous')::boolean), false) = false
  and exists (select 1 from public.books where books.id = book_id and books.approved = true)
);
drop policy if exists votes_delete on public.votes;
create policy votes_delete on public.votes for delete to authenticated
using (
  user_id = (select auth.uid())
  and coalesce((select (auth.jwt() ->> 'is_anonymous')::boolean), false) = false
);

drop policy if exists ratings_insert on public.ratings;
create policy ratings_insert on public.ratings for insert to authenticated
with check (
  user_id = (select auth.uid())
  and coalesce((select (auth.jwt() ->> 'is_anonymous')::boolean), false) = false
  and exists (select 1 from public.books where books.id = book_id and books.approved = true)
);
drop policy if exists ratings_update on public.ratings;
create policy ratings_update on public.ratings for update to authenticated
using (
  user_id = (select auth.uid())
  and coalesce((select (auth.jwt() ->> 'is_anonymous')::boolean), false) = false
)
with check (
  user_id = (select auth.uid())
  and coalesce((select (auth.jwt() ->> 'is_anonymous')::boolean), false) = false
);

-- 同步收紧之前预留的个人博客表：未注册访客只能读取公开内容。
drop policy if exists blog_profiles_insert on public.blog_profiles;
create policy blog_profiles_insert on public.blog_profiles for insert to authenticated
with check (
  user_id = (select auth.uid())
  and coalesce((select (auth.jwt() ->> 'is_anonymous')::boolean), false) = false
);
drop policy if exists blog_profiles_update on public.blog_profiles;
create policy blog_profiles_update on public.blog_profiles for update to authenticated
using (
  user_id = (select auth.uid())
  and coalesce((select (auth.jwt() ->> 'is_anonymous')::boolean), false) = false
)
with check (
  user_id = (select auth.uid())
  and coalesce((select (auth.jwt() ->> 'is_anonymous')::boolean), false) = false
);

drop policy if exists blog_posts_insert on public.blog_posts;
create policy blog_posts_insert on public.blog_posts for insert to authenticated
with check (
  author_id = (select auth.uid())
  and coalesce((select (auth.jwt() ->> 'is_anonymous')::boolean), false) = false
);
drop policy if exists blog_posts_update on public.blog_posts;
create policy blog_posts_update on public.blog_posts for update to authenticated
using (
  author_id = (select auth.uid())
  and coalesce((select (auth.jwt() ->> 'is_anonymous')::boolean), false) = false
)
with check (
  author_id = (select auth.uid())
  and coalesce((select (auth.jwt() ->> 'is_anonymous')::boolean), false) = false
);
drop policy if exists blog_posts_delete on public.blog_posts;
create policy blog_posts_delete on public.blog_posts for delete to authenticated
using (
  author_id = (select auth.uid())
  and coalesce((select (auth.jwt() ->> 'is_anonymous')::boolean), false) = false
);

drop policy if exists blog_post_comments_insert on public.blog_post_comments;
create policy blog_post_comments_insert on public.blog_post_comments for insert to authenticated
with check (
  author_id = (select auth.uid())
  and coalesce((select (auth.jwt() ->> 'is_anonymous')::boolean), false) = false
  and exists (
    select 1 from public.blog_posts
    where blog_posts.id = post_id and blog_posts.status = 'published'
  )
);
drop policy if exists blog_post_comments_delete on public.blog_post_comments;
create policy blog_post_comments_delete on public.blog_post_comments for delete to authenticated
using (
  author_id = (select auth.uid())
  and coalesce((select (auth.jwt() ->> 'is_anonymous')::boolean), false) = false
);

drop policy if exists member_profiles_select on public.member_profiles;
create policy member_profiles_select on public.member_profiles for select to authenticated using (true);
drop policy if exists member_profiles_update on public.member_profiles;
create policy member_profiles_update on public.member_profiles for update to authenticated
using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

drop policy if exists magazine_issues_select on public.magazine_issues;
create policy magazine_issues_select on public.magazine_issues for select to authenticated
using (is_published = true);

drop policy if exists creations_select on public.creations;
create policy creations_select on public.creations for select to authenticated
using (status = 'published' or author_id = (select auth.uid()));
drop policy if exists creations_insert on public.creations;
create policy creations_insert on public.creations for insert to authenticated
with check (
  author_id = (select auth.uid())
  and coalesce((select (auth.jwt() ->> 'is_anonymous')::boolean), false) = false
);
drop policy if exists creations_update on public.creations;
create policy creations_update on public.creations for update to authenticated
using (author_id = (select auth.uid()))
with check (
  author_id = (select auth.uid())
  and coalesce((select (auth.jwt() ->> 'is_anonymous')::boolean), false) = false
);
drop policy if exists creations_delete on public.creations;
create policy creations_delete on public.creations for delete to authenticated
using (
  author_id = (select auth.uid())
  and coalesce((select (auth.jwt() ->> 'is_anonymous')::boolean), false) = false
);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('creations', 'creations', false, 15728640, array[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]),
  ('magazines', 'magazines', false, 52428800, array['application/pdf'])
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists creations_storage_insert on storage.objects;
create policy creations_storage_insert on storage.objects for insert to authenticated
with check (
  bucket_id = 'creations'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and coalesce((select (auth.jwt() ->> 'is_anonymous')::boolean), false) = false
);

drop policy if exists creations_storage_select on storage.objects;
create policy creations_storage_select on storage.objects for select to authenticated
using (
  bucket_id = 'creations'
  and exists (
    select 1 from public.creations
    where creations.file_path = name
      and creations.status = 'published'
  )
);

drop policy if exists creations_storage_delete on storage.objects;
create policy creations_storage_delete on storage.objects for delete to authenticated
using (
  bucket_id = 'creations'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and coalesce((select (auth.jwt() ->> 'is_anonymous')::boolean), false) = false
);

drop policy if exists magazines_storage_select on storage.objects;
create policy magazines_storage_select on storage.objects for select to authenticated
using (
  bucket_id = 'magazines'
  and exists (
    select 1 from public.magazine_issues
    where magazine_issues.file_path = name and magazine_issues.is_published = true
  )
);

do $$
declare table_name text;
begin
  foreach table_name in array array['member_profiles', 'magazine_issues', 'creations'] loop
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
