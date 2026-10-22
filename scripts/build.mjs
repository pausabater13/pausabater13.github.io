// Regenera la versión formal estática de index.html a partir de data/content.js.
// Uso: node scripts/build.mjs
// El HTML resultante es lo que ven los buscadores, las vistas previas y quien navega sin JavaScript.
import { readFileSync, writeFileSync } from 'node:fs';
import vm from 'node:vm';

const root = new URL('..', import.meta.url);
const ctx = { window: {} };
vm.runInNewContext(readFileSync(new URL('data/content.js', root), 'utf8'), ctx);
const { PROFILE, PUBS, SECTIONS, ITEMS } = ctx.window;

const link = ([t, u]) => `<a href="${u}" rel="noopener">${t} ↗</a>`;
const links = it => it.links.map(link).join('') + (it.pending ? `<span class="pending">pending: ${it.pending}</span>` : '');

const html = `<div class="wrap">
  <div class="top"><span class="o">formal version</span><button type="button" id="toWorld">← explore the world</button></div>
  <header>
    <h1>${PROFILE.name}</h1>
    <p class="lead">${PROFILE.lead}</p>
    <nav aria-label="Profiles">${PROFILE.links.map(([t, u]) => `<a href="${u}">${t}</a>`).join('')}<a href="mailto:${PROFILE.email}">Email</a></nav>
  </header>
  <section aria-labelledby="h-pubs">
    <h2 id="h-pubs">Publications</h2>
${PUBS.map(p => `    <p class="pub">${p.authors ? `<span class="m">${p.authors}.</span><br>` : ''}<span class="t">${p.title}.</span><br><span class="m">${p.venue}.</span>${p.links.length ? ` <span class="lk">${p.links.map(link).join('')}</span>` : ''}</p>`).join('\n')}
  </section>
${SECTIONS.map(([cat, title]) => {
  const xs = ITEMS.filter(i => i.cat === cat);
  return xs.length ? `  <section aria-labelledby="h-${cat}">
    <h2 id="h-${cat}">${title}</h2>
${xs.map(it => `    <article class="ent"><div class="y">${it.yr}</div><div><h3>${it.what}</h3><div class="o">${it.place}</div><p>${it.text}</p><div class="lk">${links(it)}</div></div></article>`).join('\n')}
  </section>` : '';
}).filter(Boolean).join('\n')}
  <section aria-labelledby="h-collab" id="contact">
    <h2 id="h-collab">Collaboration</h2>
    <p>${PROFILE.collab}</p>
    <form action="${PROFILE.form}" method="POST">
      <label>Name<input name="name" autocomplete="name" required></label>
      <label>Email<input name="email" type="email" autocomplete="email" required></label>
      <label>Message<textarea name="message" required></textarea></label>
      <button type="submit">Send</button>
    </form>
    <p class="alt">Or write directly to <a href="mailto:${PROFILE.email}">${PROFILE.email}</a>.</p>
  </section>
  <footer>© ${new Date().getFullYear()} ${PROFILE.name}</footer>
</div>`;

const file = new URL('index.html', root);
const page = readFileSync(file, 'utf8');
const re = /(<!-- formal:start -->)[\s\S]*?(<!-- formal:end -->)/;
if (!re.test(page)) throw new Error('index.html: faltan los marcadores formal:start / formal:end');
writeFileSync(file, page.replace(re, `$1\n${html}\n$2`));
console.log(`index.html: versión formal regenerada (${ITEMS.length} lugares, ${PUBS.length} publicaciones)`);
