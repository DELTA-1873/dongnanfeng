import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from './config.js';

const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
const COLORS = new Set(['blue', 'red', 'green', 'gold', 'black']);
let books = [];
let currentUser = null;
let memberProfile = null;
let selectedBookId = null;
let activeFilter = 'all';
let refreshTimer = null;

const $ = (selector, scope = document) => scope.querySelector(selector);
const $$ = (selector, scope = document) => [...scope.querySelectorAll(selector)];
const escapeHtml = (value = '') => String(value).replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
const safeColor = (color) => COLORS.has(color) ? color : 'blue';
const coverMarkup = (book) => `
  <span class="cover-series">东南风 · ${escapeHtml(book.genre)}</span>
  <span class="cover-title">${escapeHtml(book.title)}</span>
  <span class="cover-author">${escapeHtml(book.author)} 著</span>`;

function showToast(message, type = 'info', duration = 2800) {
  const toast = $('#sync-toast');
  toast.textContent = message;
  toast.dataset.type = type;
  toast.hidden = false;
  clearTimeout(showToast.timer);
  if (duration) showToast.timer = setTimeout(() => { toast.hidden = true; }, duration);
}

function readableError(error) {
  console.error(error);
  if (error?.code === '23505') return '账号名已被使用，或你已经完成过这项操作。';
  if (/invalid login credentials/i.test(error?.message || '')) return '邮箱或密码不正确。';
  if (/user already registered/i.test(error?.message || '')) return '这个邮箱已经注册，请直接登录。';
  if (error?.message?.includes('relation') && error?.message?.includes('does not exist')) return '数据库尚未初始化，请先执行建表脚本。';
  return error?.message || '云端服务暂时不可用，请稍后重试。';
}

const isRegisteredUser = () => Boolean(currentUser && currentUser.is_anonymous === false);

function requireRegistered() {
  if (isRegisteredUser()) return true;
  showToast('请先注册或登录正式账号；访客仅可浏览。', 'error', 4200);
  $('#account-dialog').showModal();
  return false;
}

async function ensureAnonymousUser() {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw sessionError;
  if (sessionData.session?.user) return sessionData.session.user;
  const { data, error } = await supabase.auth.signInAnonymously();
  if (error) throw error;
  return data.user;
}

async function loadMemberProfile() {
  memberProfile = null;
  if (!isRegisteredUser()) return;
  const { data, error } = await supabase.from('member_profiles').select('user_id, username, bio').eq('user_id', currentUser.id).single();
  if (error) throw error;
  memberProfile = data;
}

function refreshAccountUi() {
  const registered = isRegisteredUser();
  $('#account-button').textContent = registered ? memberProfile?.username || '我的账号' : '登录 / 注册';
  $('#account-guest-panel').hidden = registered;
  $('#account-signed-panel').hidden = !registered;
  $('#account-username').textContent = memberProfile?.username || '—';
  $('#account-email').textContent = registered ? currentUser.email || '' : '';
  $('#creation-access-note').textContent = registered
    ? `当前以“${memberProfile?.username || '社员'}”登录，可实名或匿名发布作品。`
    : '登录正式账号后可上传 PDF 或 Word；访客可以浏览和下载已发布作品。';
}

async function loadLibrary({ refreshDetail = false, quiet = false } = {}) {
  if (!quiet) showToast('正在同步云端书库…', 'info', 0);
  const [bookResult, commentResult, voteResult, ratingResult] = await Promise.all([
    supabase.from('books').select('*').order('created_at', { ascending: false }),
    supabase.from('comments').select('*').order('created_at', { ascending: true }),
    supabase.from('votes').select('*'),
    supabase.from('ratings').select('*')
  ]);
  const error = bookResult.error || commentResult.error || voteResult.error || ratingResult.error;
  if (error) throw error;

  books = bookResult.data.map((record) => {
    const comments = commentResult.data.filter((item) => item.book_id === record.id).map((item) => ({
      name: item.display_name,
      text: item.body,
      date: new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium' }).format(new Date(item.created_at))
    }));
    const votes = voteResult.data.filter((item) => item.book_id === record.id);
    const ratings = ratingResult.data.filter((item) => item.book_id === record.id);
    const userRating = ratings.find((item) => item.user_id === currentUser.id)?.score || 0;
    return {
      id: record.id,
      title: record.title,
      author: record.author,
      genre: record.genre,
      issue: record.issue,
      color: record.color,
      summary: record.summary,
      createdAt: record.created_at,
      custom: record.created_by === currentUser.id,
      approved: record.approved,
      baseVotes: record.base_votes,
      baseRating: Number(record.base_rating),
      baseRatings: record.base_ratings,
      liveVotes: votes.length,
      liveRatings: ratings,
      userVoted: votes.some((item) => item.user_id === currentUser.id),
      userRating,
      comments
    };
  });

  renderCatalog();
  if (refreshDetail && selectedBookId && $('#book-dialog').open) {
    renderBookDetail(books.find((item) => item.id === selectedBookId));
  }
  if (!quiet) showToast('已与云端同步', 'success');
}

