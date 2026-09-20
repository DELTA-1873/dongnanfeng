const STORAGE_KEY = 'dongnanfeng-library-v1';
const COLORS = new Set(['blue', 'red', 'green', 'gold', 'black']);

const seedBooks = [
  { id: 'migratory-letter', title: '候鸟没有寄回的信', author: '林屿', genre: '小说', issue: '第 24 期 · 2026 秋', color: 'blue', summary: '那年九月，整座城都在等一场台风。只有我知道，真正要离开的并不是夏天。一封迟到多年的信，让两个在海边长大的年轻人重新面对告别与故乡。', votes: 86, baseRating: 4.7, baseRatings: 42, createdAt: '2026-09-18', comments: [{ name: '南枝', text: '结尾像潮水退去以后留在沙滩上的光，很安静，也很有力量。', date: '2026-09-19' }] },
  { id: 'tide-etude', title: '潮汐练习曲', author: '周见山', genre: '诗歌', issue: '第 24 期 · 2026 秋', color: 'red', summary: '十二首关于海、离别与重逢的短诗。诗人把潮汐当作时间的另一副面孔，在反复抵达与离去之间，辨认生活留下的微光。', votes: 64, baseRating: 4.8, baseRatings: 36, createdAt: '2026-09-16', comments: [] },
  { id: 'night-train', title: '夜车经过旧城', author: '陈未晚', genre: '散文', issue: '第 23 期 · 2026 春', color: 'green', summary: '车窗像一卷缓慢展开的胶片，收藏沿途每一盏未眠的灯。作者从一趟夜车出发，写下记忆中的旧街、家人和不断改变的城市。', votes: 51, baseRating: 4.5, baseRatings: 29, createdAt: '2026-05-20', comments: [{ name: '纸鸢', text: '读完很想坐一次没有目的地的慢车。', date: '2026-09-02' }] },
  { id: 'spring-translation', title: '春天的另一种译法', author: '许南枝', genre: '诗歌', issue: '第 23 期 · 2026 春', color: 'gold', summary: '我们把新叶叫作重逢，把雨声叫作尚未说完。这组诗尝试翻译春天，也翻译成长中那些无法直接说出的情绪。', votes: 73, baseRating: 4.6, baseRatings: 31, createdAt: '2026-05-12', comments: [] },
  { id: 'island-bookshop', title: '岛屿书店', author: '唐砚', genre: '小说', issue: '第 22 期 · 2025 冬', color: 'black', summary: '一间只在退潮后开门的书店，替岛上的人保管未曾寄出的故事。年轻的店员逐渐发现，书架上也藏着属于自己的那一本。', votes: 92, baseRating: 4.9, baseRatings: 55, createdAt: '2025-12-08', comments: [{ name: '鹭川', text: '设定很迷人，读完仍然记得那间书店的气味。', date: '2026-01-11' }] },
  { id: 'south-window', title: '南窗手记', author: '闻舟', genre: '散文', issue: '第 22 期 · 2025 冬', color: 'blue', summary: '从宿舍朝南的窗口望出去，是操场、树梢和四年里不断迁徙的云。二十篇短章，记录一段校园生活中容易被忽略的时刻。', votes: 47, baseRating: 4.4, baseRatings: 25, createdAt: '2025-12-01', comments: [] }
];

const loadBooks = () => {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return Array.isArray(stored) && stored.length ? stored : structuredClone(seedBooks);
  } catch {
    return structuredClone(seedBooks);
  }
};

let books = loadBooks();
let selectedBookId = null;
let activeFilter = 'all';

const $ = (selector, scope = document) => scope.querySelector(selector);
const $$ = (selector, scope = document) => [...scope.querySelectorAll(selector)];
const escapeHtml = (value = '') => String(value).replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
const safeColor = (color) => COLORS.has(color) ? color : 'blue';
const saveBooks = () => localStorage.setItem(STORAGE_KEY, JSON.stringify(books));
const ratingFor = (book) => {
  const userCount = book.userRating ? 1 : 0;
  const count = (book.baseRatings || 0) + userCount;
  if (!count) return { average: 0, count: 0 };
  return { average: (((book.baseRating || 0) * (book.baseRatings || 0)) + (book.userRating || 0)) / count, count };
};
const votesFor = (book) => (book.votes || 0) + (book.userVoted ? 1 : 0);
const coverMarkup = (book) => `
  <span class="cover-series">东南风 · ${escapeHtml(book.genre)}</span>
  <span class="cover-title">${escapeHtml(book.title)}</span>
  <span class="cover-author">${escapeHtml(book.author)} 著</span>`;

function renderCatalog() {
  const term = $('#catalog-search').value.trim().toLowerCase();
  const sort = $('#catalog-sort').value;
  const matches = books.filter((book) => {
    const filterMatch = activeFilter === 'all' || (activeFilter === '自建' ? book.custom : book.genre === activeFilter);
    const haystack = `${book.title} ${book.author} ${book.summary}`.toLowerCase();
    return filterMatch && haystack.includes(term);
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
    return `<article class="book-card">
      <button class="book-cover-button" type="button" data-book-id="${escapeHtml(book.id)}" aria-label="查看《${escapeHtml(book.title)}》详情">
        <span class="book-cover" data-color="${safeColor(book.color)}">${coverMarkup(book)}</span>
      </button>
      <div class="book-info">
        <h3 title="${escapeHtml(book.title)}">${escapeHtml(book.title)}</h3>
        <p>${escapeHtml(book.author)} · ${escapeHtml(book.genre)}${book.custom ? ' · 自建' : ''}</p>
        <div class="book-stats"><span class="score">★ ${rating.count ? rating.average.toFixed(1) : '暂无'}</span><span>△ ${votesFor(book)} 票 · ${book.comments?.length || 0} 评</span></div>
      </div>
    </article>`;
  }).join('');
}

