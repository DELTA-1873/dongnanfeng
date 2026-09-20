import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from './config.js';

const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
const COLORS = new Set(['blue', 'red', 'green', 'gold', 'black']);
let books = [];
let currentUser = null;
let memberProfile = null;
let selectedBookId = null;
let activeFilter = 'all';
let issueArticles = [];
let activeArticleFilter = '全部';
let refreshTimer = null;
let activeFeedback = null;
let pdfModulePromise = null;
let readerPdf = null;
let readerLoadingTask = null;
let readerRenderTask = null;
let readerPageNumber = 1;
let readerZoom = 1;
let readerSession = 0;
let readerResizeTimer = null;

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
  if (/invalid login credentials/i.test(error?.message || '')) return '用户名或密码不正确。';
  if (/user already registered/i.test(error?.message || '')) return '这个用户名已经注册，请直接登录。';
  if (error?.message?.includes('relation') && error?.message?.includes('does not exist')) return '数据库尚未初始化，请先执行建表脚本。';
  return error?.message || '云端服务暂时不可用，请稍后重试。';
}

const isRegisteredUser = () => Boolean(currentUser && currentUser.is_anonymous === false);

async function accountEmail(username) {
  const normalized = String(username).trim().normalize('NFKC').toLowerCase();
  const bytes = new TextEncoder().encode(normalized);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  const identifier = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${identifier}@account.dongnanfeng.cn`;
}

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
  const accountButton = $('#account-button');
  const guestPanel = $('#account-guest-panel');
  const signedPanel = $('#account-signed-panel');
  const accountUsername = $('#account-username');
  const accessNote = $('#creation-access-note');
  if (accountButton) accountButton.textContent = registered ? memberProfile?.username || '我的账号' : '登录 / 注册';
  if (guestPanel) guestPanel.hidden = registered;
  if (signedPanel) signedPanel.hidden = !registered;
  if (accountUsername) accountUsername.textContent = memberProfile?.username || '—';
  if (accessNote) {
    accessNote.textContent = registered
      ? `当前以“${memberProfile?.username || '社员'}”登录，可实名或匿名发布作品。`
      : '登录正式账号后可上传 PDF 或 Word；访客可以浏览和下载已发布作品。';
  }
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
  const issues = [...(data || [])];
  if (!issues.some((issue) => String(issue.issue_number).includes('2026'))) {
    issues.unshift({
      id: '20260000-0000-4000-8000-000000000001',
      issue_number: '2026 年刊',
      title: '东南风文学社三十五周年年刊',
      description: '收录卷首语、影像辑录、书单、小说、散文、诗歌与社史，共 35 篇独立内容。',
      cover_url: './magazines/2026/cover.png',
      source_url: './magazines/2026/dongnanfeng-2026.pdf',
      published_at: '2026-08-01T00:00:00+08:00'
    });
  }
  grid.innerHTML = issues.map((issue) => `<article class="magazine-card">
    ${issue.cover_url ? `<img class="magazine-cover-image" src="${escapeHtml(issue.cover_url)}" alt="${escapeHtml(issue.title)}封面" />` : `<div class="magazine-cover"><span>${escapeHtml(issue.issue_number)}</span><strong>${escapeHtml(issue.title)}</strong></div>`}
    <div class="magazine-copy">
      <p class="card-meta">${new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'long' }).format(new Date(issue.published_at))}</p>
      <h3>${escapeHtml(issue.title)}</h3>
      <p>${escapeHtml(issue.description || '本期社刊')}</p>
      <div class="card-actions">
        ${issue.source_url ? `<a class="file-link" href="${escapeHtml(issue.source_url)}" data-reader-url="${escapeHtml(issue.source_url)}" data-reader-title="${escapeHtml(issue.title)}" data-reader-mime="application/pdf">站内阅读 ↗</a>` : issue.file_path ? `<button class="file-link" type="button" data-file-bucket="magazines" data-file-path="${escapeHtml(issue.file_path)}" data-file-mime="application/pdf" data-reader-title="${escapeHtml(issue.title)}">站内阅读 ↗</button>` : '<button class="file-link" type="button" disabled>电子版整理中</button>'}
        <button class="file-link" type="button" data-feedback-type="magazine" data-feedback-id="${escapeHtml(issue.id)}" data-feedback-title="${escapeHtml(issue.title)}">点评与评分 ☆</button>
      </div>
    </div>
  </article>`).join('');
}

async function loadIssueArticles() {
  const response = await fetch('./magazines/2026/articles.json?v=20260920');
  if (!response.ok) throw new Error('2026 年刊文章目录加载失败。');
  issueArticles = await response.json();
  const categories = ['全部', ...new Set(issueArticles.map((article) => article.category))];
  $('#article-filters').innerHTML = categories.map((category) => `<button class="filter ${category === activeArticleFilter ? 'active' : ''}" type="button" data-article-filter="${escapeHtml(category)}" aria-pressed="${category === activeArticleFilter}">${escapeHtml(category)}</button>`).join('');
  renderIssueArticles();
}

function renderIssueArticles() {
  const term = $('#article-search').value.trim().toLowerCase();
  const matches = issueArticles.filter((article) => {
    const categoryMatch = activeArticleFilter === '全部' || article.category === activeArticleFilter;
    return categoryMatch && `${article.title} ${article.author} ${article.category}`.toLowerCase().includes(term);
  });
  $('#issue-article-count').textContent = `共 ${matches.length} / ${issueArticles.length} 篇`;
  $('#article-grid').innerHTML = matches.length ? matches.map((article) => {
    const pages = article.start === article.end ? `第 ${article.start} 页` : `第 ${article.start}–${article.end} 页`;
    return `<article class="article-card">
      <p class="card-meta">${escapeHtml(article.category)}</p>
      <h4>${escapeHtml(article.title)}</h4>
      <p>${escapeHtml(article.author)}</p>
      <p class="article-pages">${pages} · ${article.page_count} 页</p>
      <a class="file-link" href="${escapeHtml(article.file)}" data-reader-url="${escapeHtml(article.file)}" data-reader-title="${escapeHtml(article.title)}" data-reader-mime="application/pdf">阅读全文 ↗</a>
    </article>`;
  }).join('') : '<div class="content-empty"><strong>没有找到文章</strong><p>换个关键词或分类试试。</p></div>';
}

async function loadCreations() {
  const { data, error } = await supabase
    .from('creations')
    .select('id,title,summary,category,publish_anonymously,public_author,file_path,file_name,mime_type,file_size,published_at')
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
      <div class="card-actions">
        <button class="file-link" type="button" data-file-bucket="creations" data-file-path="${escapeHtml(creation.file_path)}" data-file-mime="${escapeHtml(creation.mime_type || '')}" data-reader-title="${escapeHtml(creation.title)}">站内阅读 ↗</button>
        <button class="file-link" type="button" data-feedback-type="creation" data-feedback-id="${escapeHtml(creation.id)}" data-feedback-title="${escapeHtml(creation.title)}">点评与评分 ☆</button>
      </div>
    </article>`;
  }).join('');
}