async function loadEvents() {
  const { data, error } = await supabase
    .from('events')
    .select('*')
    .eq('is_published', true)
    .order('starts_at', { ascending: true });
  if (error) throw error;
  renderEvents(data);
}

function renderEvents(events) {
  const grid = $('#event-grid');
  if (!events?.length) {
    grid.innerHTML = '<div class="events-empty"><strong>暂无</strong><p>近期活动正在筹备中，欢迎关注后续更新。</p></div>';
    return;
  }
  grid.innerHTML = events.map((event) => {
    const startsAt = new Date(event.starts_at);
    const day = new Intl.DateTimeFormat('zh-CN', { day: '2-digit' }).format(startsAt);
    const month = new Intl.DateTimeFormat('en-US', { month: 'short' }).format(startsAt).toUpperCase();
    const dateTime = new Intl.DateTimeFormat('zh-CN', { weekday: 'short', hour: '2-digit', minute: '2-digit' }).format(startsAt);
    return `<article class="event-card reveal visible">
      <time datetime="${escapeHtml(event.starts_at)}"><strong>${day}</strong><span>${month}</span></time>
      <div>
        <p class="event-type">${escapeHtml(event.event_type)}</p>
        <h3>${escapeHtml(event.title)}</h3>
        <p>${escapeHtml(event.summary)}</p>
        <span class="event-place">${escapeHtml(dateTime)}${event.location ? ` · ${escapeHtml(event.location)}` : ''}</span>
      </div>
    </article>`;
  }).join('');
}

async function loadMagazines() {
  const { data, error } = await supabase.from('magazine_issues').select('*').eq('is_published', true).order('published_at', { ascending: false });
  if (error) throw error;
  const grid = $('#magazine-grid');
  if (!data?.length) {
    grid.innerHTML = '<div class="content-empty"><strong>暂无社刊</strong><p>新一期正在整理中。</p></div>';
    return;
  }
  grid.innerHTML = data.map((issue) => `<article class="magazine-card">
    <div class="magazine-cover"><span>${escapeHtml(issue.issue_number)}</span><strong>${escapeHtml(issue.title)}</strong></div>
    <p class="card-meta">${new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'long' }).format(new Date(issue.published_at))}</p>
    <h3>${escapeHtml(issue.title)}</h3>
    <p>${escapeHtml(issue.description || '本期社刊')}</p>
    ${issue.file_path ? `<button class="file-link" type="button" data-file-bucket="magazines" data-file-path="${escapeHtml(issue.file_path)}">查阅 PDF ↗</button>` : '<button class="file-link" type="button" disabled>电子版整理中</button>'}
  </article>`).join('');
}

async function loadCreations() {
  const { data, error } = await supabase
    .from('creations')
    .select('id,title,summary,category,publish_anonymously,public_author,file_path,file_name,file_size,published_at')
    .eq('status', 'published')
    .order('published_at', { ascending: false });
  if (error) throw error;
  const grid = $('#creation-grid');
  if (!data?.length) {
    grid.innerHTML = '<div class="content-empty"><strong>暂无创作</strong><p>期待第一篇作品在这里出现。</p></div>';
    return;
  }
  grid.innerHTML = data.map((creation) => {
    const author = creation.publish_anonymously ? '匿名作者' : creation.public_author || '东南风社员';
    const date = new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium' }).format(new Date(creation.published_at));
    return `<article class="creation-card">
      <p class="card-meta">${escapeHtml(creation.category)} · ${escapeHtml(author)} · ${escapeHtml(date)}</p>
      <h3>${escapeHtml(creation.title)}</h3>
      <p>${escapeHtml(creation.summary || '作者没有留下简介。')}</p>
      <div class="creation-file">${escapeHtml(creation.file_name)} · ${formatFileSize(creation.file_size)}</div>
      <button class="file-link" type="button" data-file-bucket="creations" data-file-path="${escapeHtml(creation.file_path)}">打开作品 ↗</button>
    </article>`;
  }).join('');
}