function openBook(id) {
  const book = books.find((item) => item.id === id);
  if (!book) return;
  selectedBookId = id;
  $('#detail-cover').dataset.color = safeColor(book.color);
  $('#detail-cover').innerHTML = coverMarkup(book);
  $('#detail-meta').textContent = `${book.genre} · ${book.author} · ${book.issue || '独立书目'}${book.custom ? ' · 我的条目' : ''}`;
  $('#detail-title').textContent = book.title;
  $('#detail-summary').textContent = book.summary;
  renderVotes(book);
  renderRating(book);
  renderComments(book);
  $('#book-dialog').showModal();
}

function renderVotes(book) {
  $('#detail-votes').textContent = votesFor(book);
  $('#vote-button').setAttribute('aria-pressed', String(Boolean(book.userVoted)));
  $('#vote-button').firstChild.textContent = book.userVoted ? '▽' : '△';
}

function renderRating(book) {
  const rating = ratingFor(book);
  $('#rating-average').textContent = rating.count ? rating.average.toFixed(1) : '—';
  $('#rating-count').textContent = rating.count ? `${rating.count} 人评分` : '暂无评分';
  $('#rating-stars').innerHTML = [1, 2, 3, 4, 5].map((score) => `<button class="star ${score <= (book.userRating || 0) ? 'selected' : ''}" type="button" data-score="${score}" aria-label="评 ${score} 星" aria-pressed="${score === book.userRating}">★</button>`).join('');
}

function renderComments(book) {
  const comments = book.comments || [];
  $('#comments-count').textContent = `${comments.length} 条`;
  $('#comment-list').innerHTML = comments.length ? [...comments].reverse().map((comment) => `<article class="comment"><header><strong>${escapeHtml(comment.name)}</strong><time>${escapeHtml(comment.date)}</time></header><p>${escapeHtml(comment.text)}</p></article>`).join('') : '<p class="comment-empty">还没有评论，来写下第一条阅读感受吧。</p>';
}

function closeDialog(dialog) {
  if (dialog?.open) dialog.close();
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

$('#vote-button').addEventListener('click', () => {
  const book = books.find((item) => item.id === selectedBookId);
  if (!book) return;
  book.userVoted = !book.userVoted;
  saveBooks();
  renderVotes(book);
  renderCatalog();
});

$('#rating-stars').addEventListener('click', (event) => {
  const button = event.target.closest('[data-score]');
  const book = books.find((item) => item.id === selectedBookId);
  if (!button || !book) return;
  book.userRating = Number(button.dataset.score);
  saveBooks();
  renderRating(book);
  renderCatalog();
});

$('#comment-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const book = books.find((item) => item.id === selectedBookId);
  if (!book) return;
  const name = $('#comment-name').value.trim();
  const text = $('#comment-text').value.trim();
  if (!name || !text) return;
  book.comments ||= [];
  book.comments.push({ name, text, date: new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium' }).format(new Date()) });
  saveBooks();
  event.currentTarget.reset();
  renderComments(book);
  renderCatalog();
});

$('#open-create').addEventListener('click', () => {
  $('#create-form').reset();
  updateCreatePreview();
  $('#create-dialog').showModal();
  setTimeout(() => $('#create-title-input').focus(), 50);
});

function updateCreatePreview() {
  const form = $('#create-form');
  const title = $('#create-title-input').value.trim() || '你的书名';
  const author = $('[name="author"]', form).value.trim() || '作者';
  const genre = $('[name="genre"]', form).value;
  const preview = $('#create-cover-preview');
  preview.dataset.color = safeColor($('#create-color').value);
  preview.innerHTML = coverMarkup({ title, author, genre });
}

$('#create-form').addEventListener('input', updateCreatePreview);
$('#create-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  const book = {
    id: crypto.randomUUID ? crypto.randomUUID() : `custom-${Date.now()}`,
    title: String(data.get('title')).trim(),
    author: String(data.get('author')).trim(),
    genre: String(data.get('genre')),
    issue: String(data.get('issue')).trim(),
    color: safeColor(String(data.get('color'))),
    summary: String(data.get('summary')).trim(),
    votes: 0,
    baseRating: 0,
    baseRatings: 0,
    createdAt: new Date().toISOString(),
    comments: [],
    custom: true
  };
  books.unshift(book);
  saveBooks();
  closeDialog($('#create-dialog'));
  activeFilter = 'all';
  $$('#catalog-filters .filter').forEach((item) => {
    const selected = item.dataset.filter === 'all';
    item.classList.toggle('active', selected);
    item.setAttribute('aria-pressed', String(selected));
  });
  $('#catalog-search').value = '';
  renderCatalog();
  openBook(book.id);
});

$$('[data-close]').forEach((button) => button.addEventListener('click', () => closeDialog($(`#${button.dataset.close}`))));
$$('dialog').forEach((dialog) => dialog.addEventListener('click', (event) => {
  if (event.target === dialog) closeDialog(dialog);
}));

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
renderCatalog();
