# 东南风文学社

东南风文学社官网，静态前端位于 `dist/`，数据、账号与私有文件由 Supabase 提供，通过 GitHub Actions 发布到 GitHub Pages。

- 线上地址：<https://delta-1873.github.io/dongnanfeng/>
- Supabase 项目：`cgkjtsuyjdkhcwhqygyx`
- 部署配置：`.github/workflows/pages.yml`

## 当前功能

- 书目目录：搜索、分类、排序、封面和摘要预览
- 阅读互动：评论、投票、五星评分
- 自建书目：正式账号可创建，审核后公开
- 社刊：展示历期刊物，PDF 可在站内阅读器直接翻阅
- 2026 年刊：整刊阅读、35 篇分篇 PDF、文章/作者搜索与类型筛选
- 社员创作：正式账号上传 PDF、DOC、DOCX，可实名或匿名发布；PDF 与 DOCX 支持站内阅读
- 账号：用户名和密码注册、登录、退出；账号名用于实名署名
- 权限：未注册访客只读；正式账号才可评论、评分、投票、建书目和投稿
- 实时同步：书目、互动、活动、社刊与创作变更通过 Supabase Realtime 更新

## 安全模型

账号由 Supabase Auth 管理。试行版只向用户显示用户名和密码字段。`dist/script.js` 会把标准化后的用户名做 SHA-256，生成不可见的内部 Auth 邮箱标识；该标识只用于兼容 Supabase 的邮箱密码登录接口，不用于收发邮件。密码仍由 Supabase Auth 管理，不写入业务表或仓库。

`dist/config.js` 只能保存公开的 Project URL 和 Publishable Key。严禁把 Secret Key、`service_role` Key、数据库密码或用户密码提交到 GitHub。

网页会为普通访客建立 Supabase 匿名会话，以便通过 RLS 读取公开数据。数据库通过 JWT 的 `is_anonymous` 字段区分匿名访客和正式账号，所有写入策略均要求正式账号。因此，即使有人绕过网页按钮直接调用 API，匿名访客也无法写入。

## 数据结构

| 表 | 用途 | 公开读取 | 写入者 |
| --- | --- | --- | --- |
| `books` | 书目与摘要 | 已审核条目 | 正式账号创建，后台审核 |
| `comments` | 书目评论 | 是 | 正式账号 |
| `votes` | 书目投票 | 是 | 正式账号 |
| `ratings` | 书目评分 | 是 | 正式账号 |
| `events` | 近期活动 | 已发布活动 | Dashboard 管理员 |
| `member_profiles` | 账号名与公开资料 | 是 | 注册触发器创建，本人更新 |
| `magazine_issues` | 社刊期号、介绍和文件路径 | 已发布社刊 | Dashboard 管理员 |
| `magazine_articles` | 社刊分篇目录、作者、分类和页码 | 已发布社刊的文章 | SQL 迁移维护 |
| `creations` | 创作元数据、署名模式和文件路径 | 已发布作品 | 正式账号本人 |
| `blog_profiles` / `blog_posts` / `blog_post_comments` | 预留博客数据 | 按各表 RLS | 按各表 RLS |

私有 Storage Bucket：

- `creations`：最大 15 MB；允许 PDF、DOC、DOCX。上传路径固定为 `{用户 UUID}/{随机 UUID}.{扩展名}`。
- `magazines`：最大 50 MB；仅允许 PDF。管理员在 Dashboard 上传。

数据库只保存文件元数据与私有路径，不保存永久公开下载地址。前端每次阅读或打开原文件时生成 5 分钟有效的签名链接。匿名发布时，数据库仍在受保护的 `creations.author_id` 中记录账号 UUID，以便版权、删除与后台管理；读者账号没有该列的读取权限，只能看到服务端生成的 `public_author`，匿名作品的该字段为空。

## 站内阅读器

- PDF：使用 PDF.js 在站内画布中居中渲染，不依赖各浏览器表现不一致的内置插件；支持上一页、下一页、页码、缩放、适合宽度以及键盘左右方向键翻页。
- DOCX：浏览器临时读取签名链接，并使用 Mammoth 转为网页正文；转换后的 HTML 会经 DOMPurify 清理后再显示。
- DOC：旧版二进制 Word 格式不支持可靠的浏览器解析，阅读器会提示使用“新窗口打开”。建议投稿者优先上传 PDF 或 DOCX。
- 所有格式均保留“新窗口打开”入口。私有创作使用临时签名链接，不会因此改成公开文件。

## 首次初始化与迁移

在 Supabase Dashboard 的 SQL Editor 中按顺序执行：