function formatFileSize(bytes) {
  const size = Number(bytes);
  return size >= 1048576 ? `${(size / 1048576).toFixed(1)} MB` : `${Math.ceil(size / 1024)} KB`;
}

async function openPrivateFile(button) {
  const { data, error } = await supabase.storage.from(button.dataset.fileBucket).createSignedUrl(button.dataset.filePath, 300);
  if (error) throw error;
  window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
}

const ratingFor = (book) => {
  const liveSum = book.liveRatings.reduce((sum, item) => sum + item.score, 0);
  const count = book.baseRatings + book.liveRatings.length;
  return { average: count ? ((book.baseRating * book.baseRatings) + liveSum) / count : 0, count };
};
const votesFor = (book) => book.baseVotes + book.liveVotes;

function renderCatalog() {
  const term = $('#catalog-search').value.trim().toLowerCase();
  const sort = $('#catalog-sort').value;
  const matches = books.filter((book) => {
    const filterMatch = activeFilter === 'all' || (activeFilter === '自建' ? book.custom : book.genre === activeFilter);
    return filterMatch && `${book.title} ${book.author} ${book.summary}`.toLowerCase().includes(term);
  });
  matches.sort((a, b) => {
    if (sort === 'rating') return ratingFor(b).average - ratingFor(a).average;
    if (sort === 'votes') return votesFor(b) - votesFor(a);
    return String(b.createdAt).localeCompare(String(a.createdAt));
  });

  $('#catalog-count').textContent = `共 ${matches.length} 部作品`;
  $('#empty-state').hidden = matches.length !== 0;
  $('#book-grid').innerHTML = matches.map((book) => {
    const rating = ratingFor(book);
    const reviewState = book.custom && !book.approved ? ' · 待审核' : '';
    return `<article class="book-card">
      <button class="book-cover-button" type="button" data-book-id="${escapeHtml(book.id)}" aria-label="查看《${escapeHtml(book.title)}》详情">
        <span class="book-cover" data-color="${safeColor(book.color)}">${coverMarkup(book)}</span>
      </button>
      <div class="book-info">
        <h3 title="${escapeHtml(book.title)}">${escapeHtml(book.title)}</h3>
        <p>${escapeHtml(book.author)} · ${escapeHtml(book.genre)}${book.custom ? ' · 自建' : ''}${reviewState}</p>
        <div class="book-stats"><span class="score">★ ${rating.count ? rating.average.toFixed(1) : '暂无'}</span><span>△ ${votesFor(book)} 票 · ${book.comments.length} 评</span></div>
      </div>
    </article>`;
  }).join('');
}

function renderBookDetail(book) {
  if (!book) return;
  $('#detail-cover').dataset.color = safeColor(book.color);
  $('#detail-cover').innerHTML = coverMarkup(book);
  const state = book.custom && !book.approved ? ' · 待审核' : '';
  $('#detail-meta').textContent = `${book.genre} · ${book.author} · ${book.issue || '独立书目'}${state}`;
  $('#detail-title').textContent = book.title;
  $('#detail-summary').textContent = book.summary;
  renderVotes(book);
  renderRating(book);
  renderComments(book);
}

function openBook(id) {
  const book = books.find((item) => item.id === id);
  if (!book) return;
  selectedBookId = id;
  renderBookDetail(book);
  $('#book-dialog').showModal();
}

function renderVotes(book) {
  $('#detail-votes').textContent = votesFor(book);
  $('#vote-button').setAttribute('aria-pressed', String(book.userVoted));
  $('#vote-button').querySelector('span').textContent = book.userVoted ? '▽' : '△';
}

