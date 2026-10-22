// Mundo 3D: planeta, coche (y sus transformaciones), dioramas, brújula y minimapa.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const ITEMS = window.ITEMS, UI = window.UI;
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const coarse = matchMedia('(pointer: coarse)').matches;
const low = coarse || (navigator.hardwareConcurrency || 8) <= 4;
const R = 100, RELIEF = .35, D2R = Math.PI / 180, Y = new THREE.Vector3(0, 1, 0);

// El 3D arranca después de pintar la versión HTML y cede el hilo entre fases (menos bloqueo en móviles)
const pause = () => new Promise(r => requestAnimationFrame(() => setTimeout(r, 0)));
if (document.readyState !== 'complete') await new Promise(r => addEventListener('load', r, { once: true }));
await pause();

// ---------- Renderer ----------
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
} catch (e) { clearTimeout(window.FALLBACK_TIMER); UI.fallback(); throw e; }
renderer.setPixelRatio(Math.min(devicePixelRatio, low ? 1.25 : 1.75));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = !low;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.querySelector('#stage').appendChild(renderer.domElement);
renderer.domElement.tabIndex = 0;
renderer.domElement.setAttribute('aria-label', '3D world: drive with WASD or the arrow keys');

const scene = new THREE.Scene();
scene.background = new THREE.Color('#05070c');
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, .1, 1200);

// ---------- Utilidades ----------
const llToDir = (lon, lat) => { const p = (lon + 180) * D2R, t = (90 - lat) * D2R; return new THREE.Vector3(-Math.cos(p) * Math.sin(t), Math.cos(t), Math.sin(p) * Math.sin(t)); };
const dirToLL = d => { const lat = 90 - Math.acos(THREE.MathUtils.clamp(d.y, -1, 1)) / D2R; let lon = Math.atan2(d.z, -d.x) / D2R - 180; if (lon < -180) lon += 360; return [lon, lat]; };
const mats = {};
const mat = (c, o = {}) => mats[c + JSON.stringify(o)] ||= new THREE.MeshStandardMaterial({ color: c, roughness: .7, metalness: 0, ...o });
const glow = c => mats['g' + c] ||= new THREE.MeshBasicMaterial({ color: c });
function mesh(geo, m, shadow = true){ const o = new THREE.Mesh(geo, m); o.castShadow = shadow; o.receiveShadow = shadow; return o; }

// ---------- Planeta ----------
const land = await window.GEO.catch(() => null);
await pause();
if (!land){ clearTimeout(window.FALLBACK_TIMER); UI.fallback(); throw new Error('geo'); }
const TW = low ? 2048 : 4096, TH = TW / 2;
const colorCv = document.createElement('canvas'); colorCv.width = TW; colorCv.height = TH;
const maskCv = document.createElement('canvas'); maskCv.width = TW; maskCv.height = TH;
{
  const proj = d3.geoEquirectangular().scale(TW / (2 * Math.PI)).translate([TW / 2, TH / 2]).precision(.1);
  const c = colorCv.getContext('2d'), p = d3.geoPath(proj, c);
  const g = c.createLinearGradient(0, 0, 0, TH); g.addColorStop(0, '#0b2333'); g.addColorStop(.5, '#124257'); g.addColorStop(1, '#0b2333');
  c.fillStyle = g; c.fillRect(0, 0, TW, TH);
  c.beginPath(); p(d3.geoGraticule().step([10, 10])()); c.strokeStyle = 'rgba(160,230,255,.07)'; c.lineWidth = TW / 2048; c.stroke();
  const m = maskCv.getContext('2d'), pm = d3.geoPath(proj, m);
  m.fillStyle = '#000'; m.fillRect(0, 0, TW, TH); m.filter = `blur(${TW / 700}px)`; m.beginPath(); pm(land); m.fillStyle = '#fff'; m.fill();
}
const hCv = document.createElement('canvas'); hCv.width = 1024; hCv.height = 512;
hCv.getContext('2d').drawImage(maskCv, 0, 0, 1024, 512);
const hData = hCv.getContext('2d').getImageData(0, 0, 1024, 512).data;
const heightAt = dir => { const [lon, lat] = dirToLL(dir); const x = Math.min(1023, Math.max(0, ((lon + 180) / 360 * 1024) | 0)), y = Math.min(511, Math.max(0, ((90 - lat) / 180 * 512) | 0)); return hData[(y * 1024 + x) * 4] / 255; };

const colorTex = new THREE.CanvasTexture(colorCv); colorTex.colorSpace = THREE.SRGBColorSpace; colorTex.anisotropy = renderer.capabilities.getMaxAnisotropy();
const maskTex = new THREE.CanvasTexture(maskCv);
await pause();
const planet = mesh(new THREE.SphereGeometry(R, low ? 192 : 320, low ? 96 : 160), new THREE.MeshStandardMaterial({ map: colorTex, displacementMap: maskTex, displacementScale: RELIEF, roughness: .92 }), false);
planet.receiveShadow = true; scene.add(planet);
planet.material.onBeforeCompile = sh => {
  sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWp;').replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWp = (modelMatrix * vec4(transformed, 1.)).xyz;');
  sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vWp;\nfloat hh(vec3 p){ return fract(sin(dot(floor(p), vec3(12.9898,78.233,37.719))) * 43758.5453); }')
    .replace('#include <common>', '#include <common>\nuniform sampler2D uMask;')
    .replace('#include <map_fragment>', `#include <map_fragment>
      float m = texture2D(uMask, vMapUv).r;
      float landA = smoothstep(.47, .53, m), shore = smoothstep(.1, .45, m) * (1. - landA);
      float coast = smoothstep(.43, .49, m) * (1. - smoothstep(.51, .6, m));
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(.16, .55, .55), shore * .55);
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(.80, .68, .46) * (.92 + .06 * hh(vWp * 5.) + .05 * hh(vWp * 1.3)), landA);
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(.48, .34, .17), coast * .6);`);
  sh.uniforms.uMask = { value: maskTex };
};

// Atmósfera y estrellas
scene.add(new THREE.Mesh(new THREE.SphereGeometry(R * 1.06, 64, 32), new THREE.ShaderMaterial({
  side: THREE.BackSide, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
  vertexShader: 'varying vec3 n; void main(){ n = normalize(normalMatrix * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }',
  fragmentShader: 'varying vec3 n; void main(){ float i = pow(.72 - dot(n, vec3(0,0,1.)), 4.); gl_FragColor = vec4(vec3(.45,.9,.95) * i, 1.); }',
})));
{
  const g = new THREE.BufferGeometry(), N = 1800, a = new Float32Array(N * 3);
  for (let i = 0; i < N; i++){ const v = new THREE.Vector3().randomDirection().multiplyScalar(500 + Math.random() * 300); a.set([v.x, v.y, v.z], i * 3); }
  g.setAttribute('position', new THREE.BufferAttribute(a, 3));
  scene.add(new THREE.Points(g, new THREE.PointsMaterial({ color: '#9fb3c8', size: 1.4, sizeAttenuation: false, transparent: true, opacity: .7 })));
}

// Luz: un "sol" que acompaña al coche para mantener sombras nítidas cerca
scene.add(new THREE.HemisphereLight('#b9dcff', '#3a2a1a', 1.1));
const sun = new THREE.DirectionalLight('#fff0d6', 2.4);
sun.castShadow = !low; sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -16, right: 16, top: 16, bottom: -16, near: 1, far: 80 });
sun.shadow.bias = -.0004; sun.shadow.normalBias = .03;
scene.add(sun, sun.target);

