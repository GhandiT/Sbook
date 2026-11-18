/* site made by A.t */
(function () {
  'use strict';

  /* ───────────── Config ───────────── */
  var API = 'https://openlibrary.org';
  var COVERS = 'https://covers.openlibrary.org/b/id/';
  var CACHE_KEY = 'saraland:books:v1';
  var CACHE_TTL = 14 * 24 * 60 * 60 * 1000; // 14 days
  var CONCURRENCY = 4;
  var MAX_BOOKS = 500;

  var $ = function (sel) { return document.querySelector(sel); };
  var root = document.documentElement;

  /* ───────────── Small helpers ───────────── */
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function str(v) { return typeof v === 'string' ? v : ''; }
  function norm(s) { return String(s).toLowerCase().replace(/[^a-z0-9]+/g, ''); }
  function hash(s) { var h = 0; for (var i = 0; i < s.length; i++) { h = (h * 31 + s.charCodeAt(i)) | 0; } return Math.abs(h); }
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  /* ───────────── Theme ───────────── */
  var themeBtn = $('#themeToggle');
  var themeMeta = document.querySelector('meta[name="theme-color"]');
  var THEME_COLORS = { light: '#f7eddd', dark: '#0e1320' };

  function applyTheme(theme, persist) {
    root.setAttribute('data-theme', theme);
    if (themeMeta) themeMeta.setAttribute('content', THEME_COLORS[theme]);
    themeBtn.setAttribute('aria-label', theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode');
    if (persist) { try { localStorage.setItem('saraland:theme', theme); } catch (e) {} }
  }
  applyTheme(root.getAttribute('data-theme') === 'dark' ? 'dark' : 'light', false);
  themeBtn.addEventListener('click', function () {
    applyTheme(root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark', true);
  });
  if (window.matchMedia) {
    var mq = window.matchMedia('(prefers-color-scheme: dark)');
    var onSystem = function (e) {
      var saved = null;
      try { saved = localStorage.getItem('saraland:theme'); } catch (err) {}
      if (!saved) applyTheme(e.matches ? 'dark' : 'light', false);
    };
    if (mq.addEventListener) mq.addEventListener('change', onSystem);
  }

  /* ───────────── Cache ───────────── */
  var cache = {};
  try { cache = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}') || {}; } catch (e) { cache = {}; }
  function saveCache() {
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(cache)); } catch (e) {}
  }

  /* ───────────── Network ───────────── */
  async function fetchJSON(url, retries) {
    retries = retries == null ? 1 : retries;
    for (var attempt = 0; attempt <= retries; attempt++) {
      var ctl = new AbortController();
      var timer = setTimeout(function () { ctl.abort(); }, 12000);
      try {
        var res = await fetch(url, { signal: ctl.signal, headers: { Accept: 'application/json' } });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return await res.json();
      } catch (err) {
        if (attempt === retries) throw err;
        await sleep(700 * (attempt + 1));
      } finally {
        clearTimeout(timer);
      }
    }
  }

  /* ───────────── books.txt ───────────── */
  // One book per line. Optional author after "|" to improve matching:  Title | Author
  // Lines starting with # are ignored.
  function parseBooks(text) {
    var seen = {};
    var out = [];
    text.replace(/^﻿/, '').split(/\r?\n/).forEach(function (line) {
      line = line.trim();
      if (!line || line.charAt(0) === '#') return;
      var parts = line.split('|');
      var title = parts[0].trim().slice(0, 200);
      var author = (parts[1] || '').trim().slice(0, 120);
      if (!title) return;
      var key = (title + '|' + author).toLowerCase();
      if (seen[key]) return;
      seen[key] = true;
      out.push({ key: key, title: title, author: author });
    });
    return out.slice(0, MAX_BOOKS);
  }

  /* ───────────── Open Library ───────────── */
  async function lookup(entry) {
    var hit = cache[entry.key];
    if (hit && Date.now() - hit.t < CACHE_TTL) return hit.data;

    var params = new URLSearchParams({
      title: entry.title,
      limit: '6',
      fields: 'key,title,author_name,cover_i,first_publish_year,first_sentence'
    });
    if (entry.author) params.set('author', entry.author);

    var json = await fetchJSON(API + '/search.json?' + params.toString());
    var docs = json && Array.isArray(json.docs) ? json.docs : [];
    var pick = docs[0];
    if (pick && !pick.cover_i) {
      var wanted = norm(entry.title);
      var alt = docs.find(function (d) { return d.cover_i && norm(str(d.title)) === wanted; });
      if (alt) pick = alt;
    }

    var data;
    if (pick) {
      var fs = Array.isArray(pick.first_sentence) ? pick.first_sentence[0] : pick.first_sentence;
      data = {
        found: true,
        title: str(pick.title) || entry.title,
        author: Array.isArray(pick.author_name) ? pick.author_name.slice(0, 3).map(str).join(', ') : '',
        coverId: Number.isInteger(pick.cover_i) ? pick.cover_i : null,
        year: Number.isInteger(pick.first_publish_year) ? pick.first_publish_year : null,
        workKey: /^\/works\/OL\d+W$/.test(str(pick.key)) ? pick.key : null,
        firstSentence: str(fs)
      };
    } else {
      data = { found: false, title: entry.title, author: entry.author, coverId: null, year: null, workKey: null, firstSentence: '' };
    }
    cache[entry.key] = { t: Date.now(), data: data };
    saveCache();
    return data;
  }

  function cleanDescription(t) {
    if (!t) return '';
    t = t.replace(/\r/g, '');
    t = t.split(/\n\s*-{3,}|\n\s*\*{3,}/)[0];                 // drop "source" sections
    t = t.replace(/\(\[source\]\[\d+\]\)/gi, '')
         .replace(/^\s*\[\d+\]:.*$/gm, '')
         .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
         .replace(/\[([^\]]+)\]\[\d+\]/g, '$1')
         .replace(/(\*\*|__)(.+?)\1/g, '$2')
         .replace(/(\*|_)(.+?)\1/g, '$2')
         .replace(/\n{3,}/g, '\n\n')
         .trim();
    if (t.length > 1400) t = t.slice(0, 1400).replace(/\s+\S*$/, '') + '…';
    return t;
  }

  async function ensureDescription(book) {
    var d = book.data;
    if (typeof d.description === 'string') return d.description;
    var text = '';
    var failed = false;
    if (d.workKey) {
      try {
        var work = await fetchJSON(API + d.workKey + '.json');
        var raw = work && work.description;
        text = typeof raw === 'string' ? raw : (raw && typeof raw.value === 'string' ? raw.value : '');
      } catch (e) { failed = true; }
    }
    text = cleanDescription(text) || d.firstSentence || '';
    if (!text) text = failed ? '' : 'No description is available for this book yet.';
    if (!failed) {
      d.description = text;
      var c = cache[book.entry.key];
      if (c) { c.data = d; saveCache(); }
    }
    return text || 'Could not load the description right now. Please try again in a moment.';
  }

  /* ───────────── Covers ───────────── */
  function placeholder(title) {
    var ph = el('div', 'ph ph-' + (hash(title) % 6));
    ph.appendChild(el('span', '', title));
    return ph;
  }

  function coverImage(coverId, size, alt, onFail) {
    var img = new Image();
    img.alt = alt;
    img.decoding = 'async';
    img.referrerPolicy = 'no-referrer';
    img.addEventListener('load', function () { img.classList.add('loaded'); });
    img.addEventListener('error', onFail);
    img.src = COVERS + coverId + '-' + size + '.jpg?default=false';
    return img;
  }

  /* ───────────── Grid ───────────── */
  var grid = $('#grid');
  var statusEl = $('#status');
  var countEl = $('#count');
  var books = [];

  function createCard(entry, index) {
    var li = el('li');
    li.style.setProperty('--i', String(Math.min(index, 14)));
    var btn = el('button', 'card');
    btn.type = 'button';
    var cover = el('div', 'cover skeleton');
    var title = el('span', 'card-title', entry.title);
    btn.appendChild(cover);
    btn.appendChild(title);
    li.appendChild(btn);
    var book = { entry: entry, data: null, li: li, btn: btn, cover: cover, titleEl: title, haystack: entry.title.toLowerCase() };
    btn.addEventListener('click', function () { openModal(book); });
    return book;
  }

  function fillCard(book) {
    var d = book.data;
    book.cover.classList.remove('skeleton');
    book.titleEl.textContent = d.title;
    book.haystack = (d.title + ' ' + d.author + ' ' + book.entry.title).toLowerCase();
    book.btn.setAttribute('aria-label', d.title + (d.author ? ', by ' + d.author : ''));
    book.cover.textContent = '';
    if (d.coverId) {
      book.cover.appendChild(coverImage(d.coverId, 'M', 'Cover of ' + d.title, function () {
        book.cover.textContent = '';
        book.cover.appendChild(placeholder(d.title));
      }));
    } else {
      book.cover.appendChild(placeholder(d.title));
    }
  }

  async function loadBook(book) {
    try {
      book.data = await lookup(book.entry);
    } catch (e) {
      book.data = { found: false, failed: true, title: book.entry.title, author: book.entry.author, coverId: null, year: null, workKey: null, firstSentence: '' };
    }
    fillCard(book);
  }

  async function runPool(items, worker, n) {
    var i = 0;
    var runners = [];
    for (var k = 0; k < Math.min(n, items.length); k++) {
      runners.push((async function () {
        while (i < items.length) { var idx = i++; await worker(items[idx]); }
      })());
    }
    await Promise.all(runners);
  }

  function updateCount() {
    var total = books.length;
    if (!total) { countEl.textContent = ''; return; }
    var visible = books.filter(function (b) { return !b.li.hidden; }).length;
    var word = total === 1 ? 'book' : 'books';
    countEl.textContent = visible === total ? total + ' ' + word : visible + ' of ' + total + ' ' + word;
  }

  function applyFilter() {
    var q = searchInput.value.trim().toLowerCase();
    var shown = 0;
    books.forEach(function (b) {
      var match = !q || b.haystack.indexOf(q) !== -1;
      b.li.hidden = !match;
      if (match) shown++;
    });
    statusEl.textContent = books.length && !shown ? 'No books on the shelf match your search.' : '';
    updateCount();
  }

  var searchInput = $('#search');
  searchInput.addEventListener('input', applyFilter);

  async function init() {
    var entries = [];
    statusEl.textContent = 'Opening the shelf…';
    try {
      var res = await fetch('books.txt', { cache: 'no-cache' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      entries = parseBooks(await res.text());
    } catch (e) {
      statusEl.textContent = 'Could not read books.txt. If you opened index.html directly from a folder, please use a local web server or GitHub Pages.';
      return;
    }
    if (!entries.length) {
      statusEl.textContent = 'The shelf is waiting for its first story. Add English book titles to books.txt, one per line.';
      return;
    }
    statusEl.textContent = '';
    books = entries.map(createCard);
    var frag = document.createDocumentFragment();
    books.forEach(function (b) { frag.appendChild(b.li); });
    grid.appendChild(frag);
    updateCount();
    await runPool(books, loadBook, CONCURRENCY);
    applyFilter();
  }

  /* ───────────── Modal ───────────── */
  var modal = $('#modal');
  var mCover = $('#mCover');
  var mYear = $('#mYear');
  var mTitle = $('#mTitle');
  var mAuthor = $('#mAuthor');
  var mDesc = $('#mDesc');
  var mLink = $('#mLink');
  var openToken = 0;

  async function openModal(book) {
    var d = book.data;
    if (!d) return; // still loading
    var token = ++openToken;

    mTitle.textContent = d.title;
    mAuthor.textContent = d.author ? 'by ' + d.author : '';
    mYear.textContent = d.year ? 'First published ' + d.year : '';
    mCover.textContent = '';
    if (d.coverId) {
      mCover.appendChild(coverImage(d.coverId, 'L', 'Cover of ' + d.title, function () {
        mCover.textContent = '';
        mCover.appendChild(placeholder(d.title));
      }));
    } else {
      mCover.appendChild(placeholder(d.title));
    }
    if (d.workKey) {
      mLink.href = API + d.workKey;
      mLink.hidden = false;
    } else {
      mLink.hidden = true;
    }

    mDesc.className = 'm-desc is-loading';
    mDesc.textContent = 'Opening the book…';
    mDesc.scrollTop = 0;

    root.classList.add('modal-open');
    if (!modal.open) modal.showModal();

    var text = await ensureDescription(book);
    if (token !== openToken) return;
    mDesc.className = 'm-desc';
    mDesc.textContent = text;
  }

  function closeModal() { if (modal.open) modal.close(); }
  modal.addEventListener('close', function () { root.classList.remove('modal-open'); openToken++; });
  modal.addEventListener('click', function (e) { if (e.target === modal) closeModal(); });
  $('#mClose').addEventListener('click', closeModal);

  /* ───────────── Falling leaves ───────────── */
  function initLeaves() {
    var canvas = $('#leaves');
    if (!canvas || !canvas.getContext) return;
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    var ctx = canvas.getContext('2d');
    if (!ctx) return;

    var colors = ['#c4561c', '#e59a2e', '#d9772b', '#a8431a', '#b9893a', '#8c9a4b'];
    var w = 0, h = 0, leaves = [], raf = 0, last = 0, resizeTimer = 0;

    function make(anywhere) {
      return {
        x: Math.random() * w,
        y: anywhere ? Math.random() * h : -24,
        s: 8 + Math.random() * 10,
        r: Math.random() * 6.28,
        vr: (Math.random() - .5) * 1.3,
        vy: 16 + Math.random() * 26,
        sw: Math.random() * 6.28,
        sa: 14 + Math.random() * 26,
        sf: .4 + Math.random() * .7,
        c: colors[(Math.random() * colors.length) | 0],
        a: .4 + Math.random() * .4
      };
    }

    function resize() {
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = window.innerWidth; h = window.innerHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      var n = w < 700 ? 11 : 18;
      while (leaves.length < n) leaves.push(make(true));
      leaves.length = n;
    }

    function draw(l) {
      ctx.save();
      ctx.translate(l.x, l.y);
      ctx.rotate(l.r);
      ctx.globalAlpha = l.a;
      ctx.fillStyle = l.c;
      ctx.beginPath();
      ctx.moveTo(0, -l.s);
      ctx.bezierCurveTo(l.s * .9, -l.s * .5, l.s * .7, l.s * .6, 0, l.s);
      ctx.bezierCurveTo(-l.s * .7, l.s * .6, -l.s * .9, -l.s * .5, 0, -l.s);
      ctx.fill();
      ctx.globalAlpha = l.a * .6;
      ctx.strokeStyle = 'rgba(60,25,5,.6)';
      ctx.lineWidth = .8;
      ctx.beginPath();
      ctx.moveTo(0, -l.s);
      ctx.lineTo(0, l.s * 1.1);
      ctx.stroke();
      ctx.restore();
    }

    function frame(t) {
      var dt = Math.min(((t - last) / 1000) || 0, .05);
      last = t;
      ctx.clearRect(0, 0, w, h);
      for (var i = 0; i < leaves.length; i++) {
        var l = leaves[i];
        l.sw += l.sf * dt;
        l.x += Math.sin(l.sw) * l.sa * dt + 8 * dt;
        l.y += l.vy * dt;
        l.r += l.vr * dt;
        if (l.y > h + 30 || l.x > w + 40) leaves[i] = l = make(false);
        draw(l);
      }
      raf = requestAnimationFrame(frame);
    }

    resize();
    raf = requestAnimationFrame(frame);
    window.addEventListener('resize', function () { clearTimeout(resizeTimer); resizeTimer = setTimeout(resize, 150); });
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) { cancelAnimationFrame(raf); }
      else { last = performance.now(); raf = requestAnimationFrame(frame); }
    });
  }

  /* ───────────── Go ───────────── */
  initLeaves();
  init();
})();
