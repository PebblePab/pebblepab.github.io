/* ============================================================
   СОСТОЯНИЕ
   ============================================================ */
let currentLevel = 'a0';
let currentMode = 'menu'; // 'menu' | 'level' | 'cards' | 'reading' | 'grammar' | 'vocab'

/* ============================================================
   РОУТЕР
   ============================================================ */
const SCREENS = ['menu', 'level', 'cards', 'reading', 'grammar', 'vocab'];

function parseHash() {
  const raw = location.hash.replace('#', '');
  if (!raw) return { screen: 'menu' };

  const parts = raw.split('/');
  if (parts[0] === 'menu') return { screen: 'menu' };

  // parts: [level, mode?]
  const level = parts[0];
  if (!window.levelsApp.get(level)) return { screen: 'menu' };

  const mode = parts[1];
  if (!mode) return { screen: 'level', level };
  if (!['cards', 'reading', 'grammar', 'vocab'].includes(mode)) return { screen: 'level', level };

  return { screen: mode, level };
}

function setHash(path) {
  if (location.hash !== '#' + path) {
    history.replaceState(null, '', '#' + path);
  }
}

async function goto(path) {
  // path = 'menu' | 'a0' | 'a0/cards' | ...
  setHash(path);
  const route = parseHash();
  await applyRoute(route);
}

async function applyRoute(route) {
  for (const s of SCREENS) {
    document.getElementById('screen-' + s).hidden = s !== route.screen;
  }

  if (route.screen === 'menu') {
    currentMode = 'menu';
    if (window.levelsApp.refreshProgress) window.levelsApp.refreshProgress();
    return;
  }

  currentLevel = route.level;
  const lvl = window.levelsApp.get(currentLevel);
  if (!lvl || !lvl.available) {
    return goto('menu');
  }

  if (route.screen === 'level') {
    currentMode = 'level';
    document.getElementById('level-title').textContent = lvl.name;
    document.getElementById('level-subtitle').textContent = lvl.titleRu || '';
    return;
  }

  currentMode = route.screen;

  // Показать активный таб уровня во всех сайдбарах
  window.levelsApp.markActiveTabs(currentLevel);

  // Заголовки уровней
  document.getElementById('cards-level-label').textContent = lvl.name;
  document.getElementById('reading-level-label').textContent = lvl.name;
  document.getElementById('grammar-level-label').textContent = lvl.name;

  if (route.screen === 'cards') await window.cardsApp.onShow(currentLevel);
  if (route.screen === 'reading') await window.readingApp.onShow(currentLevel);
  if (route.screen === 'grammar') await window.grammarApp.onShow(currentLevel);
  if (route.screen === 'vocab') {
    // iframe грузится автоматически, ничего дополнительно не нужно
  }
}

/* Клики по data-goto */
document.addEventListener('click', e => {
  const btn = e.target.closest('[data-goto]');
  if (btn) {
    const target = btn.dataset.goto;
    if (target === 'menu') return goto('menu');
    if (['cards', 'reading', 'grammar', 'vocab'].includes(target)) {
      return goto(currentLevel + '/' + target);
    }
    // уровень
    return goto(target);
  }
});

/* Табы уровня в сайдбарах */
document.addEventListener('click', e => {
  const tab = e.target.closest('.level-tab');
  if (!tab || tab.disabled) return;
  const newLevel = tab.dataset.level;
  if (newLevel === currentLevel) return;
  goto(newLevel + '/' + currentMode);
});

window.addEventListener('hashchange', async () => {
  await applyRoute(parseHash());
});

/* ============================================================
   ТЕМА
   ============================================================ */
const THEME_KEY = 'fi-theme';

function applyTheme(theme) {
  document.body.classList.toggle('dark', theme === 'dark');
  const icon = theme === 'dark' ? '☀️' : '🌙';
  document.querySelectorAll('.theme-toggle').forEach(el => {
    el.textContent = icon;
  });
}

function toggleTheme() {
  const isDark = document.body.classList.contains('dark');
  const next = isDark ? 'light' : 'dark';
  localStorage.setItem(THEME_KEY, next);
  applyTheme(next);
}