function renderRating(book) {
  const rating = ratingFor(book);
  $('#rating-average').textContent = rating.count ? rating.average.toFixed(1) : '—';
  $('#rating-count').textContent = rating.count ? `${rating.count} 人评分` : '暂无评分';
  $('#rating-stars').innerHTML = [1, 2, 3, 4, 5].map((score) => `<button class="star ${score <= book.userRating ? 'selected' : ''}" type="button" data-score="${score}" aria-label="评 ${score} 星" aria-pressed="${score === book.userRating}">★</button>`).join('');
}

function renderComments(book) {
  $('#comments-count').textContent = `${book.comments.length} 条`;
  $('#comment-list').innerHTML = book.comments.length ? [...book.comments].reverse().map((comment) => `<article class="comment"><header><strong>${escapeHtml(comment.name)}</strong><time>${escapeHtml(comment.date)}</time></header><p>${escapeHtml(comment.text)}</p></article>`).join('') : '<p class="comment-empty">还没有评论，来写下第一条阅读感受吧。</p>';
}

function closeDialog(dialog) {
  if (dialog?.open) dialog.close();
}

async function withBusy(button, action) {
  const previous = button.disabled;
  button.disabled = true;
  try { await action(); }
  catch (error) { showToast(readableError(error), 'error', 5000); }
  finally { button.disabled = previous; }
}

const menuButton = $('.menu-button');
const nav = $('.site-nav');
menuButton?.addEventListener('click', () => {
  const open = menuButton.getAttribute('aria-expanded') !== 'true';
  menuButton.setAttribute('aria-expanded', String(open));
  nav.classList.toggle('open', open);
});
$$('.site-nav a').forEach((link) => link.addEventListener('click', () => {
  menuButton?.setAttribute('aria-expanded', 'false');
  nav.classList.remove('open');
}));

$('#account-button').addEventListener('click', () => {
  menuButton?.setAttribute('aria-expanded', 'false');
  nav.classList.remove('open');
  refreshAccountUi();
  $('#account-dialog').showModal();
});

$$('[data-account-tab]').forEach((button) => button.addEventListener('click', () => {
  const register = button.dataset.accountTab === 'register';
  $$('.account-tab').forEach((tab) => {
    const active = tab === button;
    tab.classList.toggle('active', active);
    tab.setAttribute('aria-selected', String(active));
  });
  $('#login-form').hidden = register;
  $('#register-form').hidden = !register;
}));

async function restoreBrowsingSession() {
  currentUser = await ensureAnonymousUser();
  memberProfile = null;
  refreshAccountUi();
}

$('#login-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const submit = event.currentTarget.querySelector('[type="submit"]');
  withBusy(submit, async () => {
    const form = new FormData(event.currentTarget);
    await supabase.auth.signOut({ scope: 'local' });
    const { data, error } = await supabase.auth.signInWithPassword({
      email: String(form.get('email')).trim(),
      password: String(form.get('password'))
    });
    if (error) {
      await restoreBrowsingSession();
      throw error;
    }
    currentUser = data.user;
    await loadMemberProfile();
    refreshAccountUi();
    closeDialog($('#account-dialog'));
    await Promise.all([loadLibrary({ quiet: true }), loadCreations()]);
    showToast(`欢迎回来，${memberProfile.username}`, 'success');
  });
});

$('#register-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const submit = event.currentTarget.querySelector('[type="submit"]');
  withBusy(submit, async () => {
    const form = new FormData(event.currentTarget);
    await supabase.auth.signOut({ scope: 'local' });
    const { data, error } = await supabase.auth.signUp({
      email: String(form.get('email')).trim(),
      password: String(form.get('password')),
      options: {
        data: { username: String(form.get('username')).trim() },
        emailRedirectTo: 'https://delta-1873.github.io/dongnanfeng/'
      }
    });
    if (error) {
      await restoreBrowsingSession();
      throw error;
    }
    if (!data.session) {
      await restoreBrowsingSession();
      closeDialog($('#account-dialog'));
      event.currentTarget.reset();
      showToast('注册申请已提交，请查收验证邮件后再登录。', 'success', 6000);
      return;
    }
    currentUser = data.user;
    await loadMemberProfile();
    refreshAccountUi();
    closeDialog($('#account-dialog'));
    event.currentTarget.reset();
    showToast(`账号“${memberProfile.username}”已创建`, 'success');
  });
});

