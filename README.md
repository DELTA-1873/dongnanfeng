# 东南风文学社

东南风文学社官方网站前端。静态页面位于 `dist/`，通过 GitHub Actions 部署到 GitHub Pages。

## 功能

- 书目目录搜索、分类与排序
- 封面和摘要预览
- 评论、投票与五星评分
- 自建书目和实时封面预览
- Supabase 云端数据、匿名身份和实时同步

## 数据库初始化

在 Supabase Dashboard 的 SQL Editor 中执行 [`supabase/schema.sql`](supabase/schema.sql)，然后再发布前端。公开连接配置位于 `dist/config.js`；不要把 Secret Key 或 `service_role` Key 放进仓库。

后续迁移按文件名顺序执行。当前迁移 [`supabase/migrations/20260920_reset_catalog_and_add_blogs.sql`](supabase/migrations/20260920_reset_catalog_and_add_blogs.sql) 会清空测试互动、把评分归零、扩充书目并创建匿名用户博客表。

[`supabase/migrations/20260920_add_events.sql`](supabase/migrations/20260920_add_events.sql) 创建近期活动表；前端只读取已发布活动，空表显示“暂无”。

本地预览：

```bash
python3 -m http.server 4173 --directory dist
```