// ---------- Simulaciones reutilizadas como texturas ----------
function makeBeam(){
  const GW = 160, GH = 96, L = 40, WY = 24, N = 32, A = 7, K = 2 * Math.PI;
  const cv = document.createElement('canvas'); cv.width = GW; cv.height = GH;
  const ctx = cv.getContext('2d'), img = ctx.createImageData(GW, GH), re = new Float32Array(GW * GH), im = new Float32Array(GW * GH);
  const ey = Array.from({ length: N }, (_, n) => -A + 2 * A * n / (N - 1)), w = ey.map((_, n) => .5 - .5 * Math.cos(2 * Math.PI * (n + .5) / N));
  const curveA = 1.3 * (WY / 2 - A) / (L * L);
  const s = { mode: 'bessel', obs: { x: 14, y: 0, r: 1.4 }, norm: 1, dirty: true, L, WY };
  function phases(){
    if (s.mode === 'focus') return ey.map(y => -K * (Math.hypot(y, 20) - 20));
    if (s.mode === 'bessel') return ey.map(y => -K * Math.sin(.25) * Math.abs(y));
    let acc = 0, prev = ey[0]; return ey.map(y => { acc += -K * Math.sin(Math.atan(2 * Math.sqrt(curveA * (y + A)))) * (y - prev); prev = y; return acc; });
  }
  function solve(){
    const ph = phases(), o = s.obs; let mx = 0;
    for (let j = 0; j < GH; j++){ const y = -WY / 2 + (j + .5) * WY / GH;
      for (let i = 0; i < GW; i++){ const x = (i + .5) * L / GW; let sr = 0, si = 0;
        for (let n = 0; n < N; n++){ const dy = y - ey[n];
          if (x > o.x - o.r){ const t = Math.max(0, Math.min(1, (o.x * x + (o.y - ey[n]) * dy) / (x * x + dy * dy))); const px = t * x - o.x, py = ey[n] + t * dy - o.y; if (px * px + py * py < o.r * o.r) continue; }
          const r = Math.hypot(x, dy), a = w[n] / Math.sqrt(r), p = K * r + ph[n]; sr += a * Math.cos(p); si += a * Math.sin(p); }
        const k = j * GW + i; re[k] = sr; im[k] = si; if (x > 6){ const m = sr * sr + si * si; if (m > mx) mx = m; } } }
    s.norm = 1 / Math.sqrt(mx || 1); s.dirty = false;
  }
  s.setMode = m => { s.mode = m; s.obs.x = m === 'airy' ? 18 : 14; s.obs.y = m === 'airy' ? -A - curveA * 324 : 0; s.dirty = true; };
  s.canvas = cv;
  s.draw = t => {
    if (s.dirty) solve();
    const cs = Math.cos(t * 4), sn = Math.sin(t * 4), d = img.data;
    for (let k = 0; k < GW * GH; k++){
      let v = reduce ? Math.hypot(re[k], im[k]) * s.norm : (re[k] * cs + im[k] * sn) * s.norm; v = Math.max(-1, Math.min(1, v));
      const p = v > 0 ? v ** .8 : 0, q = v < 0 ? (-v) ** .8 : 0;
      d[k*4] = 110 * p + 255 * q; d[k*4+1] = 231 * p + 180 * q; d[k*4+2] = 216 * p + 84 * q; d[k*4+3] = 255;
    }
    ctx.putImageData(img, 0, 0);
  };
  return s;
}
function makeChips(){
  const CX = 32, CY = 32, cv = document.createElement('canvas'); cv.width = CX * 8; cv.height = CY * 8;
  const ctx = cv.getContext('2d'), T = [];
  for (let j = 0; j < CY; j++) for (let i = 0; i < CX; i++){ const u = i / CX, v = j / CY;
    const r1 = .55 + .12 * Math.sin(u * 7) + .06 * Math.sin(u * 19 + 1), r2 = .72 + .07 * Math.sin(u * 5 + 2), sun = Math.hypot(u - .7, v - .3) < .13;
    T.push(v > r2 ? .16 : v > r1 ? .3 : sun ? 1 : .5 + .35 * v); }
  let noise = T.map(() => Math.random()), lastS = -1;
  return { canvas: cv, draw(t){
    const S = 50, s = reduce ? S : Math.min(S, Math.floor((t * 12) % (S + 30)));
    if (s === lastS) return false; if (s === 0) noise = T.map(() => Math.random()); lastS = s;
    const ab = (s / S) ** 2;
    for (let k = 0; k < T.length; k++){ const i = k % CX, j = (k / CX) | 0;
      const v = Math.max(0, Math.min(1, Math.sqrt(ab) * T[k] + Math.sqrt(1 - ab) * noise[(k * 7 + s * 13) % T.length]));
      ctx.fillStyle = s < S && Math.random() < .03 ? '#ffffff' : `rgb(${30 + 225 * v},${30 + 160 * v},${40 + 50 * v})`;
      ctx.fillRect(i * 8 + 1, j * 8 + 1, 6, 6); }
    return true; } };
}

// ---------- Dioramas ----------
const stations = [];
const BASE = mat('#1b2531', { roughness: .5 }), STONE = mat('#d7cdb8'), DARK = mat('#262c34', { roughness: .4, metalness: .3 });
function place(obj, dir, lift = 0){ const h = heightAt(dir) * RELIEF; obj.position.copy(dir).multiplyScalar(R + h + lift); obj.quaternion.setFromUnitVectors(Y, dir); }

