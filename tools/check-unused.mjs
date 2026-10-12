/**
 * Find code nothing reaches.
 *
 * Features get removed, and their helpers stay: an index writer with no caller,
 * an HTML renderer replaced by a PDF one, an event still fired at a listener that
 * was deleted. None of it breaks anything, which is exactly why it survives — and
 * the next reader spends time working out what it is for.
 *
 * Run: node tools/check-unused.mjs
 */

import fs from 'fs';
import path from 'path';

const KOK = path.resolve(import.meta.dirname, '..');
const KLASORLER = ['src/lib', 'src/content', 'src/inject', 'src/background', 'src/popup'];

const dosyalar = KLASORLER.flatMap((d) =>
  fs
    .readdirSync(path.join(KOK, d))
    .filter((f) => f.endsWith('.js'))
    .map((f) => `${d}/${f}`)
);
const icerik = Object.fromEntries(dosyalar.map((f) => [f, fs.readFileSync(path.join(KOK, f), 'utf8')]));

let sorun = 0;
const bildir = (m) => {
  console.log(m);
  sorun++;
};

/* ------------------------------------------ two functions, one name, one file */

// A second definition silently replaces the first. It cost a release: the marker
// page for undownloadable documents was written twice, and the older version —
// with a different signature — won, so the page was never produced and the error
// was swallowed by the caller's catch.
for (const [yol, src] of Object.entries(icerik)) {
  const gorulen = new Map();
  for (const m of src.matchAll(/^\s*(?:export\s+)?(?:async\s+)?function (\w+)\s*\(/gm)) {
    const satir = src.slice(0, m.index).split('\n').length;
    if (gorulen.has(m[1])) {
      bildir(`ÇİFT TANIM  ${yol}:${satir} → ${m[1]} zaten ${gorulen.get(m[1])}. satırda tanımlı`);
    } else {
      gorulen.set(m[1], satir);
    }
  }
}

/* ------------------------------------------------- exports with no consumer */

for (const [yol, src] of Object.entries(icerik)) {
  for (const m of src.matchAll(/export (?:async )?(?:function|const|class) (\w+)/g)) {
    const ad = m[1];
    const desen = new RegExp(`\\b${ad}\\b`);
    const disarida = dosyalar.some((f) => f !== yol && desen.test(icerik[f]));
    // More than one mention inside its own file means it is at least used there.
    const iceride = (src.match(new RegExp(`\\b${ad}\\b`, 'g')) || []).length > 1;

    if (!disarida && !iceride) bildir(`ÖLÜ KOD    ${yol} → ${ad} hiçbir yerde kullanılmıyor`);
  }
}

/* ------------------------------------- page-world events with no listener */

// The hook and the bridge talk over custom events. A typo or a deleted listener
// is silent: the event fires into nothing and the feature simply never happens.
const hook = icerik['src/inject/net-hook.js'] || '';
const bridge = icerik['src/content/bridge.js'] || '';

for (const m of hook.matchAll(/send\('([\w-]+)'/g)) {
  if (!bridge.includes(`'${m[1]}'`)) bildir(`DİNLEYEN YOK  net-hook '${m[1]}' olayını gönderiyor, bridge dinlemiyor`);
}
for (const m of bridge.matchAll(/type === '([\w-]+)'/g)) {
  if (!hook.includes(`'${m[1]}'`)) bildir(`GÖNDEREN YOK  bridge '${m[1]}' olayını bekliyor, net-hook göndermiyor`);
}
for (const m of bridge.matchAll(/cmd\('([\w-]+)'\)/g)) {
  if (!hook.includes(`'${m[1]}'`)) bildir(`KARŞILIĞI YOK bridge '${m[1]}' komutunu yolluyor, net-hook tanımıyor`);
}

/* ------------------------------ extension messages with no handler and vice versa */

const sw = icerik['src/background/service-worker.js'] || '';
const gonderenler = Object.entries(icerik).filter(([f]) => f !== 'src/background/service-worker.js');

for (const [yol, src] of gonderenler) {
  for (const m of src.matchAll(/sendMessage\(\{\s*kind: '([\w:]+)'/g)) {
    if (!sw.includes(`'${m[1]}'`)) bildir(`İŞLEYEN YOK   ${yol} '${m[1]}' mesajını gönderiyor, servis çalışanı işlemiyor`);
  }
}
for (const m of sw.matchAll(/msg\?\.kind === '([\w:]+)'/g)) {
  const gonderiliyor = gonderenler.some(([, src]) => src.includes(`kind: '${m[1]}'`));
  if (!gonderiliyor) bildir(`GÖNDEREN YOK  servis çalışanı '${m[1]}' mesajını bekliyor, kimse göndermiyor`);
}

if (sorun) {
  console.log(`\n${sorun} sorun bulundu.`);
  process.exit(1);
}
console.log('ölü kod denetimi: temiz');