function formatFileSize(bytes) {
  const size = Number(bytes);
  return size >= 1048576 ? `${(size / 1048576).toFixed(1)} MB` : `${Math.ceil(size / 1024)} KB`;
}

async function refreshFeedback() {
  if (!activeFeedback) return;
  const { type, id } = activeFeedback;
  const [commentResult, ratingResult] = await Promise.all([
    supabase.from('content_comments').select('id,display_name,body,created_at').eq('target_type', type).eq('target_id', id).order('created_at', { ascending: false }),
    supabase.from('content_ratings').select('user_id,score').eq('target_type', type).eq('target_id', id)
  ]);
  if (commentResult.error) throw commentResult.error;
  if (ratingResult.error) throw ratingResult.error;

  const comments = commentResult.data || [];
  const ratings = ratingResult.data || [];
  const average = ratings.length ? ratings.reduce((sum, rating) => sum + rating.score, 0) / ratings.length : 0;
  const userRating = ratings.find((rating) => rating.user_id === currentUser?.id)?.score || 0;
  $('#feedback-average').textContent = ratings.length ? average.toFixed(1) : '—';
  $('#feedback-rating-count').textContent = ratings.length ? `${ratings.length} 人评分` : '暂无评分';
  $('#feedback-stars').innerHTML = [1, 2, 3, 4, 5].map((score) => `<button class="star ${score <= userRating ? 'selected' : ''}" type="button" data-feedback-score="${score}" aria-label="评 ${score} 星" aria-pressed="${score === userRating}">★</button>`).join('');
  $('#feedback-comment-count').textContent = `${comments.length} 条`;
  $('#feedback-comment-list').innerHTML = comments.length ? comments.map((comment) => `<article class="comment"><header><strong>${escapeHtml(comment.display_name)}</strong><time>${new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium' }).format(new Date(comment.created_at))}</time></header><p>${escapeHtml(comment.body)}</p></article>`).join('') : '<p class="comment-empty">还没有点评，来写下第一条阅读感受吧。</p>';
  $('#feedback-access-note').textContent = isRegisteredUser() ? `将以账号名“${memberProfile?.username || '社员'}”发表。` : '注册或登录后可评分和发表点评。';
}

