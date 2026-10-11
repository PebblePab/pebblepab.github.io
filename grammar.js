window.grammarApp = (() => {
  let level = 'a0';
  let topics = [];
  let currentId = null;

  async function loadTopics() {
    try {
      const res = await fetch('data/' + level + '/grammar.json');
      topics = await res.json();
    } catch (e) {
      topics = [];
    }
  }

  function renderList() {
    const list = document.getElementById('grammar-topic-list');
    list.innerHTML = '';

    if (topics.length === 0) {
      const li = document.createElement('li');
      li.textContent = 'Тем пока нет';
      li.style.cursor = 'default';
      li.style.opacity = '0.6';
      list.appendChild(li);
      return;
    }

    for (const t of topics) {
      const li = document.createElement('li');
      li.textContent = t.titleRu || t.title;
      li.dataset.id = t.id;
      if (currentId === t.id) li.classList.add('active');
      list.appendChild(li);
    }
  }

  function renderEmpty() {
    document.getElementById('grammar-empty').hidden = false;
    document.getElementById('grammar-article').hidden = true;
  }

  function renderBlock(b) {
    switch (b.type) {
      case 'text':
        return `<p class="grammar-text">${b.content}</p>`;
      case 'heading':
        return `<h3 class="grammar-heading">${b.content}</h3>`;
      case 'list':
        return `<ul class="grammar-list">${b.items.map(i => `<li>${i}</li>`).join('')}</ul>`;
      case 'table':
        return `
          <div class="grammar-table-wrap">
            <table class="grammar-table">
              <thead><tr>${b.headers.map(h => `<th>${h}</th>`).join('')}</tr></thead>
              <tbody>${b.rows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody>
            </table>
          </div>`;
      case 'examples':
        return `<div class="grammar-examples">${
          b.items.map(i => `
            <div class="grammar-example">
              <div class="grammar-example-fi">${i.fi}</div>
              <div class="grammar-example-ru">${i.ru}</div>
            </div>`).join('')
        }</div>`;
      case 'note':
        return `<div class="grammar-note">💡 ${b.content}</div>`;
      default:
        return '';
    }
  }

  function renderTopic(id) {
    const t = topics.find(x => x.id === id);
    if (!t) return;

    currentId = id;
    renderList();

    document.getElementById('grammar-empty').hidden = true;
    document.getElementById('grammar-article').hidden = false;

    document.getElementById('grammar-title').textContent = t.title;
    document.getElementById('grammar-subtitle').textContent =
      `${t.titleRu || ''} · ${t.level || ''}`;

    const body = document.getElementById('grammar-body');
    body.innerHTML = t.blocks.map(renderBlock).join('');
  }

  document.getElementById('grammar-topic-list').addEventListener('click', e => {
    if (e.target.tagName !== 'LI') return;
    if (!e.target.dataset.id) return;
    renderTopic(e.target.dataset.id);
  });

  async function setLevel(newLevel) {
    level = newLevel;
    currentId = null;
    document.getElementById('grammar-level-label').textContent =
      (window.levelsApp.get(newLevel) || {}).name || newLevel.toUpperCase();
    renderEmpty();
    await loadTopics();
    renderList();
  }

  async function onShow(levelArg) {
    if (levelArg) await setLevel(levelArg);
  }

  return { onShow, setLevel };
})();