const builders = {
  beam(g, s){
    const rig = new THREE.Group(); g.add(rig);
    const mast = mesh(new THREE.BoxGeometry(.14, 2.8, .14), DARK); mast.position.set(-2.3, 1.7, 0); rig.add(mast);
    for (let i = 0; i < 8; i++){ const e = mesh(new THREE.BoxGeometry(.26, .12, .26), mat('#e6ebf0', { metalness: .5, roughness: .3 })); e.position.set(-2.3, .55 + i * .3, 0); rig.add(e); }
    s.beam = makeBeam(); const tex = new THREE.CanvasTexture(s.beam.canvas); tex.colorSpace = THREE.SRGBColorSpace;
    const holo = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 2.76), new THREE.MeshBasicMaterial({ map: tex, color: new THREE.Color(1.8, 1.8, 1.8), toneMapped: false, transparent: true, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false }));
    holo.position.set(0, 1.7, 0); rig.add(holo);
    const ob = mesh(new THREE.SphereGeometry(.17, 20, 12), mat('#ffb454', { emissive: '#6b3a00' })); rig.add(ob);
    const camL = new THREE.Vector3();
    UI.onBeamMode = m => s.beam.setMode(m);
    s.update = t => { camL.copy(camera.position); g.worldToLocal(camL); rig.rotation.y = Math.atan2(camL.x, camL.z); s.beam.draw(t); tex.needsUpdate = true; const o = s.beam.obs; ob.position.set(-2.3 + o.x / s.beam.L * 4.6, 1.7 - o.y / s.beam.WY * 2.76, 0); };
  },
  chip(g, s){
    const pcb = mesh(new THREE.BoxGeometry(3, .12, 3), mat('#1f4d3a')); pcb.position.y = .2; g.add(pcb);
    const die = mesh(new RoundedBoxGeometry(2.2, .3, 2.2, 2, .06), DARK); die.position.y = .42; g.add(die);
    for (let i = 0; i < 12; i++) for (const sd of [-1, 1]){ const pin = mesh(new THREE.BoxGeometry(.08, .05, .25), mat('#d9b25a', { metalness: .8, roughness: .3 }), false);
      pin.position.set(-1 + i * .18, .29, sd * 1.25); g.add(pin); const p2 = pin.clone(); p2.rotation.y = Math.PI / 2; p2.position.set(sd * 1.25, .29, -1 + i * .18); g.add(p2); }
    const ch = makeChips(), tex = new THREE.CanvasTexture(ch.canvas); tex.colorSpace = THREE.SRGBColorSpace; tex.magFilter = THREE.NearestFilter;
    const top = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 1.9), new THREE.MeshBasicMaterial({ map: tex })); top.rotation.x = -Math.PI / 2; top.position.y = .575; g.add(top);
    s.update = t => { if (ch.draw(t)) tex.needsUpdate = true; };
  },
  face(g, s){
    const P = [];
    for (let i = 0; i < 2600; i++){ const th = Math.acos(2 * Math.random() - 1), ph = 2 * Math.PI * Math.random();
      let x = .78 * Math.sin(th) * Math.cos(ph), y = Math.cos(th), z = .9 * Math.sin(th) * Math.sin(ph);
      if (z > 0){ z += .28 * Math.exp(-((x / .11) ** 2 + ((y + .05) / .26) ** 2)); for (const ex of [-.3, .3]) z -= .14 * Math.exp(-(((x - ex) / .14) ** 2 + ((y - .2) / .08) ** 2)); z -= .07 * Math.exp(-((x / .24) ** 2 + ((y + .45) / .04) ** 2)); }
      if (y > -.97) P.push(x, y, z); }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    const col = new Float32Array(P.length); geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({ size: .045, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    pts.scale.setScalar(.95); pts.position.y = 2.2; g.add(pts);
    const glasses = new THREE.Group(); glasses.position.set(0, 2.3, 1.25);
    for (const x of [-.32, .32]){ const r = mesh(new THREE.TorusGeometry(.22, .045, 10, 28), DARK); r.position.x = x; glasses.add(r);
      const l = new THREE.Mesh(new THREE.CircleGeometry(.2, 24), new THREE.MeshBasicMaterial({ color: '#6ee7d8', transparent: true, opacity: .25 })); l.position.x = x; glasses.add(l); }
    const br = mesh(new THREE.BoxGeometry(.2, .04, .04), DARK); glasses.add(br); g.add(glasses);
    const ped = mesh(new THREE.CylinderGeometry(.35, .5, 1, 20), STONE); ped.position.y = .65; g.add(ped);
    const scan = new THREE.Mesh(new THREE.RingGeometry(.2, 1.05, 48), new THREE.MeshBasicMaterial({ color: '#ffb454', transparent: true, opacity: .25, side: THREE.DoubleSide, depthWrite: false }));
    scan.rotation.x = -Math.PI / 2; g.add(scan);
    s.update = t => {
      const a = Math.sin(t * .5) * .9; pts.rotation.y = a; glasses.position.x = Math.sin(a) * 1.25; glasses.position.z = Math.cos(a) * 1.25; glasses.rotation.y = a;
      const sc = reduce ? -1.1 : 1.1 - ((t * .4) % 2.6); scan.position.y = 2.2 + sc * .95;
      for (let i = 0, n = P.length / 3; i < n; i++){ const y = P[i * 3 + 1], near = Math.abs(y - sc) < .05, done = y > sc;
        const k = near ? 1 : done ? .7 : .08; col[i*3] = near ? 1 : .43 * k; col[i*3+1] = near ? 1 : .9 * k; col[i*3+2] = near ? 1 : .85 * k; }
      geo.attributes.color.needsUpdate = true;
    };
  },
  pad(g, s){
    const pad = mesh(new THREE.CylinderGeometry(1.1, 1.1, .06, 32), mat('#2b3644')); pad.position.y = .12; g.add(pad);
    for (const [w, d, x] of [[.12, .9, -.25], [.12, .9, .25], [.5, .12, 0]]){ const b = mesh(new THREE.BoxGeometry(w, .02, d), glow('#ffb454'), false); b.position.set(x, .16, 0); g.add(b); }
  },
  track(g, s){
    const tr = mesh(new THREE.TorusGeometry(1.25, .2, 8, 64), mat('#30353d')); tr.rotation.x = Math.PI / 2; tr.scale.z = .25; tr.position.y = .15; g.add(tr);
    const kerb = mesh(new THREE.TorusGeometry(1.48, .04, 6, 64), mat('#ff5a36'), false); kerb.rotation.x = Math.PI / 2; kerb.position.y = .17; g.add(kerb);
    const car = new THREE.Group(); const b = mesh(new RoundedBoxGeometry(.22, .1, .45, 2, .04), mat('#ff5a36', { roughness: .4 })); b.position.y = .26; car.add(b);
    const w = mesh(new THREE.BoxGeometry(.3, .03, .08), DARK); w.position.set(0, .3, -.2); car.add(w); g.add(car);
    const flag = mesh(new THREE.BoxGeometry(.03, .9, .03), STONE); flag.position.set(1.7, .6, 0); g.add(flag);
    const cv = document.createElement('canvas'); cv.width = 8; cv.height = 4; const c = cv.getContext('2d'); for (let i = 0; i < 8; i++) for (let j = 0; j < 4; j++){ c.fillStyle = (i + j) % 2 ? '#111' : '#eee'; c.fillRect(i, j, 1, 1); }
    const ft = new THREE.CanvasTexture(cv); ft.magFilter = THREE.NearestFilter;
    const fl = new THREE.Mesh(new THREE.PlaneGeometry(.5, .25), new THREE.MeshBasicMaterial({ map: ft, side: THREE.DoubleSide })); fl.position.set(1.95, .92, 0); g.add(fl);
    s.update = t => { const a = t * 1.6; car.position.set(Math.cos(a) * 1.25, 0, -Math.sin(a) * 1.25); car.rotation.y = a; fl.rotation.y = Math.sin(t * 3) * .3; };
  },
  orchard(g, s){
    const leaf = mat('#3f8a4a', { flatShading: true }), trunk = mat('#6b4a2e'), fruit = mat('#ff9a2e', { emissive: '#3a1a00' });
    const canopy = new THREE.IcosahedronGeometry(.34, 1);
    for (let r = -1; r <= 1; r++) for (let c = -1; c <= 1; c++){
      const x = c * .9, z = r * .9, tr = mesh(new THREE.CylinderGeometry(.05, .07, .35, 6), trunk); tr.position.set(x, .3, z); g.add(tr);
      const cn = mesh(canopy, leaf); cn.position.set(x, .62, z); cn.rotation.y = Math.random() * 3; g.add(cn);
      for (let k = 0; k < 4; k++){ const f = mesh(new THREE.SphereGeometry(.06, 8, 6), fruit, false); const d = new THREE.Vector3().randomDirection(); d.y = Math.abs(d.y) * .6; f.position.set(x, .62, z).addScaledVector(d.normalize(), .33); g.add(f); }
    }
    const bot = new THREE.Group(); const body = mesh(new RoundedBoxGeometry(.32, .16, .42, 2, .05), mat('#eef1f4', { roughness: .4 })); body.position.y = .22; bot.add(body);
    const eye = mesh(new THREE.BoxGeometry(.2, .05, .02), glow('#6ee7d8'), false); eye.position.set(0, .26, .22); bot.add(eye); g.add(bot);
    s.update = t => { const u = (t * .12) % 1, lane = u < .5 ? -.45 : .45, x = u < .5 ? -1.4 + u * 5.6 : 1.4 - (u - .5) * 5.6; bot.position.set(x, 0, lane); bot.rotation.y = u < .5 ? Math.PI / 2 : -Math.PI / 2; };
  },
  math(g, s){
    const ped = mesh(new RoundedBoxGeometry(1.1, .9, 1.1, 2, .08), STONE); ped.position.y = .55; g.add(ped);
    const solids = [[new THREE.IcosahedronGeometry(.32), '#6ee7d8'], [new THREE.TorusKnotGeometry(.2, .07, 80, 10), '#ffb454'], [new THREE.OctahedronGeometry(.3), '#eef1f4']]
      .map(([geo, c]) => { const m = mesh(geo, mat(c, { flatShading: true, roughness: .35, metalness: .2 })); g.add(m); return m; });
    s.update = t => solids.forEach((m, i) => { const a = t * .7 + i * 2.09; m.position.set(Math.cos(a) * .75, 1.55 + Math.sin(t * 1.3 + i) * .12, Math.sin(a) * .75); m.rotation.set(t * .8 + i, t * .6, 0); });
  },
  lab(g, s){
    const b = mesh(new RoundedBoxGeometry(1.8, 1.2, 1.3, 2, .08), mat('#dfe5ec')); b.position.y = .75; g.add(b);
    for (let i = 0; i < 4; i++){ const w = mesh(new THREE.BoxGeometry(.28, .5, .02), glow('#ffd9a0'), false); w.position.set(-.6 + i * .4, .8, .66); g.add(w); }
    const dish = mesh(new THREE.SphereGeometry(.45, 20, 10, 0, Math.PI * 2, 0, Math.PI / 3), mat('#eef1f4', { side: THREE.DoubleSide })); dish.position.set(.4, 1.75, 0); dish.rotation.x = -Math.PI * .75; g.add(dish);
    s.update = t => dish.rotation.z = Math.sin(t * .4) * .6;
  },
  returns(g, s){
    const ring = mesh(new THREE.TorusGeometry(1.15, .06, 6, 64), mat('#3a4452')); ring.rotation.x = Math.PI / 2; ring.position.y = .2; g.add(ring);
    const arch = mesh(new THREE.TorusGeometry(.42, .06, 8, 24, Math.PI), mat('#6ee7d8', { emissive: '#0d3b36' })); arch.position.set(1.15, .2, 0); arch.rotation.y = Math.PI / 2; g.add(arch);
    const card = mat('#c8935a'), bad = mat('#ff4d4d', { emissive: '#5a0000' });
    const boxes = Array.from({ length: 7 }, () => { const b = mesh(new RoundedBoxGeometry(.3, .24, .3, 1, .03), card); g.add(b); return b; });
    s.update = t => boxes.forEach((b, i) => { const a = t * .5 + i * Math.PI * 2 / 7; b.position.set(Math.cos(a) * 1.15, .36, Math.sin(a) * 1.15); b.rotation.y = -a;
      const lap = Math.floor((t * .5 + i * Math.PI * 2 / 7) / (Math.PI * 2)); b.material = (lap * 3 + i) % 7 === 0 && Math.cos(a) > .2 ? bad : card; });
  },
  dome(g, s){
    const b = mesh(new RoundedBoxGeometry(2, .7, 1.1, 2, .05), STONE); b.position.y = .5; g.add(b);
    for (let i = 0; i < 6; i++){ const c = mesh(new THREE.CylinderGeometry(.06, .06, .7, 10), mat('#efe8da')); c.position.set(-.6 + i * .24, 1.2, .5); g.add(c); }
    const top = mesh(new THREE.BoxGeometry(1.5, .12, .9), STONE); top.position.y = 1.6; g.add(top);
    const dome = mesh(new THREE.SphereGeometry(.5, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2), mat('#e9e2d4')); dome.position.y = 1.66; g.add(dome);
  },
  tower(g, s){
    [[.9, 1.1, .55], [.65, .8, 1.5], [.45, .5, 2.15]].forEach(([w, h, y]) => { const b = mesh(new THREE.BoxGeometry(w, h, w), mat('#b9a98f')); b.position.y = y; g.add(b); });
    const tip = mesh(new THREE.ConeGeometry(.36, .6, 4), mat('#8d7d66')); tip.position.y = 2.7; tip.rotation.y = Math.PI / 4; g.add(tip);
  },
  award(g, s){
    const ped = mesh(new THREE.CylinderGeometry(.45, .6, .8, 24), STONE); ped.position.y = .5; g.add(ped);
    const star = mesh(new THREE.OctahedronGeometry(.42), mat('#e8c45a', { metalness: .9, roughness: .25 })); star.position.y = 1.55; g.add(star);
    s.update = t => { star.rotation.y = t * .8; star.position.y = 1.55 + Math.sin(t * 1.5) * .08; };
  },
  macau(g, s){
    const shaft = mesh(new THREE.CylinderGeometry(.08, .16, 3.2, 12), mat('#e6ebf0')); shaft.position.y = 1.7; g.add(shaft);
    const pod = mesh(new THREE.CylinderGeometry(.5, .42, .22, 24), mat('#d0d7df')); pod.position.y = 2.6; g.add(pod);
    const spike = mesh(new THREE.CylinderGeometry(.015, .04, 1, 6), mat('#e6ebf0')); spike.position.y = 3.8; g.add(spike);
    const rings = [0, 1, 2].map(() => { const r = new THREE.Mesh(new THREE.TorusGeometry(.6, .02, 6, 48), new THREE.MeshBasicMaterial({ color: '#6ee7d8', transparent: true })); r.rotation.x = Math.PI / 2; r.position.y = 2.6; g.add(r); return r; });
    s.update = t => rings.forEach((r, i) => { const p = ((t * .4 + i / 3) % 1); r.scale.setScalar(1 + p * 3); r.material.opacity = (1 - p) * .8; });
  },
};

await pause();
const lblBox = document.querySelector('#labels');
for (const it of ITEMS){
  const g = new THREE.Group(), dir = llToDir(...it.at), s = { it, g, dir, update: null, ping: 0 };
  const base = mesh(new THREE.CylinderGeometry(1.75, 1.9, .2, 48), BASE); base.position.y = .02; g.add(base);
  s.ring = new THREE.Mesh(new THREE.TorusGeometry(1.82, .035, 8, 96), new THREE.MeshBasicMaterial({ color: '#6ee7d8', transparent: true, opacity: .25 }));
  s.ring.rotation.x = Math.PI / 2; s.ring.position.y = .13; g.add(s.ring);
  builders[it.kind](g, s); place(g, dir); scene.add(g);
  s.pos = g.position.clone();
  s.label = document.createElement('div'); s.label.className = 'label'; s.name = it.label || it.place.split(' · ')[1]; s.label.textContent = s.name; lblBox.appendChild(s.label);
  stations.push(s);
}

// Dron del IRI (en coordenadas del mundo, para que pueda perseguir al coche)
const iri = stations.find(s => s.it.id === 'iri');
const drone = new THREE.Group();
{
  const body = mesh(new RoundedBoxGeometry(.45, .14, .45, 2, .05), mat('#eef1f4', { roughness: .35 })); drone.add(body);
  const led = mesh(new THREE.BoxGeometry(.16, .04, .02), glow('#6ee7d8'), false); led.position.set(0, 0, .23); drone.add(led);
  drone.rotors = [];
  for (const [x, z] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]){
    const arm = mesh(new THREE.BoxGeometry(.5, .04, .05), DARK); arm.position.set(x * .2, 0, z * .2); arm.rotation.y = Math.atan2(z, x) * -1; drone.add(arm);
    const rot = new THREE.Mesh(new THREE.CylinderGeometry(.2, .2, .01, 20), new THREE.MeshBasicMaterial({ color: '#cfe9ff', transparent: true, opacity: .35 })); rot.position.set(x * .36, .06, z * .36); drone.add(rot); drone.rotors.push(rot);
  }
  drone.traverse(o => o.isMesh && (o.castShadow = true));
  scene.add(drone);
}
const droneHome = iri.dir.clone().multiplyScalar(R + heightAt(iri.dir) * RELIEF + 2.2);
const droneS = { p: droneHome.clone(), v: new THREE.Vector3() };

