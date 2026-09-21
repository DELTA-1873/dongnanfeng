-- 允许正式账号删除本人发布的书目评论、评分、内容点评、内容评分和成员作品。
-- 在 Supabase Dashboard > SQL Editor 中完整执行一次。

begin;

grant delete on table public.comments, public.ratings to authenticated;
grant delete on table public.content_comments, public.content_ratings to authenticated;
grant delete on table public.creations to authenticated;

drop policy if exists comments_delete on public.comments;
create policy comments_delete on public.comments for delete to authenticated
using (
  author_id = (select auth.uid())
  and coalesce((select (auth.jwt() ->> 'is_anonymous')::boolean), false) = false
);

drop policy if exists ratings_delete on public.ratings;
create policy ratings_delete on public.ratings for delete to authenticated
using (
  user_id = (select auth.uid())
  and coalesce((select (auth.jwt() ->> 'is_anonymous')::boolean), false) = false
);

drop policy if exists content_comments_delete on public.content_comments;
create policy content_comments_delete on public.content_comments for delete to authenticated
using (
  author_id = (select auth.uid())
  and coalesce((select (auth.jwt() ->> 'is_anonymous')::boolean), false) = false
);

drop policy if exists content_ratings_delete on public.content_ratings;
create policy content_ratings_delete on public.content_ratings for delete to authenticated
using (
  user_id = (select auth.uid())
  and coalesce((select (auth.jwt() ->> 'is_anonymous')::boolean), false) = false
);

drop policy if exists creations_delete on public.creations;
create policy creations_delete on public.creations for delete to authenticated
using (
  author_id = (select auth.uid())
  and coalesce((select (auth.jwt() ->> 'is_anonymous')::boolean), false) = false
);

-- 不向其他读者暴露匿名作品的 author_id，只返回当前账号自己的作品 ID。
create or replace function public.get_my_creation_ids()
returns table (creation_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select creations.id
  from public.creations
  where creations.author_id = (select auth.uid())
    and coalesce((select (auth.jwt() ->> 'is_anonymous')::boolean), false) = false;
$$;

revoke all on function public.get_my_creation_ids() from public;
grant execute on function public.get_my_creation_ids() to authenticated;

commit;