$('#logout-button').addEventListener('click', (event) => withBusy(event.currentTarget, async () => {
  await supabase.auth.signOut({ scope: 'local' });
  await restoreBrowsingSession();
  closeDialog($('#account-dialog'));
  await loadLibrary({ quiet: true });
  showToast('已退出账号，当前为只读访客模式。', 'success');
}));

document.addEventListener('click', (event) => {
  const button = event.target.closest('[data-file-bucket]');
  if (!button) return;
  withBusy(button, () => openPrivateFile(button));
});

$('#catalog-search').addEventListener('input', renderCatalog);
$('#catalog-sort').addEventListener('change', renderCatalog);
$$('#catalog-filters .filter').forEach((button) => button.addEventListener('click', () => {
  activeFilter = button.dataset.filter;
  $$('#catalog-filters .filter').forEach((item) => {
    const selected = item === button;
    item.classList.toggle('active', selected);
    item.setAttribute('aria-pressed', String(selected));
  });
  renderCatalog();
}));

$('#book-grid').addEventListener('click', (event) => {
  const button = event.target.closest('[data-book-id]');
  if (button) openBook(button.dataset.bookId);
});

$('#vote-button').addEventListener('click', (event) => withBusy(event.currentTarget, async () => {
  if (!requireRegistered()) return;
  const book = books.find((item) => item.id === selectedBookId);
  if (!book) return;
  const query = book.userVoted
    ? supabase.from('votes').delete().eq('book_id', book.id).eq('user_id', currentUser.id)
    : supabase.from('votes').insert({ book_id: book.id, user_id: currentUser.id });
  const { error } = await query;
  if (error) throw error;
  await loadLibrary({ refreshDetail: true, quiet: true });
  showToast(book.userVoted ? '已撤销投票' : '投票成功', 'success');
}));

$('#rating-stars').addEventListener('click', (event) => {
  const button = event.target.closest('[data-score]');
  if (!button) return;
  if (!requireRegistered()) return;
  withBusy(button, async () => {
    const { error } = await supabase.from('ratings').upsert({
      book_id: selectedBookId,
      user_id: currentUser.id,
      score: Number(button.dataset.score)
    }, { onConflict: 'book_id,user_id' });
    if (error) throw error;
    await loadLibrary({ refreshDetail: true, quiet: true });
    showToast('评分已保存', 'success');
  });
});

$('#comment-form').addEventListener('submit', (event) => {
  event.preventDefault();
  if (!requireRegistered()) return;
  const submit = event.currentTarget.querySelector('button[type="submit"]');
  withBusy(submit, async () => {
    const name = $('#comment-name').value.trim();
    const body = $('#comment-text').value.trim();
    const { error } = await supabase.from('comments').insert({
      book_id: selectedBookId,
      author_id: currentUser.id,
      display_name: name,
      body
    });
    if (error) throw error;
    event.currentTarget.reset();
    await loadLibrary({ refreshDetail: true, quiet: true });
    showToast('评论已发布', 'success');
  });
});

$('#open-create').addEventListener('click', () => {
  if (!requireRegistered()) return;
  $('#create-form').reset();
  updateCreatePreview();
  $('#create-dialog').showModal();
  setTimeout(() => $('#create-title-input').focus(), 50);
});

$('#open-creation').addEventListener('click', () => {
  if (!requireRegistered()) return;
  $('#creation-form').reset();
  $('#creation-dialog').showModal();
});

$('#creation-form').addEventListener('submit', (event) => {
  event.preventDefault();
  if (!requireRegistered()) return;
  const submit = event.currentTarget.querySelector('[type="submit"]');
  withBusy(submit, async () => {
    const form = new FormData(event.currentTarget);
    const file = form.get('file');
    const allowed = new Set([
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ]);
    if (!(file instanceof File) || !allowed.has(file.type)) throw new Error('只支持 PDF、DOC 或 DOCX 文件。');
    if (file.size > 15728640) throw new Error('文件不能超过 15 MB。');
    const extension = file.name.split('.').pop().toLowerCase();
    const filePath = `${currentUser.id}/${crypto.randomUUID()}.${extension}`;
    const { error: uploadError } = await supabase.storage.from('creations').upload(filePath, file, {
      contentType: file.type,
      upsert: false
    });
    if (uploadError) throw uploadError;
    const { error: insertError } = await supabase.from('creations').insert({
      author_id: currentUser.id,
      title: String(form.get('title')).trim(),
      summary: String(form.get('summary')).trim(),
      category: String(form.get('category')),
      publish_anonymously: form.get('publish_anonymously') === 'on',
      file_path: filePath,
      file_name: file.name,
      mime_type: file.type,
      file_size: file.size,
      status: 'published',
      published_at: new Date().toISOString()
    });
    if (insertError) {
      await supabase.storage.from('creations').remove([filePath]);
      throw insertError;
    }
    closeDialog($('#creation-dialog'));
    event.currentTarget.reset();
    await loadCreations();
    showToast('作品已上传并发布', 'success');
  });
});