await pause();
// ---------- Coche ----------
const car = new THREE.Group(), carBody = new THREE.Group(); car.add(carBody); scene.add(car);
const wheels = [];
{
  const paint = mat('#ff5a36', { roughness: .38, metalness: .15 });
  carBody.add(mesh(new RoundedBoxGeometry(1.25, .4, 2.3, 4, .15), paint));
  const cab = mesh(new RoundedBoxGeometry(1.0, .4, 1.0, 4, .16), mat('#3d5a70', { roughness: .1, metalness: .6 })); cab.position.set(0, .36, -.12); carBody.add(cab);
  const roof = mesh(new RoundedBoxGeometry(.86, .08, .8, 2, .04), paint); roof.position.set(0, .58, -.12); carBody.add(roof);
  const wing = mesh(new RoundedBoxGeometry(1.28, .07, .32, 2, .03), paint); wing.position.set(0, .52, -1.02); carBody.add(wing);
  for (const x of [-.45, .45]){ const st = mesh(new THREE.BoxGeometry(.05, .22, .1), DARK); st.position.set(x, .36, -1.02); carBody.add(st); }
  const bump = mesh(new RoundedBoxGeometry(1.2, .16, .2, 2, .06), DARK); bump.position.set(0, -.12, 1.12); carBody.add(bump);
  for (const x of [-.4, .4]){
    const hl = mesh(new THREE.BoxGeometry(.24, .09, .04), glow('#fff4d0'), false); hl.position.set(x, .04, 1.16); carBody.add(hl);
    const tl = mesh(new THREE.BoxGeometry(.24, .07, .04), glow('#ff2a2a'), false); tl.position.set(x, .06, -1.16); carBody.add(tl);
  }
  const ant = mesh(new THREE.CylinderGeometry(.012, .012, .62, 6), DARK); ant.position.set(.33, .85, -.5); carBody.add(ant);
  carBody.tip = new THREE.Mesh(new THREE.SphereGeometry(.05, 10, 8), new THREE.MeshBasicMaterial({ color: '#6ee7d8' })); carBody.tip.position.set(.33, 1.17, -.5); carBody.add(carBody.tip);
  const tyre = new THREE.CylinderGeometry(.3, .3, .26, 24), rim = new THREE.CylinderGeometry(.17, .17, .27, 12);
  for (const [x, z] of [[-.66, .76], [.66, .76], [-.66, -.76], [.66, -.76]]){
    const pivot = new THREE.Group(); pivot.position.set(x, -.14, z); car.add(pivot);
    const w = new THREE.Group(); w.add(mesh(tyre, mat('#18191d', { roughness: .95 }))); w.add(mesh(rim, mat('#c9ced6', { metalness: .7, roughness: .3 })));
    w.children.forEach(m => m.rotation.z = Math.PI / 2); pivot.add(w); wheels.push({ pivot, w, front: z > 0 });
  }
}
const modelCar = new THREE.Group(); while (car.children.length) modelCar.add(car.children[0]); car.add(modelCar);

