window.levelsApp = (() => {
  let levels = [];
  let initialized = false;

  const ICONS = { a0: '🌱', a1: '🌿', a2: '🌳', b1: '🌲', b2: '🎯', c1: '🏆' };

  async function load() {
    const res = await fetch('data/levels.json');
    levels = await res.json();
  }

  function get(id) {
    return levels.find(l => l.id === id);
  }

  function available() {
    return levels.filter(l => l.available);
  }

  function renderMenu() {
    const grid = document.getElementById('level-grid');
    if (!grid) return;
    grid.innerHTML = '';

    for (const lvl of levels) {
      const btn = document.createElement('button');
      btn.className = 'mode-card';
      btn.dataset.goto = lvl.id;
      btn.innerHTML =
        `<div class="mode-icon">${ICONS[lvl.id] || '📚'}</div>` +
        `<div class="mode-title">${lvl.name} · ${lvl.titleRu}</div>` +
        `<div class="mode-desc">${lvl.desc}</div>` +
        `<div class="mode-progress" id="progress-${lvl.id}"></div>`;

      if (!lvl.available) {
        btn.classList.add('disabled');
        btn.disabled = true;
        btn.querySelector('.mode-progress').textContent = 'Скоро';
      }

      grid.appendChild(btn);
    }
  }

  async function renderProgress() {
    for (const lvl of levels) {
      const el = document.getElementById('progress-' + lvl.id);
      if (!el) continue;
      if (!lvl.available) continue;

      const total = await fetchWordCount(lvl.id);
      const p = countProgress(lvl.id, total);
      el.textContent = `${p.learned} / ${p.total} слов изучено`;
    }
  }

  function renderTabs(container) {
    container.innerHTML = '';
    for (const lvl of levels) {
      const tab = document.createElement('button');
      tab.className = 'level-tab';
      tab.textContent = lvl.name;
      tab.dataset.level = lvl.id;
      if (!lvl.available) {
        tab.classList.add('disabled');
        tab.disabled = true;
      }
      container.appendChild(tab);
    }
  }

  function markActiveTabs(currentLevel) {
    document.querySelectorAll('.level-tabs').forEach(container => {
      container.querySelectorAll('.level-tab').forEach(tab => {
        tab.classList.toggle('active', tab.dataset.level === currentLevel);
      });
    });
  }

  function countProgress(levelId, totalWords) {
    try {
      const saved = JSON.parse(localStorage.getItem('fi-srs-' + levelId) || '{}');
      const ids = Object.keys(saved);
      const learned = ids.filter(id => (saved[id].interval || 0) >= 7).length;
      return { learned, total: totalWords };
    } catch (e) {
      return { learned: 0, total: totalWords };
    }
  }

  async function fetchWordCount(levelId) {
    try {
      const res = await fetch('data/' + levelId + '/words.json');
      const arr = await res.json();
      return arr.length;
    } catch (e) {
      return 0;
    }
  }

  async function init() {
    if (initialized) return;
    await load();

    renderMenu();
    await renderProgress();

    for (const id of ['level-tabs-cards', 'level-tabs-reading', 'level-tabs-grammar']) {
      const el = document.getElementById(id);
      if (el) renderTabs(el);
    }

    initialized = true;
  }

  function refreshProgress() {
    renderProgress();
  }

  return { init, get, available, markActiveTabs, countProgress, fetchWordCount, refreshProgress };
})();
