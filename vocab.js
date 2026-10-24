window.vocabApp = (() => {
  const LS = 'fi-vocab-known-v1';
  let DATA = [];
  let known = new Set();
  try { known = new Set(JSON.parse(localStorage.getItem(LS) || '[]')); } catch(e) {}
  const save = () => { try { localStorage.setItem(LS, JSON.stringify([...known])); } catch(e) {} };

  const S = { level: 'all', mode: 'both', cat: '', q: '', unk: false, shuf: false, order: null, open: new Set(), idx: 0, flip: false };
  const $ = s => document.querySelector(s);
  const esc = s => String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

  let initialized = false;

  async function init() {
    if (initialized) return;
    try {
      const [a0, a1] = await Promise.all([
        fetch('data/a0/words.json').then(r => r.json()),
        fetch('data/a1/words.json').then(r => r.json())
      ]);
      // Превращаем формат {id: "mina"} в {k: "a0:mina"}
      DATA = [
        ...a0.map(w => ({ ...w, k: 'a0:' + w.id, lvl: 'a0' })),
        ...a1.map(w => ({ ...w, k: 'a1:' + w.id, lvl: 'a1' }))
      ];
    } catch(e) {
      console.error('Failed to load words', e);
      return;
    }
    fillCats();
    render();
    initialized = true;
  }

  function pool() { return DATA.filter(w => S.level === 'all' || w.lvl === S.level); }

  function filtered() {
    const q = S.q.trim().toLowerCase();
    let r = pool().filter(w => (!S.cat || w.cat === S.cat) && (!S.unk || !known.has(w.k)) && (!q || w.fi.toLowerCase().includes(q) || w.ru.toLowerCase().includes(q)));
    if (S.shuf && S.order) { const o = S.order; r = r.slice().sort((a, b) => o[a.k] - o[b.k]); }
    return r;
  }

  function fillCats() {
    const cats = [...new Set(pool().map(w => w.cat))];
    if (!cats.includes(S.cat)) S.cat = '';
    $('#vocab-cat').innerHTML = '<option value="">Все темы</option>' + cats.map(c => `<option${c === S.cat ? ' selected' : ''}>${esc(c)}</option>`).join('');
  }

  function progress() {
    const p = pool(), n = p.filter(w => known.has(w.k)).length;
    $('#progText').textContent = `Выучено ${n} из ${p.length}`;
    $('#progBar').style.width = (p.length ? n / p.length * 100 : 0) + '%';
  }

  function cell(w, side) {
    const hidden = (side === 'ru' && S.mode === 'hideRu') || (side === 'fi' && S.mode === 'hideFi');
    const t = esc(w[side]);
    if (hidden && !S.open.has(w.k)) return `<button class="hid" data-k="${esc(w.k)}" aria-label="Показать перевод">показать</button>`;
    return t;
  }

  function render() {
    progress();
    const list = filtered();
    $('#vocab-count').textContent = `Показано слов: ${list.length}`;
    const out = $('#vocab-out');
    if (S.mode === 'cards') { return renderCards(list, out); }
    if (!list.length) { out.innerHTML = '<div class="empty">Ничего не найдено. Измени поиск или фильтры.</div>'; return; }
    let html = '<div class="tablebox"><table><thead class="sr" hidden></thead><tbody>';
    const row = w => `<tr class="${known.has(w.k) ? 'known' : ''}"><td class="fi">${cell(w, 'fi')}</td><td class="ru">${cell(w, 'ru')}</td><td class="ck"><input type="checkbox" data-k="${esc(w.k)}" ${known.has(w.k) ? 'checked' : ''} aria-label="Выучено: ${esc(w.fi)}"></td></tr>`;
    if (S.shuf) { html += list.map(row).join(''); }
    else {
      const g = new Map();
      list.forEach(w => { const key = w.lvl + '|' + w.cat; if (!g.has(key)) g.set(key, []); g.get(key).push(w); });
      g.forEach((ws, key) => {
        const lv = key.split('|')[0].toUpperCase(), kn = ws.filter(w => known.has(w.k)).length;
        html += `<tr class="cat"><th colspan="3">${esc(ws[0].cat)}<span>${S.level === 'all' ? lv + ' · ' : ''}${kn}/${ws.length}</span></th></tr>` + ws.map(row).join('');
      });
    }
    out.innerHTML = html + '</tbody></table></div>';
  }

  function renderCards(list, out) {
    if (!list.length) { out.innerHTML = '<div class="empty">Нет слов для карточек. Измени фильтры.</div>'; return; }
    if (S.idx >= list.length) S.idx = 0;
    const w = list[S.idx];
    const front = w.fi, back = w.ru;
    out.innerHTML = `<div class="deck"><div class="count">${S.idx + 1} / ${list.length}</div>
    <button class="card${S.flip ? ' back' : ''}" id="vocab-card" aria-label="Перевернуть карточку">
      <span class="tag">${S.flip ? 'Русский' : 'Suomi'}</span>
      <span class="w">${esc(S.flip ? back : front)}</span>
      <span class="hint">${esc(w.cat)} · нажми, чтобы перевернуть</span></button>
    <div class="act"><button class="btn" data-a="prev">Назад</button><button class="btn" data-a="again">Ещё раз</button><button class="btn good" data-a="know">Знаю</button></div></div>`;
  }

  // Обработчики событий (работают только когда открыт словарь)
  document.addEventListener('click', e => {
    if (document.getElementById('screen-vocab').hidden) return;
    const t = e.target;
    const seg = t.closest('.seg button');
    if (seg) {
      const p = seg.parentElement; p.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', b === seg));
      if (p.id === 'segLevel') { S.level = seg.dataset.v; S.cat = ''; fillCats(); }
      else { S.mode = seg.dataset.v; S.open.clear(); }
      S.idx = 0; S.flip = false; render(); return;
    }
    if (t.id === 'unk') { S.unk = !S.unk; t.setAttribute('aria-pressed', S.unk); S.idx = 0; render(); return; }
    if (t.id === 'shuf') {
      S.shuf = !S.shuf; t.setAttribute('aria-pressed', S.shuf); t.textContent = S.shuf ? 'Порядок по темам' : 'Перемешать';
      if (S.shuf) { S.order = {}; DATA.forEach(w => S.order[w.k] = Math.random()); }
      S.idx = 0; render(); return;
    }
    if (t.id === 'reveal') {
      S.open.clear();
      if (S.mode === 'hideRu' || S.mode === 'hideFi') { pool().forEach(w => S.open.add(w.k)); }
      render(); return;
    }
    if (t.classList.contains('hid')) { S.open.add(t.dataset.k); render(); return; }
    if (t.closest('#vocab-card')) { S.flip = !S.flip; render(); return; }
    
    const a = t.dataset && t.dataset.a;
    if (a) {
      const list = filtered(), w = list[S.idx];
      if (a === 'prev') { S.idx = (S.idx - 1 + list.length) % list.length; }
      else {
        if (a === 'know') known.add(w.k); else known.delete(w.k);
        save();
        if (a === 'know' && S.unk) { /* word leaves the deck */ } else S.idx = (S.idx + 1) % list.length;
      }
      S.flip = false; render(); return;
    }
  });

  document.addEventListener('change', e => {
    if (document.getElementById('screen-vocab').hidden) return;
    const t = e.target;
    if (t.type === 'checkbox' && t.dataset.k) { t.checked ? known.add(t.dataset.k) : known.delete(t.dataset.k); save(); render(); }
    if (t.id === 'vocab-cat') { S.cat = t.value; S.idx = 0; render(); }
  });

  document.addEventListener('input', e => {
    if (document.getElementById('screen-vocab').hidden) return;
    if (e.target.id === 'vocab-q') { S.q = e.target.value; S.idx = 0; render(); }
  });

  document.addEventListener('keydown', e => {
    if (document.getElementById('screen-vocab').hidden) return;
    if (S.mode !== 'cards' || /INPUT|SELECT/.test(document.activeElement.tagName)) return;
    if (e.key === ' ' || e.key === 'Enter') {
      if (document.activeElement.id === 'vocab-card') return;
      e.preventDefault(); S.flip = !S.flip; render();
    }
    if (e.key === 'ArrowRight') { const l = filtered(); S.idx = (S.idx + 1) % l.length; S.flip = false; render(); }
    if (e.key === 'ArrowLeft') { const l = filtered(); S.idx = (S.idx - 1 + l.length) % l.length; S.flip = false; render(); }
  });

  return { onShow: init };
})();