function updateCreatePreview() {
  const form = $('#create-form');
  const preview = $('#create-cover-preview');
  preview.dataset.color = safeColor($('#create-color').value);
  preview.innerHTML = coverMarkup({
    title: $('#create-title-input').value.trim() || '你的书名',
    author: $('[name="author"]', form).value.trim() || '作者',
    genre: $('[name="genre"]', form).value
  });
}

$('#create-form').addEventListener('input', updateCreatePreview);
$('#create-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const submit = event.currentTarget.querySelector('button[type="submit"]');
  withBusy(submit, async () => {
    const data = new FormData(event.currentTarget);
    const { data: created, error } = await supabase.from('books').insert({
      title: String(data.get('title')).trim(),
      author: String(data.get('author')).trim(),
      genre: String(data.get('genre')),
      issue: String(data.get('issue')).trim() || null,
      color: safeColor(String(data.get('color'))),
      summary: String(data.get('summary')).trim(),
      created_by: currentUser.id,
      approved: false
    }).select('id').single();
    if (error) throw error;
    closeDialog($('#create-dialog'));
    await loadLibrary({ quiet: true });
    renderCatalog();
    openBook(created.id);
    showToast('书目已保存，审核后将对所有读者公开', 'success', 4500);
  });
});

$$('[data-close]').forEach((button) => button.addEventListener('click', () => closeDialog($(`#${button.dataset.close}`))));
$$('dialog').forEach((dialog) => dialog.addEventListener('click', (event) => {
  if (event.target === dialog) closeDialog(dialog);
}));

function subscribeToChanges() {
  supabase.channel('dongnanfeng-library')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'books' }, scheduleRefresh)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'comments' }, scheduleRefresh)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'votes' }, scheduleRefresh)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'ratings' }, scheduleRefresh)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'events' }, () => loadEvents().catch((error) => console.error(error)))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'magazine_issues' }, () => loadMagazines().catch((error) => console.error(error)))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'creations' }, () => loadCreations().catch((error) => console.error(error)))
    .subscribe();
}

function scheduleRefresh() {
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => loadLibrary({ refreshDetail: true, quiet: true }).catch((error) => showToast(readableError(error), 'error', 5000)), 250);
}

const observer = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (entry.isIntersecting) {
      entry.target.classList.add('visible');
      observer.unobserve(entry.target);
    }
  });
}, { threshold: 0.12 });
$$('.reveal').forEach((element) => observer.observe(element));
$('#year').textContent = new Date().getFullYear();

async function init() {
  try {
    currentUser = await ensureAnonymousUser();
    await loadMemberProfile();
    refreshAccountUi();
    try {
      await loadLibrary();
    } catch (error) {
      const staleSession = /jwt|token|session/i.test(error?.message || '');
      if (!staleSession) throw error;
      await supabase.auth.signOut({ scope: 'local' });
      currentUser = await ensureAnonymousUser();
      await loadLibrary();
    }
    await loadEvents().catch((error) => {
      console.error(error);
      renderEvents([]);
    });
    await loadMagazines();
    await loadCreations();
    subscribeToChanges();
  } catch (error) {
    showToast(readableError(error), 'error', 0);
    $('#catalog-count').textContent = '云端书库尚未就绪';
    $('#empty-state').hidden = false;
    $('#empty-state strong').textContent = '需要先初始化数据库';
    $('#empty-state span').textContent = '请在 Supabase SQL Editor 中执行项目附带的 schema.sql。';
  }
}

init();
