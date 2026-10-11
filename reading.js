window.readingApp = (() => {
  let level = 'a0';
  let texts = [];
  let currentId = null;

  async function loadTexts() {
    try {
      const res = await fetch('data/' + level + '/reading.json');
      texts = await res.json();
    } catch (e) {
      texts = [];
    }
  }

  function renderList() {
    const list = document.getElementById('text-list');
    list.innerHTML = '';

    if (texts.length === 0) {
      const li = document.createElement('li');
      li.textContent = 'Текстов пока нет';
      li.style.cursor = 'default';
      li.style.opacity = '0.6';
      list.appendChild(li);
      return;
    }

    for (const t of texts) {
      const li = document.createElement('li');
      li.textContent = t.titleRu || t.title;
      li.dataset.id = t.id;
      if (currentId === t.id) li.classList.add('active');
      list.appendChild(li);
    }
  }

  function renderEmpty() {
    document.getElementById('reading-empty').hidden = false;
    document.getElementById('reading-article').hidden = true;
  }

  function renderArticle(id) {
    const t = texts.find(x => x.id === id);
    if (!t) return;

    currentId = id;
    renderList();

    document.getElementById('reading-empty').hidden = true;
    document.getElementById('reading-article').hidden = false;

    document.getElementById('article-title').textContent = t.title;
    document.getElementById('article-subtitle').textContent =
      `${t.titleRu || ''} · ${t.level || ''}`;

    const body = document.getElementById('article-body');
    body.innerHTML = '';
    for (const seg of t.segments) {
      const div = document.createElement('div');
      div.className = 'segment';
      div.innerHTML =
        `<div class="segment-fi">${seg.fi}</div>` +
        `<div class="segment-ru">${seg.ru}</div>`;
      div.addEventListener('click', () => div.classList.toggle('revealed'));
      body.appendChild(div);
    }
  }

  document.getElementById('text-list').addEventListener('click', e => {
    if (e.target.tagName !== 'LI') return;
    if (!e.target.dataset.id) return;
    renderArticle(e.target.dataset.id);
  });

  async function setLevel(newLevel) {
    level = newLevel;
    currentId = null;
    document.getElementById('reading-level-label').textContent =
      (window.levelsApp.get(newLevel) || {}).name || newLevel.toUpperCase();
    renderEmpty();
    await loadTexts();
    renderList();
  }

  async function onShow(levelArg) {
    if (levelArg) await setLevel(levelArg);
  }

  return { onShow, setLevel };
})();