1. `supabase/schema.sql`
2. `supabase/migrations/20260920_reset_catalog_and_add_blogs.sql`
3. `supabase/migrations/20260920_add_events.sql`
4. `supabase/migrations/20260920_add_accounts_magazines_creations.sql`
5. `supabase/migrations/20260920_add_2026_issue_articles.sql`

最后一个迁移会创建账号资料、社刊、创作表和两个私有 Bucket，同时收紧现有书目互动的写权限。脚本使用 `if not exists` 和 `drop policy if exists`，方便维护时重新执行；但仍建议先备份生产数据。

## Supabase Auth 设置

在 Dashboard → Authentication 中：

1. Providers → Email：开启邮箱密码注册，并关闭 **Confirm email**。试行账号没有真实邮箱，开启确认会导致注册后无法登录。
2. Providers → Anonymous：保持开启，供只读访客使用。
3. URL Configuration 的 Site URL 保持为 `https://delta-1873.github.io/dongnanfeng/`。

这种用户名方案适合小范围试行，没有找回密码功能。若未来公开运营，应迁移到真实邮箱验证，并增加密码重置流程。

## 如何发布社刊

社刊只允许管理员通过 Dashboard 发布：

1. Storage → `magazines` → 上传 PDF，例如 `2026/issue-24.pdf`。
2. Table Editor → `magazine_issues` → Insert row。
3. 填写：
   - `issue_number`：如 `第 24 期`
   - `title`：本期标题
   - `description`：简介
   - `file_path`：必须与 Bucket 内路径完全一致，如 `2026/issue-24.pdf`
   - `is_published`：`true`
   - `published_at`：发布时间
4. 保存后网页会实时出现该期社刊。

`cover_url` 可填写站内封面或可信图片地址；2026 年刊使用从原 PDF 首页生成的站内封面。

### 2026 年刊的站内文件

2026 年刊原文件为项目根目录的 `26社刊 A5.pdf`。站内发布文件位于：

- `dist/magazines/2026/dongnanfeng-2026.pdf`：完整年刊
- `dist/magazines/2026/cover.png`：封面预览
- `dist/magazines/2026/articles/`：按印刷页裁切后的 35 篇独立 PDF
- `dist/magazines/2026/articles.json`：前端文章目录

刊物采用左右跨页排版。维护脚本 `scripts/split_issue_2026.py` 会把每个跨页裁成独立 A5 印刷页，再按文章页码组合输出。若替换源刊物或调整目录，先修改脚本中的 `ARTICLES`，然后运行：

```bash
/Users/eltad/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3 scripts/split_issue_2026.py
```

随后重新生成封面并部署。数据库目录由 `20260920_add_2026_issue_articles.sql` 维护；前端保留 `articles.json` 作为静态发布目录，避免数据库临时不可用时整刊入口消失。

## 创作发布与管理

正式账号在网页点击“发布创作”，填写标题、类型、简介并上传文件。选择“匿名发布”后，前台显示“匿名作者”；未选择则显示 `member_profiles.username`。

管理员可在 Table Editor → `creations` 修改 `status`：

- `published`：公开可见
- `hidden`：隐藏但保留文件和记录
- `draft`：仅作者本人可读

删除记录前应同时在 Storage → `creations` 删除对应 `file_path`，避免孤立文件。网页在数据库插入失败时会自动回滚刚上传的文件。

账号名保存在 `member_profiles` 且忽略大小写唯一。不要直接编辑 `auth.users`；封禁或删除账号应使用 Authentication → Users。删除 Auth 用户会级联删除其资料和创作记录，但 Storage 对象不会自动级联，应先清理该用户 UUID 文件夹。

## 本地开发

不要直接双击 `dist/index.html`，请启动本地 HTTP 服务：

```bash
python3 -m http.server 4173 --directory dist
```

然后访问 <http://localhost:4173>。

主要文件：

- `dist/index.html`：页面结构和表单
- `dist/styles.css`：桌面与移动端样式
- `dist/script.js`：Supabase 查询、账号与上传逻辑
- `dist/config.js`：公开连接配置
- `supabase/`：初始化 SQL 与增量迁移

## 部署与维护

推送 `main` 分支后，GitHub Actions 会把 `dist/` 发布到 GitHub Pages。可在 GitHub 仓库 Actions 页查看部署结果。

维护时遵守以下规则：

- 结构变更一律新增带日期的 SQL migration，不要只在 Dashboard 手改而不留记录。
- 新表默认开启 RLS；先写最小权限策略，再向前端开放。
- 不把私有 Bucket 改成 public；下载继续使用签名链接。
- 文件类型与大小需同时在前端、数据库约束和 Bucket 配置中限制。
- 上线前分别用匿名访客和正式账号测试读写权限。
- 修改后检查桌面端、手机端、键盘操作和对话框关闭逻辑。
