(function () {
  'use strict';

  /* ---------------------------------------------------------------- */
  /* State                                                             */
  /* ---------------------------------------------------------------- */
  let catalog         = null;
  let lang            = 'es';
  let currentBookId   = null;
  let currentChIdx    = -1;
  let isSeeking       = false;

  /* ---------------------------------------------------------------- */
  /* i18n                                                              */
  /* ---------------------------------------------------------------- */
  const strings = {
    es: {
      narratorLabel:  'Narrado por',
      libraryTitle:   'Narraciones',
      librarySub:     'Audiolibros narrados por Jorge Correa',
      back:           '← Biblioteca',
      chaptersLabel:  'Capítulos',
      loadingMsg:     'Cargando catálogo…',
      errorMsg:       'No se pudo cargar el catálogo. Verifica la consola para más detalles.',
      noLinkAlert:    'Este capítulo no tiene un enlace de audio aún. Pega la URL de OneDrive en catalog.json.',
      recorded:       'Grabado',
      chapCount:      n => n === 1 ? '1 capítulo' : `${n} capítulos`,
    },
    en: {
      narratorLabel:  'Narrated by',
      libraryTitle:   'Recordings',
      librarySub:     'Audiobooks narrated by Jorge Correa',
      back:           '← Library',
      chaptersLabel:  'Chapters',
      loadingMsg:     'Loading catalog…',
      errorMsg:       'Could not load catalog. Check the console for details.',
      noLinkAlert:    'This chapter has no audio link yet. Paste the OneDrive URL into catalog.json.',
      recorded:       'Recorded',
      chapCount:      n => n === 1 ? '1 chapter' : `${n} chapters`,
    },
  };

  function t(key, ...args) {
    const val = strings[lang][key];
    return typeof val === 'function' ? val(...args) : (val ?? key);
  }

  /* ---------------------------------------------------------------- */
  /* DOM refs                                                          */
  /* ---------------------------------------------------------------- */
  const app               = document.getElementById('app');
  const playerBar         = document.getElementById('playerBar');
  const audioEl           = document.getElementById('audioEl');
  const btnPlay           = document.getElementById('btnPlay');
  const btnRewind         = document.getElementById('btnRewind');
  const btnForward        = document.getElementById('btnForward');
  const scrubber          = document.getElementById('scrubber');
  const timeCurrent       = document.getElementById('timeCurrent');
  const timeTotal         = document.getElementById('timeTotal');
  const playerBookTitle   = document.getElementById('playerBookTitle');
  const playerChapTitle   = document.getElementById('playerChapterTitle');
  const langToggle        = document.getElementById('langToggle');
  const narratorLabel     = document.getElementById('narratorLabel');

  /* ---------------------------------------------------------------- */
  /* Helpers                                                           */
  /* ---------------------------------------------------------------- */
  function toStreamURL(url) {
    if (!url || url.startsWith('PASTE_')) return null;
    // Route through /api/audio so the server can attach a fresh pre-auth token.
    // btoa produces standard base64; encodeURIComponent escapes +/= for the URL.
    return '/api/audio?u=' + encodeURIComponent(btoa(url));
  }

  function formatTime(sec) {
    if (!isFinite(sec) || isNaN(sec)) return '0:00';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${String(s).padStart(2, '0')}`;
  }

  function getBook(id) {
    return catalog.books.find(b => b.id === id) || null;
  }

  function setScrubberFill(pct) {
    scrubber.style.background =
      `linear-gradient(to right, #8B3A20 ${pct}%, rgba(255,255,255,0.18) ${pct}%)`;
  }

  /* ---------------------------------------------------------------- */
  /* Language                                                          */
  /* ---------------------------------------------------------------- */
  function setLang(l) {
    lang = l;
    document.documentElement.lang = l;
    langToggle.textContent  = l === 'es' ? 'EN' : 'ES';
    narratorLabel.textContent = t('narratorLabel');

    if (currentBookId && app.querySelector('.btn-back')) {
      renderDetail(currentBookId, false);
    } else {
      renderLibrary();
    }

    if (currentBookId && currentChIdx >= 0) updatePlayerInfo();
  }

  /* ---------------------------------------------------------------- */
  /* Library                                                           */
  /* ---------------------------------------------------------------- */
  function renderLibrary() {
    currentBookId = null;

    app.innerHTML = `
      <h1 class="library-heading">${t('libraryTitle')}</h1>
      <p class="library-sub">${t('librarySub')}</p>
      <div class="book-grid">
        ${catalog.books.map(bookCardHTML).join('')}
      </div>`;

    app.querySelectorAll('.book-card').forEach(card => {
      card.addEventListener('click', () => renderDetail(card.dataset.id));
      card.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          renderDetail(card.dataset.id);
        }
      });
    });
  }

  function bookCardHTML(book) {
    return `
      <div class="book-card" data-id="${book.id}" role="button" tabindex="0"
           aria-label="${esc(book.title)}">
        <div class="book-cover" style="--cover-color:${book.cover_color}">
          <div class="book-cover-title">${esc(book.title)}</div>
          <div class="book-cover-author">${esc(book.author)}</div>
        </div>
        <div class="book-card-meta">
          <span>${t('chapCount', book.chapters.length)}</span>
          <span>${book.language.toUpperCase()}</span>
        </div>
      </div>`;
  }

  /* ---------------------------------------------------------------- */
  /* Detail                                                            */
  /* ---------------------------------------------------------------- */
  function renderDetail(bookId, scrollTop = true) {
    currentBookId = bookId;
    const book = getBook(bookId);
    if (!book) return;

    const desc = (lang === 'en' && book.description_en) ? book.description_en : book.description;

    const chaptersHTML = book.chapters.map((ch, i) => {
      const chTitle  = (lang === 'en' && ch.title_en) ? ch.title_en : ch.title;
      const isActive = (currentChIdx === i);
      return `
        <li class="chapter-item${isActive ? ' active' : ''}"
            data-index="${i}" role="button" tabindex="0">
          <span class="chapter-num">${i + 1}</span>
          <div class="chapter-info">
            <div class="chapter-title">${esc(chTitle)}</div>
            <div class="chapter-recorded">${t('recorded')}: ${ch.recorded || '—'}</div>
          </div>
          <span class="chapter-duration">${ch.duration || ''}</span>
          ${isActive ? playingIconHTML() : '<span style="width:18px;flex-shrink:0"></span>'}
        </li>`;
    }).join('');

    app.innerHTML = `
      <button class="btn-back" id="btnBack">${t('back')}</button>
      <div class="detail-header">
        <div class="detail-cover" style="background:${book.cover_color}"></div>
        <div class="detail-meta">
          <div class="detail-author">${esc(book.author)}</div>
          <h2 class="detail-title">${esc(book.title)}</h2>
          <p class="detail-description">${esc(desc)}</p>
        </div>
      </div>
      <div class="chapters-label">${t('chaptersLabel')}</div>
      <ul class="chapter-list">${chaptersHTML}</ul>`;

    if (scrollTop) window.scrollTo({ top: 0, behavior: 'smooth' });

    document.getElementById('btnBack').addEventListener('click', renderLibrary);

    app.querySelectorAll('.chapter-item').forEach(item => {
      const activate = () => loadChapter(bookId, parseInt(item.dataset.index, 10));
      item.addEventListener('click', activate);
      item.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); activate(); }
      });
    });
  }

  function playingIconHTML() {
    return `
      <span class="chapter-playing">
        <svg viewBox="0 0 18 18" fill="currentColor" width="16" height="16" aria-hidden="true">
          <rect class="bar1" x="1"  y="4" width="4" height="10" rx="1"/>
          <rect class="bar2" x="7"  y="4" width="4" height="10" rx="1"/>
          <rect class="bar3" x="13" y="4" width="4" height="10" rx="1"/>
        </svg>
      </span>`;
  }

  /* safe HTML escape */
  function esc(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /* ---------------------------------------------------------------- */
  /* Audio / player                                                    */
  /* ---------------------------------------------------------------- */
  function loadChapter(bookId, chIdx) {
    const book = getBook(bookId);
    if (!book) return;
    const ch = book.chapters[chIdx];
    if (!ch) return;

    const url = toStreamURL(ch.onedrive_url);
    if (!url) {
      alert(t('noLinkAlert'));
      return;
    }

    currentBookId = bookId;
    currentChIdx  = chIdx;

    audioEl.src = url;
    audioEl.load();
    audioEl.play().catch(err => console.warn('Autoplay blocked:', err));

    playerBar.classList.add('visible');
    updatePlayerInfo();

    /* refresh chapter list highlight without scrolling */
    if (app.querySelector('.btn-back')) renderDetail(bookId, false);
  }

  function updatePlayerInfo() {
    const book = getBook(currentBookId);
    if (!book) return;
    const ch = book.chapters[currentChIdx];
    if (!ch) return;
    playerBookTitle.textContent = book.title;
    playerChapTitle.textContent = (lang === 'en' && ch.title_en) ? ch.title_en : ch.title;
  }

  function setPlayState(playing) {
    btnPlay.querySelector('.icon-play').style.display  = playing ? 'none' : '';
    btnPlay.querySelector('.icon-pause').style.display = playing ? '' : 'none';
    document.body.classList.toggle('is-playing', playing);
  }

  /* Controls */
  btnPlay.addEventListener('click', () => {
    audioEl.paused ? audioEl.play() : audioEl.pause();
  });

  btnRewind.addEventListener('click', () => {
    audioEl.currentTime = Math.max(0, audioEl.currentTime - 15);
  });

  btnForward.addEventListener('click', () => {
    if (isFinite(audioEl.duration))
      audioEl.currentTime = Math.min(audioEl.duration, audioEl.currentTime + 15);
  });

  /* Audio events */
  audioEl.addEventListener('play',  () => setPlayState(true));
  audioEl.addEventListener('pause', () => setPlayState(false));

  audioEl.addEventListener('ended', () => {
    setPlayState(false);
    const book = getBook(currentBookId);
    if (book && currentChIdx < book.chapters.length - 1) {
      loadChapter(currentBookId, currentChIdx + 1);
    }
  });

  audioEl.addEventListener('timeupdate', () => {
    if (isSeeking) return;
    const cur = audioEl.currentTime;
    const dur = audioEl.duration;
    timeCurrent.textContent = formatTime(cur);
    if (isFinite(dur) && dur > 0) {
      const pct = (cur / dur) * 100;
      scrubber.value = pct;
      setScrubberFill(pct);
    }
  });

  audioEl.addEventListener('loadedmetadata', () => {
    if (isFinite(audioEl.duration)) {
      timeTotal.textContent = formatTime(audioEl.duration);
    }
  });

  /* Scrubber */
  scrubber.addEventListener('pointerdown', () => { isSeeking = true; });

  scrubber.addEventListener('input', () => {
    const pct = parseFloat(scrubber.value);
    setScrubberFill(pct);
    if (isFinite(audioEl.duration)) {
      timeCurrent.textContent = formatTime((pct / 100) * audioEl.duration);
    }
  });

  scrubber.addEventListener('change', () => {
    if (isFinite(audioEl.duration)) {
      audioEl.currentTime = (parseFloat(scrubber.value) / 100) * audioEl.duration;
    }
    isSeeking = false;
  });

  /* Keyboard shortcuts */
  document.addEventListener('keydown', e => {
    if (['INPUT', 'TEXTAREA', 'BUTTON'].includes(e.target.tagName)) return;
    if (!playerBar.classList.contains('visible')) return;
    if (e.code === 'Space')       { e.preventDefault(); btnPlay.click(); }
    if (e.code === 'ArrowLeft')   { e.preventDefault(); btnRewind.click(); }
    if (e.code === 'ArrowRight')  { e.preventDefault(); btnForward.click(); }
  });

  /* Language toggle */
  langToggle.addEventListener('click', () => setLang(lang === 'es' ? 'en' : 'es'));

  /* ---------------------------------------------------------------- */
  /* Init                                                              */
  /* ---------------------------------------------------------------- */
  async function init() {
    app.innerHTML = `<p class="status-msg">${t('loadingMsg')}</p>`;
    try {
      const res = await fetch('catalog.json');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      catalog = await res.json();
      renderLibrary();
    } catch (err) {
      console.error('catalog.json load failed:', err);
      app.innerHTML = `<p class="status-msg">${t('errorMsg')}</p>`;
    }
  }

  init();
})();