async function openFeedback(type, id, title) {
  activeFeedback = { type, id, title };
  $('#feedback-kind').textContent = type === 'magazine' ? '社刊点评' : '成员作品点评';
  $('#feedback-title').textContent = title;
  $('#feedback-average').textContent = '—';
  $('#feedback-rating-count').textContent = '正在读取评分…';
  $('#feedback-stars').replaceChildren();
  $('#feedback-comment-count').textContent = '…';
  $('#feedback-comment-list').innerHTML = '<p class="comment-empty">正在读取点评…</p>';
  $('#feedback-form').reset();
  const dialog = $('#feedback-dialog');
  if (!dialog.open) dialog.showModal();
  await refreshFeedback();
}

async function openPrivateFile(button) {
  const { data, error } = await supabase.storage.from(button.dataset.fileBucket).createSignedUrl(button.dataset.filePath, 300);
  if (error) throw error;
  await openReader(data.signedUrl, button.dataset.readerTitle || '作品阅读器', button.dataset.fileMime || 'application/pdf');
}

function loadExternalScript(src, globalName) {
  if (window[globalName]) return Promise.resolve(window[globalName]);
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`);
    const script = existing || Object.assign(document.createElement('script'), { src, defer: true });
    script.addEventListener('load', () => resolve(window[globalName]), { once: true });
    script.addEventListener('error', () => reject(new Error(`${globalName} 加载失败。`)), { once: true });
    if (!existing) document.head.append(script);
  });
}

async function convertDocxToPdf(file) {
  showToast('正在将 Word 转换为 PDF，请稍候…', 'info', 0);
  const [mammoth, DOMPurify, html2pdf] = await Promise.all([
    loadExternalScript('https://cdn.jsdelivr.net/npm/mammoth@1.10.0/mammoth.browser.min.js', 'mammoth'),
    loadExternalScript('https://cdn.jsdelivr.net/npm/dompurify@3.2.6/dist/purify.min.js', 'DOMPurify'),
    loadExternalScript('https://cdn.jsdelivr.net/npm/html2pdf.js@0.10.2/dist/html2pdf.bundle.min.js', 'html2pdf')
  ]);
  const result = await mammoth.convertToHtml({ arrayBuffer: await file.arrayBuffer() });
  const page = document.createElement('article');
  page.className = 'docx-pdf-source';
  page.innerHTML = DOMPurify.sanitize(result.value);
  Object.assign(page.style, {
    width: '760px', padding: '56px',
    color: '#172b3a', background: '#ffffff', fontFamily: 'serif', fontSize: '16px', lineHeight: '1.8'
  });
  page.setAttribute('aria-hidden', 'true');
  page.querySelectorAll('img').forEach((image) => { image.style.maxWidth = '100%'; image.style.height = 'auto'; });
  document.body.append(page);
  try {
    const blob = await html2pdf().set({
      margin: [16, 16, 16, 16],
      image: { type: 'jpeg', quality: 0.96 },
      html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff' },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
      pagebreak: { mode: ['css', 'legacy'] }
    }).from(page).outputPdf('blob');
    const baseName = file.name.replace(/\.[^.]+$/, '') || '成员作品';
    return new File([blob], `${baseName}.pdf`, { type: 'application/pdf', lastModified: Date.now() });
  } finally {
    page.remove();
  }
}

async function loadPdfModule() {
  if (!pdfModulePromise) {
    pdfModulePromise = import('https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.min.mjs').then((pdfjs) => {
      pdfjs.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs';
      return pdfjs;
    });
  }
  return pdfModulePromise;
}

function updatePdfControls() {
  if (!readerPdf) return;
  $('#reader-page-label').textContent = `第 ${readerPageNumber} / ${readerPdf.numPages} 页`;
  $('#reader-zoom-label').textContent = `${Math.round(readerZoom * 100)}%`;
  $('#reader-prev').disabled = readerPageNumber <= 1;
  $('#reader-next').disabled = readerPageNumber >= readerPdf.numPages;
  $('#reader-zoom-out').disabled = readerZoom <= 0.5;
  $('#reader-zoom-in').disabled = readerZoom >= 3;
}

async function renderPdfPage(session = readerSession) {
  if (!readerPdf || session !== readerSession) return;
  const viewportElement = $('#reader-viewport');
  const stage = $('#reader-pdf-stage');
  const canvas = $('#reader-canvas');
  const status = $('#reader-status');
  status.hidden = false;
  status.textContent = `正在显示第 ${readerPageNumber} 页…`;
  readerRenderTask?.cancel();

  const page = await readerPdf.getPage(readerPageNumber);
  if (session !== readerSession) return;
  const naturalViewport = page.getViewport({ scale: 1 });
  const availableWidth = Math.max(280, viewportElement.clientWidth - Math.min(80, viewportElement.clientWidth * 0.08));
  const fitScale = availableWidth / naturalViewport.width;
  const pageViewport = page.getViewport({ scale: fitScale * readerZoom });
  const outputScale = Math.min(window.devicePixelRatio || 1, 2);
  const context = canvas.getContext('2d', { alpha: false });
  canvas.width = Math.floor(pageViewport.width * outputScale);
  canvas.height = Math.floor(pageViewport.height * outputScale);
  canvas.style.width = `${Math.floor(pageViewport.width)}px`;
  canvas.style.height = `${Math.floor(pageViewport.height)}px`;
  stage.hidden = false;

  readerRenderTask = page.render({
    canvasContext: context,
    viewport: pageViewport,
    transform: outputScale === 1 ? null : [outputScale, 0, 0, outputScale, 0, 0]
  });
  try {
    await readerRenderTask.promise;
    if (session !== readerSession) return;
    status.hidden = true;
    updatePdfControls();
    viewportElement.scrollTo({ top: 0, left: Math.max(0, (stage.scrollWidth - viewportElement.clientWidth) / 2) });
  } catch (error) {
    if (error?.name !== 'RenderingCancelledException') throw error;
  }
}

async function openPdf(url) {
  const session = readerSession;
  const pdfjs = await loadPdfModule();
  if (session !== readerSession) return;
  readerLoadingTask = pdfjs.getDocument({ url });
  readerPdf = await readerLoadingTask.promise;
  if (session !== readerSession) {
    readerPdf.destroy();
    return;
  }
  readerPageNumber = 1;
  readerZoom = 1;
  $('#reader-toolbar').hidden = false;
  await renderPdfPage(session);
}

async function openReader(url, title, mimeType) {
  const dialog = $('#reader-dialog');
  const documentView = $('#reader-document');
  const status = $('#reader-status');
  readerSession += 1;
  readerRenderTask?.cancel();
  readerLoadingTask?.destroy();
  readerPdf?.destroy();
  readerPdf = null;
  readerLoadingTask = null;
  $('#reader-title').textContent = title || '作品阅读器';
  $('#reader-open-original').href = url;
  $('#reader-toolbar').hidden = true;
  $('#reader-pdf-stage').hidden = true;
  documentView.hidden = true;
  documentView.replaceChildren();
  status.hidden = false;
  status.textContent = '正在加载…';
  if (!dialog.open) dialog.showModal();

  if (mimeType === 'application/pdf' || /\.pdf(?:$|[?#])/i.test(url)) {
    try {
      await openPdf(url);
    } catch (error) {
      status.textContent = 'PDF 加载失败，请使用“新窗口打开”。';
      console.error(error);
    }
    return;
  }

  if (mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || /\.docx(?:$|[?#])/i.test(url)) {
    try {
      const [mammoth, DOMPurify] = await Promise.all([
        loadExternalScript('https://cdn.jsdelivr.net/npm/mammoth@1.10.0/mammoth.browser.min.js', 'mammoth'),
        loadExternalScript('https://cdn.jsdelivr.net/npm/dompurify@3.2.6/dist/purify.min.js', 'DOMPurify')
      ]);
      const response = await fetch(url);
      if (!response.ok) throw new Error('Word 文件读取失败。');
      const arrayBuffer = await response.arrayBuffer();
      const result = await mammoth.convertToHtml({ arrayBuffer });
      documentView.innerHTML = DOMPurify.sanitize(result.value);
      documentView.hidden = false;
      status.hidden = true;
    } catch (error) {
      status.textContent = '浏览器暂时无法预览这个 Word 文件，请使用“新窗口打开”。';
      console.error(error);
    }
    return;
  }

  status.textContent = '旧版 DOC 文件暂不支持站内预览，请使用“新窗口打开”。';
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
    const username = String(form.get('username')).trim();
    await supabase.auth.signOut({ scope: 'local' });
    const { data, error } = await supabase.auth.signInWithPassword({
      email: await accountEmail(username),
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
    const username = String(form.get('username')).trim();
    await supabase.auth.signOut({ scope: 'local' });
    const { data, error } = await supabase.auth.signUp({
      email: await accountEmail(username),
      password: String(form.get('password')),
      options: {
        data: { username }
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
      showToast('账号尚未启用。请确认 Supabase 已关闭邮箱确认。', 'error', 6000);
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
  const feedbackButton = event.target.closest('[data-feedback-type]');
  if (feedbackButton) {
    openFeedback(feedbackButton.dataset.feedbackType, feedbackButton.dataset.feedbackId, feedbackButton.dataset.feedbackTitle)
      .catch((error) => showToast(readableError(error), 'error', 6000));
    return;
  }
  const readerLink = event.target.closest('[data-reader-url]');
  if (readerLink) {
    event.preventDefault();
    openReader(
      readerLink.dataset.readerUrl,
      readerLink.dataset.readerTitle || '作品阅读器',
      readerLink.dataset.readerMime || 'application/pdf'
    ).catch((error) => {
      console.error(error);
      showToast('阅读器打开失败，请使用“新窗口打开”。', 'error', 5000);
    });
    return;
  }
  const button = event.target.closest('[data-file-bucket]');
  if (!button) return;
  withBusy(button, () => openPrivateFile(button));
});

$('#feedback-stars').addEventListener('click', (event) => {
  const button = event.target.closest('[data-feedback-score]');
  if (!button || !activeFeedback || !requireRegistered()) return;
  withBusy(button, async () => {
    const { error } = await supabase.from('content_ratings').upsert({
      target_type: activeFeedback.type,
      target_id: activeFeedback.id,
      user_id: currentUser.id,
      score: Number(button.dataset.feedbackScore)
    }, { onConflict: 'target_type,target_id,user_id' });
    if (error) throw error;
    await refreshFeedback();
    showToast('评分已保存', 'success');
  });
});

$('#feedback-form').addEventListener('submit', (event) => {
  event.preventDefault();
  if (!activeFeedback || !requireRegistered()) return;
  const submit = event.currentTarget.querySelector('[type="submit"]');
  withBusy(submit, async () => {
    const body = $('#feedback-text').value.trim();
    if (!body) throw new Error('请先写下点评内容。');
    const { error } = await supabase.from('content_comments').insert({
      target_type: activeFeedback.type,
      target_id: activeFeedback.id,
      author_id: currentUser.id,
      display_name: memberProfile?.username || '社员',
      body
    });
    if (error) throw error;
    event.currentTarget.reset();
    await refreshFeedback();
    showToast('点评已发表', 'success');
  });
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

$('#article-search').addEventListener('input', renderIssueArticles);
$('#article-filters').addEventListener('click', (event) => {
  const button = event.target.closest('[data-article-filter]');
  if (!button) return;
  activeArticleFilter = button.dataset.articleFilter;
  $$('#article-filters .filter').forEach((item) => {
    const selected = item === button;
    item.classList.toggle('active', selected);
    item.setAttribute('aria-pressed', String(selected));
  });
  renderIssueArticles();
});

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
    const sourceFile = form.get('file');
    if (!(sourceFile instanceof File)) throw new Error('请选择作品文件。');
    if (sourceFile.size > 15728640) throw new Error('文件不能超过 15 MB。');
    const lowerName = sourceFile.name.toLowerCase();
    if (lowerName.endsWith('.doc')) throw new Error('旧版 DOC 无法稳定转换，请先在 Word 中另存为 DOCX。');
    const isPdf = sourceFile.type === 'application/pdf' || lowerName.endsWith('.pdf');
    const isDocx = sourceFile.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || lowerName.endsWith('.docx');
    if (!isPdf && !isDocx) throw new Error('只支持 PDF 或 DOCX 文件。');
    const file = isDocx ? await convertDocxToPdf(sourceFile) : sourceFile;
    if (file.size > 15728640) throw new Error('转换后的 PDF 超过 15 MB，请压缩图片后重试。');
    const filePath = `${currentUser.id}/${crypto.randomUUID()}.pdf`;
    showToast('正在上传 PDF…', 'info', 0);
    const { error: uploadError } = await supabase.storage.from('creations').upload(filePath, file, {
      contentType: 'application/pdf',
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
      mime_type: 'application/pdf',
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

$('#reader-prev').addEventListener('click', () => {
  if (!readerPdf || readerPageNumber <= 1) return;
  readerPageNumber -= 1;
  renderPdfPage().catch((error) => console.error(error));
});

$('#reader-next').addEventListener('click', () => {
  if (!readerPdf || readerPageNumber >= readerPdf.numPages) return;
  readerPageNumber += 1;
  renderPdfPage().catch((error) => console.error(error));
});

$('#reader-zoom-out').addEventListener('click', () => {
  readerZoom = Math.max(0.5, readerZoom - 0.25);
  renderPdfPage().catch((error) => console.error(error));
});

$('#reader-zoom-in').addEventListener('click', () => {
  readerZoom = Math.min(3, readerZoom + 0.25);
  renderPdfPage().catch((error) => console.error(error));
});

$('#reader-fit').addEventListener('click', () => {
  readerZoom = 1;
  renderPdfPage().catch((error) => console.error(error));
});

document.addEventListener('keydown', (event) => {
  if (!$('#reader-dialog').open || !readerPdf) return;
  if (event.key === 'ArrowLeft') $('#reader-prev').click();
  if (event.key === 'ArrowRight') $('#reader-next').click();
});

window.addEventListener('resize', () => {
  clearTimeout(readerResizeTimer);
  readerResizeTimer = setTimeout(() => {
    if ($('#reader-dialog').open && readerPdf) renderPdfPage().catch((error) => console.error(error));
  }, 180);
});

$('#reader-dialog').addEventListener('close', () => {
  readerSession += 1;
  readerRenderTask?.cancel();
  readerLoadingTask?.destroy();
  readerPdf?.destroy();
  readerRenderTask = null;
  readerLoadingTask = null;
  readerPdf = null;
  const canvas = $('#reader-canvas');
  canvas.width = 0;
  canvas.height = 0;
  $('#reader-toolbar').hidden = true;
  $('#reader-pdf-stage').hidden = true;
  $('#reader-document').replaceChildren();
  $('#reader-document').hidden = true;
  $('#reader-status').hidden = false;
  $('#reader-status').textContent = '正在加载…';
  $('#reader-open-original').href = '#';
});

$('#feedback-dialog').addEventListener('close', () => {
  activeFeedback = null;
  $('#feedback-form').reset();
});

function subscribeToChanges() {
  supabase.channel('dongnanfeng-library')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'books' }, scheduleRefresh)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'comments' }, scheduleRefresh)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'votes' }, scheduleRefresh)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'ratings' }, scheduleRefresh)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'events' }, () => loadEvents().catch((error) => console.error(error)))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'magazine_issues' }, () => loadMagazines().catch((error) => console.error(error)))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'creations' }, () => loadCreations().catch((error) => console.error(error)))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'content_comments' }, () => {
      if (activeFeedback) refreshFeedback().catch((error) => console.error(error));
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'content_ratings' }, () => {
      if (activeFeedback) refreshFeedback().catch((error) => console.error(error));
    })
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
    await loadIssueArticles();
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