// Monoplaza de Formula Student (colores neutros, no la librea real del equipo)
const modelFS = new THREE.Group(), fsWheels = [];
{
  const white = mat('#eef1f4', { roughness: .35 }), teal = mat('#14a394', { roughness: .4 });
  const add = (geo, m, x, y, z) => { const o = mesh(geo, m); o.position.set(x, y, z); modelFS.add(o); return o; };
  add(new RoundedBoxGeometry(.62, .3, 2.2, 3, .1), white, 0, -.16, -.05);
  add(new RoundedBoxGeometry(.36, .18, 1.0, 2, .07), white, 0, -.22, 1.45);
  for (const x of [-.47, .47]) add(new RoundedBoxGeometry(.34, .26, 1.0, 2, .08), teal, x, -.18, -.25);
  add(new THREE.BoxGeometry(.36, .05, .62), DARK, 0, .0, .15);
  add(new THREE.SphereGeometry(.15, 16, 12), mat('#ffb454', { roughness: .3 }), 0, .1, .1);
  add(new THREE.BoxGeometry(.5, .32, .07), DARK, 0, .14, -.32);
  add(new RoundedBoxGeometry(1.6, .04, .32, 1, .015), teal, 0, -.39, 1.98);
  for (const x of [-.8, .8]) add(new THREE.BoxGeometry(.03, .16, .34), DARK, x, -.33, 1.98);
  add(new RoundedBoxGeometry(1.25, .06, .36, 1, .02), teal, 0, .46, -1.25);
  for (const x of [-.62, .62]) add(new THREE.BoxGeometry(.03, .3, .4), DARK, x, .36, -1.25);
  add(new THREE.BoxGeometry(.08, .5, .08), DARK, 0, .18, -1.15);
  const tyre = new THREE.CylinderGeometry(.31, .31, .34, 24), rim = new THREE.CylinderGeometry(.18, .18, .35, 12);
  for (const [x, z] of [[-.82, .98], [.82, .98], [-.84, -.82], [.84, -.82]]){
    const pivot = new THREE.Group(); pivot.position.set(x, -.14, z); modelFS.add(pivot);
    const w = new THREE.Group(); w.add(mesh(tyre, mat('#18191d', { roughness: .95 }))); w.add(mesh(rim, mat('#c9ced6', { metalness: .7, roughness: .3 })));
    w.children.forEach(m => m.rotation.z = Math.PI / 2); pivot.add(w); fsWheels.push({ pivot, w, front: z > 0 });
  }
}
modelFS.visible = false; car.add(modelFS);

// Dron (versión grande del del IRI)
const modelDrone = new THREE.Group(); modelDrone.rotors = [];
{
  const body = mesh(new RoundedBoxGeometry(.8, .24, .8, 2, .08), mat('#eef1f4', { roughness: .35 })); modelDrone.add(body);
  const led = mesh(new THREE.BoxGeometry(.3, .06, .02), glow('#6ee7d8'), false); led.position.set(0, 0, .41); modelDrone.add(led);
  for (const [x, z] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]){
    const arm = mesh(new THREE.BoxGeometry(.9, .06, .08), DARK); arm.position.set(x * .36, 0, z * .36); arm.rotation.y = -Math.atan2(z, x); modelDrone.add(arm);
    const motor = mesh(new THREE.CylinderGeometry(.07, .07, .12, 12), DARK); motor.position.set(x * .66, .06, z * .66); modelDrone.add(motor);
    const rot = new THREE.Mesh(new THREE.CylinderGeometry(.36, .36, .012, 24), new THREE.MeshBasicMaterial({ color: '#cfe9ff', transparent: true, opacity: .35 })); rot.position.set(x * .66, .13, z * .66); modelDrone.add(rot); modelDrone.rotors.push(rot);
  }
  for (const x of [-.25, .25]){ const leg = mesh(new THREE.BoxGeometry(.04, .3, .6), DARK); leg.position.set(x, -.24, 0); modelDrone.add(leg); }
}
modelDrone.visible = false; car.add(modelDrone);
car.traverse(o => { if (o.isMesh) o.castShadow = true; });

const MODES = {
  car:   { m: modelCar,   vmax: 16, boost: 28, acc: 18, yaw: 2.1, lift: .45 },
  fs:    { m: modelFS,    vmax: 24, boost: 36, acc: 26, yaw: 2.6, lift: .45 },
  drone: { m: modelDrone, vmax: 18, boost: 28, acc: 12, yaw: 1.7, lift: 3.0 },
};
let mode = 'car', morph = null, lift = .45;
const TRIGGERS = { terrassa: 'fs', iri: 'drone' }, armed = { terrassa: true, iri: true };
const MODE_TEXT = {
  fs: ['Race car mode', 'You turned into a Formula Student car like UPC EcoRacing’s: more grip, more speed.', 'terrassa'],
  drone: ['Drone mode', 'You now fly like the IRI drone: a controller with inertia keeps you hovering.', 'iri'],
};
function setMode(m){
  if (m === mode || (morph && morph.to === m)) return;
  morph = { to: m, t: reduce ? 1 : 0, swapped: false };
  emitWave(); burst = 1;
  if (MODE_TEXT[m]){ const [title, text, base] = MODE_TEXT[m];
    UI.toast(title, text, [['See the base', () => { WORLD.goTo(base); }, true], ['Back to the car', () => setMode('car')]]); }
}
let burst = 0;

// Estado del coche: posición en la esfera (dirección), rumbo tangente y velocidad
const start = llToDir(-1.2, 36.9);
const st = { n: start.clone(), f: new THREE.Vector3(), v: 0, steer: 0, ride: 0, auto: null };
st.f.copy(llToDir(-1.2, 38.0)).sub(start).projectOnPlane(st.n).normalize();

// ---------- Entrada ----------
const keys = new Set();
addEventListener('keydown', e => {
  if (document.body.classList.contains('formal')) return;
  const k = e.key.toLowerCase();
  if ((k === ' ' || k === 'enter') && e.target.closest && e.target.closest('button,a,input')) return;
  if (['arrowup','arrowdown','arrowleft','arrowright',' ','w','a','s','d','shift'].includes(k)){
    keys.add(k); if (k !== 'shift') st.auto = null; if (k.startsWith('arrow') || k === ' ') e.preventDefault();
    if (k === ' ' && !e.repeat) emitWave();
  }
});
addEventListener('keyup', e => keys.delete(e.key.toLowerCase()));
addEventListener('blur', () => keys.clear());
document.querySelector('#wave').addEventListener('click', () => emitWave());

