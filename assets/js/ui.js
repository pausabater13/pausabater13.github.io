// Interfaz HTML del mundo: lista, tarjeta, avisos y paso a la versión formal. Funciona aunque el 3D no cargue.
// ---------- Interfaz HTML (funciona sin 3D) ----------
window.UI = (() => {
  const $ = s => document.querySelector(s), list = $('#list'), card = $('#card'), visited = new Set();
  let current = null, onBeamMode = null;
  for (const it of ITEMS){
    const li = document.createElement('li');
    li.innerHTML = `<button data-id="${it.id}"><span class="yr">${it.yr}</span><span class="place">${it.place}</span><span class="seen" aria-label="visited">✓</span><span class="what">${it.what}</span></button>`;
    li.firstChild.addEventListener('click', () => window.WORLD ? WORLD.goTo(it.id) : show(it.id));
    list.appendChild(li);
  }
  const count = () => $('#count').textContent = `${visited.size}/${ITEMS.length}`;
  count();
  function show(id){
    const it = ITEMS.find(d => d.id === id); if (!it || current === id) return;
    current = id; visited.add(id); count();
    list.querySelectorAll('button').forEach(b => { b.setAttribute('aria-current', b.dataset.id === id); b.classList.toggle('visited', visited.has(b.dataset.id)); });
    const links = it.links.map(([t, u]) => `<li><a href="${u}" rel="noopener">${t} ↗</a></li>`).join('') + (it.pending ? `<li class="pending">pending: ${it.pending}</li>` : '');
    card.innerHTML = `<span class="place">${it.place}</span><h3>${it.what}</h3><p>${it.text}</p>
      ${it.beam ? `<div class="ctrl" role="group" aria-label="Beam type"><button data-m="bessel" aria-pressed="true">Bessel · self-healing</button><button data-m="focus">focused</button><button data-m="airy">curved</button></div>` : ''}
      ${it.note ? `<p class="note">${it.note}</p>` : ''}<ul>${links}</ul>`;
    card.querySelectorAll('[data-m]').forEach(b => b.onclick = () => {
      card.querySelectorAll('[data-m]').forEach(x => x.setAttribute('aria-pressed', x === b)); onBeamMode && onBeamMode(b.dataset.m);
    });
    card.classList.add('on');
  }
  function hide(){ current = null; card.classList.remove('on'); list.querySelectorAll('button').forEach(b => b.removeAttribute('aria-current')); }
  // Aviso temporal (p. ej. al transformarse el vehículo)
  let toastT = 0;
  function toast(title, text, actions = []){
    const el = $('#toast'); el.innerHTML = `<b>${title}</b><p>${text}</p><div class="row"></div>`;
    actions.forEach(([label, fn, primary]) => { const b = document.createElement('button'); b.textContent = label; if (primary) b.className = 'primary'; b.onclick = () => { fn(); el.classList.remove('on'); }; el.lastChild.appendChild(b); });
    el.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('on'), 9000);
  }

  const setHash = h => { try { history.replaceState(null, '', h || location.pathname + location.search); } catch (e) {} };
  // Versión formal: HTML estático en index.html (generado por scripts/build.mjs), aquí solo se muestra u oculta
  function openFormal(note){
    if (note){ const n = document.createElement('p'); n.className = 'note'; n.textContent = note; $('#formal .wrap').prepend(n); }
    document.body.classList.add('formal'); window.WORLD && WORLD.pause(); setHash('#formal'); $('#toWorld').focus();
  }
  function closeFormal(){ if (!window.WORLD) return; document.body.classList.remove('formal'); WORLD.resume(); setHash(''); renderer_focus(); }
  const renderer_focus = () => { const c = document.querySelector('#stage canvas'); c && c.focus(); };
  $('#xbtn').onclick = () => openFormal();
  $('#toWorld').onclick = closeFormal;
  if (location.hash === '#formal') openFormal();
  addEventListener('hashchange', () => location.hash === '#formal' ? openFormal() : document.body.classList.contains('formal') && closeFormal());
  function fallback(){ $('#loading') && $('#loading').remove(); $('#toWorld').hidden = true; openFormal('This browser cannot display the 3D world; here is all the content.'); }
  return { show, hide, fallback, toast, openFormal, visited, get current(){ return current; }, set onBeamMode(f){ onBeamMode = f; } };
})();

// Geografía en paralelo con three.js
window.GEO = (async () => {
  const load = src => new Promise((ok, ko) => { const s = document.createElement('script'); s.src = 'assets/vendor/d3/' + src; s.onload = ok; s.onerror = ko; document.head.appendChild(s); });
  const [topo] = await Promise.all([
    fetch('assets/vendor/d3/land-110m.json').then(r => r.json()),
    load('d3-array.min.js').then(() => load('d3-geo.min.js')),
    load('topojson-client.min.js'),
  ]);
  return topojson.feature(topo, topo.objects.land);
})();
window.FALLBACK_TIMER = setTimeout(() => window.WORLD || UI.fallback(), 15000);