document.querySelectorAll('.theme-toggle').forEach(el => {
  el.addEventListener('click', toggleTheme);
});

/* ============================================================
   РЕЖИМ КАРТОЧЕК
   ============================================================ */
window.cardsApp = (() => {
  const DAY = 24 * 60 * 60 * 1000;
  const SWIPE_THRESHOLD = 90;

  let level = 'a0';
  let cards = [];
  let current = null;
  let queue = [];
  let activeCat = null;

  let streak = 0;
  let answerState = 'idle';
  let waitingContinue = false;
  let initialized = false;

  function storageKey() {
    return 'fi-srs-' + level;
  }

  async function loadCards() {
    const res = await fetch('data/' + level + '/words.json');
    const raw = await res.json();
    const saved = JSON.parse(localStorage.getItem(storageKey()) || '{}');

    cards = raw.map(card => {
      const state = saved[card.id] || { interval: 0, ease: 2.5, due: 0, lastSeen: 0 };
      return { ...card, ...state };
    });
  }

  function saveCards() {
    const state = {};
    for (const c of cards) {
      state[c.id] = {
        interval: c.interval,
        ease: c.ease,
        due: c.due,
        lastSeen: c.lastSeen
      };
    }
    localStorage.setItem(storageKey(), JSON.stringify(state));
  }

  function pool() {
    return activeCat ? cards.filter(c => c.cat === activeCat) : cards;
  }

  function buildQueue() {
    const now = Date.now();
    const p = pool();
    queue = p.filter(c => c.due <= now);
    if (queue.length === 0) queue = p.slice();
    queue.sort(() => Math.random() - 0.5);
  }

  function renderCategoryList() {
    const list = document.getElementById('cat-list');
    list.innerHTML = '';

    const allLi = document.createElement('li');
    allLi.textContent = `Все (${cards.length})`;
    allLi.dataset.cat = '';
    if (activeCat === null) allLi.classList.add('active');
    list.appendChild(allLi);

    const cats = [...new Set(cards.map(c => c.cat))];
    for (const cat of cats) {
      const count = cards.filter(c => c.cat === cat).length;
      const li = document.createElement('li');
      li.textContent = `${cat} (${count})`;
      li.dataset.cat = cat;
      if (activeCat === cat) li.classList.add('active');
      list.appendChild(li);
    }
  }

  function nextCard() {
    if (queue.length === 0) buildQueue();
    current = queue.shift();

    waitingContinue = false;
    answerState = 'idle';

    const input = document.getElementById('answer-input');
    input.value = '';
    input.disabled = false;
    input.classList.remove('correct', 'wrong');
    document.getElementById('check-btn').disabled = false;

    document.getElementById('question').textContent = current.ru;

    const ans = document.getElementById('answer');
    ans.hidden = true;
    ans.innerHTML =
      `<div style="font-size:1.7rem;font-weight:700;color:var(--accent)">${current.fi}</div>` +
      `<div style="margin-top:0.4rem;font-size:0.8rem;color:var(--text-dim)">${current.cat}</div>`;

    document.getElementById('hint').innerHTML =
      '<kbd>Enter</kbd> — проверить · <kbd>←</kbd> не знаю · <kbd>→</kbd> знаю · <kbd>Space</kbd> — ответ';

    clearCardVisual();
    updateStats();
    updateProgress();

    setTimeout(() => input.focus(), 50);
  }

  function grade(type) {
    const now = Date.now();

    if (type === 'again') {
      current.interval = 0;
      current.due = now + 10 * 60 * 1000;
      streak = 0;
    } else {
      current.interval = current.interval === 0 ? 1 : Math.round(current.interval * current.ease);
      current.due = now + current.interval * DAY;
      current.ease = Math.min(3.0, current.ease + 0.05);
      streak++;
    }

    current.lastSeen = now;
    saveCards();
    updateStreak();
  }

  function updateStats() {
    const p = pool();
    const now = Date.now();
    const due = p.filter(c => c.due <= now).length;
    const learned = p.filter(c => c.interval >= 7).length;
    const label = activeCat ? activeCat : 'Все';
    document.getElementById('stats').textContent =
      `${label}: ${p.length} · К повторению: ${due} · Освоено (7+ дней): ${learned}`;
  }

  function updateProgress() {
    const p = pool();
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const todayTs = startOfDay.getTime();

    const todayDone = p.filter(c => c.lastSeen >= todayTs).length;
    const total = p.length;
    const pct = total > 0 ? Math.round((todayDone / total) * 100) : 0;

    document.getElementById('progress-fill').style.width = pct + '%';
    document.getElementById('session-count').textContent =
      `Сегодня: ${todayDone} / ${total}`;
  }

  function updateStreak() {
    const el = document.getElementById('streak-count');
    el.textContent = `Подряд: ${streak}`;
    el.classList.toggle('hot', streak >= 5);
  }

  function normalize(s) {
    return s.trim().toLowerCase().replace(/\s+/g, ' ');
  }

  function checkAnswer() {
    if (answerState !== 'idle' || !current) return;
    const input = document.getElementById('answer-input');
    const value = input.value;
    if (!value.trim()) return;

    const correct = normalize(value) === normalize(current.fi);

    if (correct) {
      answerState = 'correct';
      input.classList.add('correct');
      input.disabled = true;
      document.getElementById('check-btn').disabled = true;
      showFeedback('right', '✓');
      grade('good');
      setTimeout(() => nextCard(), 600);
    } else {
      answerState = 'wrong';
      input.classList.add('wrong');
      input.disabled = true;
      document.getElementById('check-btn').disabled = true;
      showFeedback('left', '✗');
      document.getElementById('answer').hidden = false;
      grade('again');
      waitContinue();
    }
  }

  function revealAnswer() {
    if (answerState !== 'idle' || !current) return;
    answerState = 'revealed';
    document.getElementById('answer').hidden = false;
    document.getElementById('answer-input').disabled = true;
    document.getElementById('check-btn').disabled = true;
    grade('again');
    waitContinue();
  }

  function waitContinue() {
    waitingContinue = true;
    document.getElementById('hint').innerHTML =
      'Нажми <kbd>Enter</kbd> или <kbd>→</kbd>, чтобы продолжить';
  }

  function continueNext() {
    if (!waitingContinue) return;
    clearCardVisual();
    nextCard();
  }

  const card = document.getElementById('card');
  const feedback = document.getElementById('feedback');

  function showFeedback(side, text) {
    feedback.className = 'show-' + side;
    feedback.innerHTML = `<span>${text}</span>`;
  }

  function clearCardVisual() {
    feedback.className = '';
    feedback.innerHTML = '';
    feedback.style.opacity = '';
    card.style.transition = '';
    card.style.transform = '';
    card.style.opacity = '';
  }

  let startX = 0, startY = 0, dx = 0, dy = 0;
  let dragging = false, lockedHorizontal = null;
  let downPos = { x: 0, y: 0 };

  function onDown(e) {
    const p = e.touches ? e.touches[0] : e;
    downPos = { x: p.clientX, y: p.clientY };
    if (waitingContinue) return;
    if (e.target.closest('#input-row') || e.target.closest('#controls')) return;

    dragging = true;
    lockedHorizontal = null;
    startX = p.clientX;
    startY = p.clientY;
    dx = 0; dy = 0;
    card.style.transition = 'none';
  }

  function onMove(e) {
    if (!dragging) return;
    const p = e.touches ? e.touches[0] : e;
    dx = p.clientX - startX;
    dy = p.clientY - startY;

    if (lockedHorizontal === null) {
      if (Math.abs(dx) > 8 || Math.abs(dy) > 8) {
        lockedHorizontal = Math.abs(dx) > Math.abs(dy);
      } else return;
    }
    if (!lockedHorizontal) return;
    if (e.cancelable) e.preventDefault();

    card.style.transform = `translateX(${dx}px) rotate(${dx * 0.05}deg)`;
    const ratio = Math.min(Math.abs(dx) / SWIPE_THRESHOLD, 1);
    feedback.style.opacity = ratio * 0.9;

    if (dx > 0) {
      feedback.className = 'show-right';
      feedback.innerHTML = '<span>✓ Знаю</span>';
    } else if (dx < 0) {
      feedback.className = 'show-left';
      feedback.innerHTML = '<span>↻ Позже</span>';
    }
  }

  function onUp() {
    if (!dragging) return;
    dragging = false;

    if (Math.abs(dx) > SWIPE_THRESHOLD) {
      const dir = dx > 0 ? 'right' : 'left';
      const label = dir === 'right' ? '✓ Знаю' : '↻ Позже';
      showFeedback(dir, label);

      card.style.transition = 'transform 0.25s ease, opacity 0.25s ease';
      card.style.transform = `translateX(${dir === 'right' ? 600 : -600}px) rotate(${dir === 'right' ? 20 : -20}deg)`;
      card.style.opacity = '0';

      if (answerState === 'idle') {
        grade(dir === 'right' ? 'good' : 'again');
      }
      setTimeout(() => nextCard(), 300);
    } else {
      card.style.transition = 'transform 0.2s ease';
      card.style.transform = '';
      clearCardVisual();
    }
    dx = 0; dy = 0;
  }

  card.addEventListener('mousedown', onDown);
  window.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup', onUp);
  card.addEventListener('touchstart', onDown, { passive: true });
  window.addEventListener('touchmove', onMove, { passive: false });
  window.addEventListener('touchend', onUp);

  card.addEventListener('click', e => {
    const tapDx = Math.abs(e.clientX - downPos.x);
    const tapDy = Math.abs(e.clientY - downPos.y);
    if (tapDx > 8 || tapDy > 8) return;

    if (waitingContinue) continueNext();
    else if (answerState === 'idle') revealAnswer();
  });

  document.getElementById('check-btn').addEventListener('click', checkAnswer);
  document.getElementById('dont-know-btn').addEventListener('click', revealAnswer);

  document.getElementById('answer-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (waitingContinue) continueNext();
      else if (answerState === 'idle') checkAnswer();
    }
  });

  document.addEventListener('keydown', e => {
    if (document.getElementById('screen-cards').hidden) return;
    const inputFocused = document.activeElement === document.getElementById('answer-input');

    if (e.key === 'Enter' && !inputFocused) {
      if (waitingContinue) { e.preventDefault(); continueNext(); }
      return;
    }

    if (e.code === 'Space' && !inputFocused) {
      e.preventDefault();
      if (waitingContinue) continueNext();
      else if (answerState === 'idle') revealAnswer();
      return;
    }

    if (e.key === 'ArrowRight' && !inputFocused) {
      e.preventDefault();
      if (waitingContinue) { continueNext(); return; }
      if (answerState === 'idle') {
        answerState = 'correct';
        showFeedback('right', '✓ Знаю');
        card.style.transition = 'transform 0.25s ease, opacity 0.25s ease';
        card.style.transform = 'translateX(600px) rotate(20deg)';
        card.style.opacity = '0';
        grade('good');
        setTimeout(() => nextCard(), 300);
      }
      return;
    }

    if (e.key === 'ArrowLeft' && !inputFocused) {
      e.preventDefault();
      if (waitingContinue) continueNext();
      else if (answerState === 'idle') revealAnswer();
    }
  });

  document.getElementById('cat-list').addEventListener('click', e => {
    if (e.target.tagName !== 'LI') return;
    const cat = e.target.dataset.cat;
    activeCat = cat === '' ? null : cat;
    renderCategoryList();
    buildQueue();
    nextCard();
  });

  async function setLevel(newLevel) {
    level = newLevel;
    activeCat = null;
    streak = 0;
    initialized = false;
    await init();
  }

  async function init() {
    if (initialized) return;
    await loadCards();
    renderCategoryList();
    buildQueue();
    nextCard();
    updateStreak();
    initialized = true;
  }

  async function onShow(levelArg) {
    if (levelArg && levelArg !== level) {
      await setLevel(levelArg);
    } else {
      await init();
    }
    const input = document.getElementById('answer-input');
    if (input && !input.disabled) setTimeout(() => input.focus(), 50);
  }

  return { onShow, setLevel };
})();

/* ============================================================
   СТАРТ
   ============================================================ */
(async function init() {
  applyTheme(localStorage.getItem(THEME_KEY) || 'light');
  await window.levelsApp.init();
  await applyRoute(parseHash());
})();
  