const joy = document.querySelector('#joy'), touch = { id: null, o: null, v: [0, 0] };
let orbit = 0, dist = 11, drag = null;
const cvs = renderer.domElement;
cvs.addEventListener('pointerdown', e => {
  if (e.pointerType === 'mouse'){ drag = { x: e.clientX, o: orbit }; cvs.setPointerCapture(e.pointerId); return; }
  touch.id = e.pointerId; touch.o = [e.clientX, e.clientY]; touch.v = [0, 0]; st.auto = null;
  joy.style.display = 'block'; joy.style.left = e.clientX + 'px'; joy.style.top = e.clientY + 'px'; joy.firstChild.style.transform = ''; cvs.setPointerCapture(e.pointerId);
});
cvs.addEventListener('pointermove', e => {
  if (drag){ orbit = drag.o - (e.clientX - drag.x) * .006; return; }
  if (e.pointerId !== touch.id) return;
  const dx = e.clientX - touch.o[0], dy = e.clientY - touch.o[1], m = Math.min(1, Math.hypot(dx, dy) / 42), a = Math.atan2(dy, dx);
  touch.v = [Math.cos(a) * m, Math.sin(a) * m]; joy.firstChild.style.transform = `translate(${touch.v[0] * 28}px,${touch.v[1] * 28}px)`;
});
const endTouch = e => { if (drag){ drag = null; return; } if (e.pointerId === touch.id){ touch.id = null; touch.v = [0, 0]; joy.style.display = 'none'; } };
cvs.addEventListener('pointerup', endTouch); cvs.addEventListener('pointercancel', endTouch);
cvs.addEventListener('wheel', e => { e.preventDefault(); dist = THREE.MathUtils.clamp(dist + e.deltaY * .01, 6, 24); }, { passive: false });
cvs.addEventListener('dblclick', () => orbit = 0);

// ---------- Ondas emitidas por la antena del coche ----------
const waves = [];
function emitWave(){
  const m = new THREE.Mesh(new THREE.RingGeometry(.92, 1, 96), new THREE.MeshBasicMaterial({ color: '#6ee7d8', transparent: true, side: THREE.DoubleSide, depthWrite: false }));
  m.position.copy(car.position).addScaledVector(st.n, -.2); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), st.n); scene.add(m);
  waves.push({ m, t: 0, o: car.position.clone() });
}

// ---------- Partículas (polvo en tierra, espuma en el mar) ----------
const PN = low ? 60 : 140, parts = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(.09, 0), new THREE.MeshStandardMaterial({ roughness: 1 }), PN);
parts.instanceMatrix.setUsage(THREE.DynamicDrawUsage); scene.add(parts);
const pState = Array.from({ length: PN }, () => ({ life: 0, p: new THREE.Vector3(), v: new THREE.Vector3() }));
const cyanC = new THREE.Color('#6ee7d8'), sand = new THREE.Color('#d8c49b'), foam = new THREE.Color('#d6f3ff'), tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpS = new THREE.Vector3();
let pi = 0, pAcc = 0;
for (let i = 0; i < PN; i++){ parts.setMatrixAt(i, tmpM.makeScale(0, 0, 0)); parts.setColorAt(i, sand); }

// ---------- Ir a un lugar (piloto automático) ----------
let arcs = null;
function setArcs(s){
  if (arcs){ scene.remove(arcs); arcs.traverse(o => o.geometry && o.geometry.dispose()); arcs = null; }
  if (!s || !s.it.rel) return;
  arcs = new THREE.Group();
  for (const id of s.it.rel){
    const o = stations.find(x => x.it.id === id); if (!o) continue;
    const a = s.dir, b = o.dir, w = a.angleTo(b), pts = [];
    for (let i = 0; i <= 96; i++){ const u = i / 96, v = a.clone().multiplyScalar(Math.sin((1 - u) * w)).addScaledVector(b, Math.sin(u * w)).divideScalar(Math.sin(w));
      pts.push(v.multiplyScalar(R + 1 + Math.sin(Math.PI * u) * Math.min(14, w * R * .14))); }
    const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineDashedMaterial({ color: '#ffb454', dashSize: .7, gapSize: .45, transparent: true, opacity: .8 }));
    l.computeLineDistances(); arcs.add(l);
  }
  scene.add(arcs);
}
window.WORLD = { pause(){ renderer.setAnimationLoop(null); keys.clear(); }, resume(){ clock.getDelta(); renderer.setAnimationLoop(frame); }, setMode: m => setMode(m), goTo(id){
  const s = stations.find(x => x.it.id === id); if (!s) return;
  if (reduce){ st.n.copy(s.dir).applyAxisAngle(new THREE.Vector3().crossVectors(s.dir, Y).normalize(), -4.2 / R).normalize(); st.f.copy(s.dir).sub(st.n).projectOnPlane(st.n).normalize(); st.v = 0; snap = true; return; }
  st.auto = s;
} };
clearTimeout(window.FALLBACK_TIMER);

// ---------- Brújula con iconos en el horizonte ----------
const ICONS = {
  orchard:'<path d="M8 15V9"/><circle cx="8" cy="6" r="4.5"/>', math:'<path d="M12 2H4l4 6-4 6h8"/>', track:'<path d="M3 15V2h9l-2 3 2 3H3"/>',
  pad:'<rect x="6" y="6" width="4" height="4"/><path d="M6 6L3 3M10 6l3-3M6 10l-3 3M10 10l3 3"/>', chip:'<rect x="4" y="4" width="8" height="8"/><path d="M6 1v3M10 1v3M6 12v3M10 12v3M1 6h3M1 10h3M12 6h3M12 10h3"/>',
  face:'<circle cx="4.5" cy="9" r="2.5"/><circle cx="11.5" cy="9" r="2.5"/><path d="M7 9h2"/>', lab:'<path d="M2 14h12M3 14V6h10v8M6 9h1M9 9h1M6 11h1M9 11h1"/>',
  returns:'<path d="M2 5l6-3 6 3v6l-6 3-6-3zM2 5l6 3 6-3M8 8v6"/>', beam:'<path d="M4 15V3M2 5h4M2 8h4M8 6c2 1 4 1 6 1M8 10c2-1 4-1 6-1"/>',
  dome:'<path d="M2 14h12M3 14v-4h10v4M4 10a4 4 0 0 1 8 0"/>', tower:'<path d="M5 14V6h6v8M6 6l2-4 2 4M3 14h10"/>',
  award:'<path d="M8 1.5l2 4 4.3.6-3.1 3 .8 4.4L8 11.4l-4 2.1.8-4.4-3.1-3 4.3-.6z"/>', macau:'<path d="M8 15V3M6 6h4M3.5 4a6 6 0 0 1 0 6M12.5 4a6 6 0 0 0 0 6"/>',
};
const compass = document.querySelector('#compass'), cEls = [];
['N','NE','E','SE','S','SO','O','NO'].forEach((l, i) => { const e = document.createElement('span'); e.className = 'cl' + (i ? '' : ' n'); e.textContent = l; compass.appendChild(e); cEls.push([e, i * 45]); });
for (let a = 0; a < 360; a += 15){ const e = document.createElement('i'); e.className = 'tick' + (a % 45 ? '' : ' big'); compass.appendChild(e); cEls.push([e, a]); }
for (const s of stations){
  const b = document.createElement('button'); b.className = 'mk'; b.type = 'button'; b.title = s.it.place;
  b.innerHTML = `<svg viewBox="0 0 16 16" aria-hidden="true">${ICONS[s.it.kind]}</svg><span class="sr">${s.it.place}, </span><span></span>`;
  b.removeAttribute('title'); b.onclick = () => WORLD.goTo(s.it.id);
  compass.appendChild(b); s.mk = b; s.mkTxt = b.lastChild;
}
const nT = new THREE.Vector3(), eT = new THREE.Vector3(), dT = new THREE.Vector3();
const wrap180 = a => ((a + 540) % 360) - 180;
const bearingOf = v => { dT.copy(v).projectOnPlane(st.n); return Math.atan2(dT.dot(eT), dT.dot(nT)) / D2R; };
let heading = 0;
function updateCompass(){
  nT.copy(Y).projectOnPlane(st.n).normalize(); eT.crossVectors(nT, st.n);
  heading = bearingOf(st.f);
  const W = compass.clientWidth, k = W / 200;
  for (const [e, a] of cEls){ const r = wrap180(a - heading); e.style.transform = `translateX(${W / 2 + r * k}px)`; e.style.visibility = Math.abs(r) < 100 ? 'visible' : 'hidden'; }
  // El más cercano gana cuando varios quedan en la misma dirección
  const placed = [];
  for (const s of [...stations].sort((a, b) => a.d - b.d)){
    const r = wrap180(bearingOf(s.dir) - heading), km = Math.round(st.n.angleTo(s.dir) * 6371), x = W / 2 + r * k;
    const free = !placed.some(px => Math.abs(px - x) < 44), show = Math.abs(r) < 98 && km > 60 && free;
    if (show) placed.push(x);
    s.mk.style.transform = `translateX(${x}px) translateX(-50%)`;
    s.mk.style.visibility = show ? 'visible' : 'hidden';
    const txt = km.toLocaleString('en-US') + ' km'; if (s.mkTxt.textContent !== txt) s.mkTxt.textContent = txt;
    s.mk.classList.toggle('seen', UI.visited.has(s.it.id));
  }
}

// ---------- Minimapa (rumbo arriba) ----------
const mm = document.querySelector('#minimap'), mctx = mm.getContext('2d');
const mproj = d3.geoOrthographic().clipAngle(90).precision(2), mpath = d3.geoPath(mproj, mctx), mgrat = d3.geoGraticule10();
let mmFrame = 0, mmSign = 0, mmPts = [];
function drawMini(){
  const S = mm.clientWidth, dpr = Math.min(devicePixelRatio, 2);
  if (mm.width !== Math.round(S * dpr)){ mm.width = mm.height = Math.round(S * dpr); }
  mctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const [lon, lat] = dirToLL(st.n);
  const ahead = dirToLL(tmp.copy(st.n).addScaledVector(st.f, .05).normalize());
  mproj.scale(S / 2 / Math.sin(30 * D2R)).translate([S / 2, S / 2]);
  if (!mmSign){ mproj.rotate([-lon, -lat, heading]); mmSign = mproj(ahead)[1] < S / 2 ? 1 : -1; }
  mproj.rotate([-lon, -lat, mmSign * heading]);
  mctx.clearRect(0, 0, S, S); mctx.save(); mctx.beginPath(); mctx.arc(S / 2, S / 2, S / 2 - 1, 0, 7); mctx.clip();
  mctx.fillStyle = '#0d2c3c'; mctx.fillRect(0, 0, S, S);
  mctx.beginPath(); mpath(mgrat); mctx.strokeStyle = 'rgba(160,230,255,.08)'; mctx.lineWidth = 1; mctx.stroke();
  mctx.beginPath(); mpath(land); mctx.fillStyle = '#d9c8a2'; mctx.fill();
  mmPts = [];
  for (const s of stations){
    if (d3.geoDistance(s.it.at, [lon, lat]) > 1.45) continue;
    const [x, y] = mproj(s.it.at); mmPts.push([x, y, s]);
    mctx.beginPath(); mctx.arc(x, y, s === active ? 4.5 : 3.2, 0, 7); mctx.fillStyle = UI.visited.has(s.it.id) ? '#6ee7d8' : '#ffb454'; mctx.fill();
    mctx.lineWidth = 1.5; mctx.strokeStyle = '#081620'; mctx.stroke();
  }
  mctx.translate(S / 2, S / 2); mctx.beginPath(); mctx.moveTo(0, -7); mctx.lineTo(5, 6); mctx.lineTo(0, 3); mctx.lineTo(-5, 6); mctx.closePath();
  mctx.fillStyle = '#ff5a36'; mctx.fill(); mctx.strokeStyle = '#fff'; mctx.lineWidth = 1.2; mctx.stroke();
  mctx.restore();
}
mm.addEventListener('click', e => {
  const b = mm.getBoundingClientRect(), x = e.clientX - b.left, y = e.clientY - b.top;
  let best = null, bd = 14; for (const [px, py, s] of mmPts){ const d = Math.hypot(px - x, py - y); if (d < bd){ bd = d; best = s; } }
  if (best) WORLD.goTo(best.it.id);
});

await pause();
// ---------- Bucle ----------
const clock = new THREE.Clock();
let active = null, snap = true, intro = reduce ? 0 : 1;
const vRight = new THREE.Vector3(), basisM = new THREE.Matrix4(), tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3(), camTarget = new THREE.Vector3(), lookAt = new THREE.Vector3();
camera.position.copy(start).multiplyScalar(R * 3.2); camera.up.copy(Y);

function step(dt, t){
  // --- Control ---
  let thr = 0, steer = 0;
  const k = n => keys.has(n);
  thr += (k('w') || k('arrowup') ? 1 : 0) - (k('s') || k('arrowdown') ? 1 : 0);
  steer += (k('d') || k('arrowright') ? 1 : 0) - (k('a') || k('arrowleft') ? 1 : 0);
  if (touch.id !== null){ thr = -touch.v[1]; steer = touch.v[0]; }
  const boost = k('shift');
  if (st.auto){
    const T = st.auto.dir, d = tmp.copy(T).projectOnPlane(st.n).normalize();
    const ang = Math.atan2(tmp2.crossVectors(st.f, d).dot(st.n), st.f.dot(d)), rem = st.n.angleTo(T) * R;
    steer = THREE.MathUtils.clamp(-ang * 2.2, -1, 1);
    // Velocidad deseada: baja al girar y al acercarse, para no orbitar alrededor del destino
    const vdes = rem < 4.4 ? 0 : Math.min(45, rem * 1.3 + 3) * Math.max(.12, Math.cos(Math.min(Math.abs(ang), Math.PI / 2)) ** 2);
    thr = THREE.MathUtils.clamp((vdes - st.v) / 3, -1, 1);
    if (rem < 4.6 && Math.abs(st.v) < .8){ st.auto = null; thr = 0; }
  }
  const M = MODES[mode], vmax = st.auto ? 45 : boost ? M.boost : M.vmax;
  st.v += (thr * (thr * st.v < 0 ? 34 : st.auto ? 26 : M.acc) - st.v * (thr ? .6 : 1.8)) * dt;
  st.v = THREE.MathUtils.clamp(st.v, -6, vmax);
  st.steer += (steer - st.steer) * Math.min(1, dt * 8);
  const yaw = st.steer * M.yaw * Math.min(1, Math.abs(st.v) / 5) * Math.sign(st.v || 1) / (1 + Math.abs(st.v) / 30);
  st.f.applyAxisAngle(st.n, -yaw * dt);
  // --- Avance sobre la esfera (transporte paralelo del rumbo) ---
  const axis = tmp.crossVectors(st.n, st.f).normalize(), da = st.v * dt / R;
  st.n.applyAxisAngle(axis, da).normalize(); st.f.applyAxisAngle(axis, da).projectOnPlane(st.n).normalize();
  // --- Choques suaves con los dioramas ---
  if (mode !== 'drone') for (const s of stations){ const c = st.n.angleTo(s.dir) * R; if (c < 2.3){ const push = tmp.copy(st.n).sub(s.dir).projectOnPlane(st.n).normalize();
    st.n.addScaledVector(push, (2.3 - c) / R).normalize(); st.v *= .92; } }

  // --- Coche: altura, orientación, ruedas, balanceo ---
  const h = heightAt(st.n) * RELIEF; st.ride += (h - st.ride) * Math.min(1, dt * 10);
  const bob = reduce ? 0 : Math.sin(t * 18) * .012 * Math.min(1, Math.abs(st.v) / 6);
  // --- Transformación del vehículo ---
  if (morph){
    morph.t = Math.min(1, morph.t + dt / .7);
    const from = MODES[mode].m, to = MODES[morph.to].m;
    if (morph.t < .45){ from.scale.setScalar(1 - morph.t / .45); }
    else { if (!morph.swapped){ from.visible = false; from.scale.setScalar(1); to.visible = true; mode = morph.to; morph.swapped = true; }
      const u = (morph.t - .45) / .55; to.scale.setScalar(Math.min(1, u * 1.4) * (1 + Math.sin(u * Math.PI) * .18)); }
    if (morph.t >= 1){ MODES[mode].m.scale.setScalar(1); morph = null; }
  }
  // Solo transforma la base más cercana, al llegar a ella
  const near = stations.filter(x => TRIGGERS[x.it.id] && x.d).sort((a, b) => a.d - b.d)[0];
  for (const id in TRIGGERS){ const s = stations.find(x => x.it.id === id); if (s.d > 14) armed[id] = true; }
  if (near && armed[near.it.id] && near.d < 5.6 && !st.auto){ armed[near.it.id] = false; setMode(TRIGGERS[near.it.id]); }
  lift += (MODES[mode].lift - lift) * Math.min(1, dt * 2.5);
  const hover = mode === 'drone' && !reduce ? Math.sin(t * 2.4) * .12 : 0;
  car.position.copy(st.n).multiplyScalar(R + st.ride + lift + bob + hover);
  const right = vRight.crossVectors(st.f, st.n).normalize();
  car.quaternion.setFromRotationMatrix(basisM.makeBasis(tmp.copy(right).negate(), st.n, st.f));
  carBody.rotation.z = THREE.MathUtils.lerp(carBody.rotation.z, st.steer * Math.min(1, st.v / 13) * .09, .15);
  carBody.rotation.x = THREE.MathUtils.lerp(carBody.rotation.x, -thr * .03, .1);
  for (const w of wheels.concat(fsWheels)){ w.w.rotation.x += st.v * dt / .3; if (w.front) w.pivot.rotation.y = -st.steer * .45; }
  modelFS.rotation.z = THREE.MathUtils.lerp(modelFS.rotation.z, st.steer * Math.min(1, st.v / 20) * .05, .15);
  modelDrone.rotation.z = THREE.MathUtils.lerp(modelDrone.rotation.z, st.steer * .28, .08);
  modelDrone.rotation.x = THREE.MathUtils.lerp(modelDrone.rotation.x, thr * .16, .08);
  modelDrone.rotors.forEach((r, i) => r.rotation.y += dt * (45 + i));
  carBody.tip.material.color.setHSL(.47, .7, .45 + .3 * Math.max(0, Math.sin(t * 4)));

  // --- Partículas ---
  pAcc += dt;
  if (burst && !reduce){ burst = 0;
    for (let i = 0; i < 24; i++){ const p = pState[pi]; p.life = .8; p.p.copy(car.position); p.v.randomDirection().multiplyScalar(4).addScaledVector(st.n, 2); parts.setColorAt(pi, cyanC); pi = (pi + 1) % PN; }
    parts.instanceColor.needsUpdate = true; }
  if (!reduce && mode !== 'drone' && Math.abs(st.v) > 3 && pAcc > .025){
    pAcc = 0; const water = h < .2;
    for (const side of [-.66, .66]){ const p = pState[pi]; p.life = .9;
      p.p.copy(car.position).addScaledVector(right, side).addScaledVector(st.f, -.85).addScaledVector(st.n, -.35);
      p.v.copy(st.n).multiplyScalar(water ? 2.2 : 1.1).addScaledVector(st.f, -st.v * .08).add(tmp2.randomDirection().multiplyScalar(.5));
      parts.setColorAt(pi, water ? foam : sand); pi = (pi + 1) % PN; }
    parts.instanceColor.needsUpdate = true;
  }
  for (let i = 0; i < PN; i++){ const p = pState[i]; if (p.life <= 0) continue; p.life -= dt;
    p.v.addScaledVector(p.p.clone().normalize(), -6 * dt); p.p.addScaledVector(p.v, dt);
    const s = Math.max(0, p.life) * 1.2; parts.setMatrixAt(i, tmpM.compose(p.p, tmpQ, tmpS.set(s, s, s))); }
  parts.instanceMatrix.needsUpdate = true;

  // --- Ondas ---
  for (let i = waves.length - 1; i >= 0; i--){ const w = waves[i]; w.t += dt; const r = 1 + w.t * 14;
    w.m.scale.setScalar(r); w.m.material.opacity = Math.max(0, 1 - w.t / 1.6);
    for (const s of stations) if (Math.abs(s.pos.distanceTo(w.o) - r) < 1) s.ping = 3;
    if (w.t > 1.6){ scene.remove(w.m); w.m.geometry.dispose(); waves.splice(i, 1); } }

  // --- Dron ---
  {
    drone.visible = mode !== 'drone';
    const carNear = mode !== 'drone' && car.position.distanceTo(droneHome) < 16;
    const target = carNear ? tmp.copy(car.position).addScaledVector(st.n, 2.4).addScaledVector(st.f, -1.2) : droneHome;
    if (reduce){ droneS.p.copy(droneHome); }
    else { const a = tmp2.copy(target).sub(droneS.p).multiplyScalar(7).addScaledVector(droneS.v, -3.6);
      droneS.v.addScaledVector(a, dt); droneS.p.addScaledVector(droneS.v, dt);
      const nd = droneS.p.clone().normalize(), minR = R + heightAt(nd) * RELIEF + 1.3; if (droneS.p.length() < minR) droneS.p.setLength(minR);
      drone.userData.a = a; }
    drone.position.copy(droneS.p).addScaledVector(droneS.p.clone().normalize(), reduce ? 0 : Math.sin(t * 2.2) * .08);
    const up = droneS.p.clone().normalize(), acc = drone.userData.a ? drone.userData.a.clone().projectOnPlane(up).multiplyScalar(.015) : new THREE.Vector3();
    drone.quaternion.setFromUnitVectors(Y, up.add(acc).normalize());
    drone.rotors.forEach((r, i) => r.rotation.y += dt * (40 + i));
  }

  // --- Lugares: cercanía, animaciones, etiquetas ---
  let best = null, bd = 1e9;
  for (const s of stations){ const d = st.n.angleTo(s.dir) * R; s.d = d; if ((!st.auto || s === st.auto) && d < bd){ bd = d; best = s; } }
  const now = bd < 5.2 ? best : (active && active.d < 7.5 && !st.auto ? active : null);
  if (now !== active){ active = now; if (active){ UI.show(active.it.id); setArcs(active); } else { UI.hide(); setArcs(null); } }
  const camDir = tmp.copy(camera.position);
  for (const s of stations){
    s.ping = Math.max(0, s.ping - dt);
    if (s.update && s.d < 30) s.update(reduce ? 0 : t);
    s.ring.material.opacity = s === active ? .55 + .35 * Math.sin(t * 4) : UI.visited.has(s.it.id) ? .5 : .2;
    const vis = tmp2.copy(camDir).sub(s.pos).dot(s.dir) > 0, show = vis && (s.d < 50 || s.ping > 0);
    if (show){ const p = tmp2.copy(s.pos).addScaledVector(s.dir, 3.6).project(camera);
      s.label.style.transform = `translate(${(p.x + 1) / 2 * innerWidth}px,${(1 - p.y) / 2 * innerHeight}px) translate(-50%,-50%)`; }
    s.label.style.opacity = show ? (s.ping > 0 ? 1 : Math.min(1, (50 - s.d) / 12)) : 0;
    s.label.classList.toggle('near', s === active); s.label.classList.toggle('ping', s.ping > 0 && s !== active);
    const txt = s.name + (UI.visited.has(s.it.id) ? ' ✓' : ''); if (s.label.textContent !== txt) s.label.textContent = txt;
  }
  if (arcs) arcs.children.forEach(l => l.material.dashOffset = -t * 1.5);

  // --- Cámara ---
  if (!drag && Math.abs(st.v) > 2) orbit *= Math.exp(-dt * 1.2);
  const back = st.f.clone().applyAxisAngle(st.n, orbit).multiplyScalar(-dist);
  camTarget.copy(car.position).add(back).addScaledVector(st.n, dist * .48 + Math.abs(st.v) * .05);
  if (intro > 0){ intro = Math.max(0, intro - dt * .45); }
  const ease = intro > 0 ? 1 - Math.exp(-dt * (1.2 + (1 - intro) * 3)) : 1 - Math.exp(-dt * 5);
  if (snap){ camera.position.copy(camTarget); snap = false; } else camera.position.lerp(camTarget, ease);
  camera.up.lerp(st.n, ease).normalize();
  lookAt.copy(car.position).addScaledVector(st.f, 2.2).addScaledVector(st.n, .6);
  camera.lookAt(lookAt);

  updateCompass(); if ((mmFrame++ & 1) === 0) drawMini();

  // --- Sol siguiendo al coche ---
  sun.target.position.copy(car.position);
  sun.position.copy(car.position).addScaledVector(st.n, 30).addScaledVector(right, 12).addScaledVector(st.f, 6);
}

function frame(){
  const dt = Math.min(clock.getDelta(), 1 / 20), t = clock.elapsedTime;
  step(dt, t); renderer.render(scene, camera);
}
document.querySelector('#loading').remove();
if (!document.body.classList.contains('formal')) renderer.setAnimationLoop(frame);
addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });
