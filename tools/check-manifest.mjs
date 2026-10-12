/**
 * The manifest is a promise to the browser; check the repo keeps it.
 *
 * A missing icon, a script path that moved, a resource the page needs but that is
 * not web-accessible — each of these fails at load or, worse, only when a feature
 * is first used. They are all decidable from the files on disk.
 *
 * Run: node tools/check-manifest.mjs
 */

import fs from 'fs';
import path from 'path';

const KOK = path.resolve(import.meta.dirname, '..');
const oku = (p) => fs.readFileSync(path.join(KOK, p), 'utf8');
const varMi = (p) => fs.existsSync(path.join(KOK, p));

const mf = JSON.parse(oku('manifest.json'));
let sorun = 0;
const bildir = (m) => {
  console.log(m);
  sorun++;
};

/* --------------------------------------------- declared files must exist */

for (const [boyut, yol] of Object.entries(mf.icons || {})) {
  if (!varMi(yol)) bildir(`EKSİK  ${boyut}px simge: ${yol}`);
}
if (!varMi(mf.background?.service_worker)) bildir(`EKSİK  service worker: ${mf.background?.service_worker}`);
if (!varMi(mf.action?.default_popup)) bildir(`EKSİK  popup: ${mf.action?.default_popup}`);

for (const cs of mf.content_scripts || []) {
  for (const yol of [...(cs.js || []), ...(cs.css || [])]) {
    if (!varMi(yol)) bildir(`EKSİK  content script dosyası: ${yol}`);
  }
}

// Scripts registered at run time (the e-Devlet quick-login script) appear in no
// manifest key; the service worker names them in a `js: [...]` list.
const sw = oku(mf.background?.service_worker || '');
for (const liste of sw.matchAll(/js: \[([^\]]*)\]/g)) {
  for (const m of liste[1].matchAll(/'([^']+)'/g)) {
    if (!varMi(m[1])) bildir(`EKSİK  çalışırken kaydedilen betik: ${m[1]}`);
  }
}
// Its origin must be one the lawyer can grant, or registering it fails.
const istegeBagli = mf.optional_host_permissions || [];
for (const m of sw.matchAll(/'(https:\/\/[^']+\/\*)'/g)) {
  if (![...(mf.host_permissions || []), ...istegeBagli].includes(m[1])) {
    bildir(`İZİN YOK  service worker ${m[1]} adresini kullanıyor ama manifestte yok`);
  }
}

/* ------------------------------------ imports must be reachable from the page */

// The panel is loaded with import() from a content script, so everything it pulls
// in has to be listed in web_accessible_resources. Getting this wrong shows up
// only when the feature that needs the module is first used.
const kaliplar = (mf.web_accessible_resources || []).flatMap((w) => w.resources || []);
const erisilebilir = (yol) =>
  kaliplar.some((k) => new RegExp('^' + k.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$').test(yol));

// Scan every source file, not just the panel: the fonts are requested from
// src/lib/pdf.js, and a check that only read the panel passed happily while the
// fonts were unreachable.
const kaynakDosyalar = ['src/content', 'src/lib', 'src/inject', 'src/background', 'src/popup']
  .flatMap((d) => fs.readdirSync(path.join(KOK, d)).map((f) => `${d}/${f}`))
  .filter((f) => f.endsWith('.js'));

const kaynak = Object.fromEntries(kaynakDosyalar.map((f) => [f, oku(f)]));

// Only files loaded into the page need to be web-accessible. The service worker
// and the popup run inside the extension and reach their own resources freely —
// requiring accessibility there produced a false alarm on the notification icon.
const sayfaBaglami = (dosya) => /^src\/(content|lib|inject)\//.test(dosya);

for (const [dosya, metin] of Object.entries(kaynak)) {
  for (const m of metin.matchAll(/from '\.\.\/lib\/([\w.-]+)'/g)) {
    const yol = `src/lib/${m[1]}`;
    if (!varMi(yol)) bildir(`EKSİK  ${dosya} şunu içe aktarıyor: ${yol}`);
    else if (!erisilebilir(yol)) bildir(`ERİŞİLEMEZ  ${yol} web_accessible_resources dışında`);
  }
  for (const m of metin.matchAll(/getURL\('([^']+)'\)/g)) {
    const yol = m[1];
    if (yol.includes('$') || yol.includes('{')) continue; // built at run time
    if (!varMi(yol)) bildir(`EKSİK  getURL ile istenen dosya: ${yol}`);
    else if (sayfaBaglami(dosya) && !erisilebilir(yol)) {
      bildir(`ERİŞİLEMEZ  ${yol} web_accessible_resources dışında (${dosya} istiyor)`);
    }
  }
}

// The fonts are named in metrics.json and fetched through a caller-supplied
// resolver, so no literal path appears in the source at all.
const olculer = JSON.parse(oku('fonts/metrics.json'));
for (const yol of ['fonts/metrics.json', ...Object.values(olculer).map((m) => `fonts/${m.dosya}`)]) {
  if (!varMi(yol)) bildir(`EKSİK  yazı tipi dosyası: ${yol}`);
  else if (!erisilebilir(yol)) bildir(`ERİŞİLEMEZ  ${yol} web_accessible_resources dışında`);
}

/* ------------------------------------------- permissions match actual use */

const tumKaynak = Object.values(kaynak).join('\n');

// Generic both ways: a permission whose API is never called should not be asked
// for, and an API that is called must be declared. Naming the permissions to
// check by hand meant a newly added one was simply not looked at.
// Permissions that change a limit rather than unlock an API: there is no
// chrome.<name> to find, and each must be checked for differently.
const APISIZ = {
  // Lifts the 10 MB cap on chrome.storage.local, which the download history
  // outgrows after a few hundred case files.
  unlimitedStorage: () => /chrome\.storage\.local\./.test(tumKaynak)
};

for (const izin of mf.permissions || []) {
  if (APISIZ[izin]) {
    if (!APISIZ[izin]()) bildir(`GEREKSİZ  "${izin}" izni isteniyor ama gerektiren kullanım yok`);
    continue;
  }
  if (!new RegExp(`chrome\\.${izin}\\.`).test(tumKaynak)) {
    bildir(`GEREKSİZ  "${izin}" izni isteniyor ama chrome.${izin} hiç kullanılmıyor`);
  }
}
for (const m of tumKaynak.matchAll(/chrome\.(\w+)\./g)) {
  const ad = m[1];
  if (['runtime', 'i18n', 'extension'].includes(ad)) continue; // always available
  // chrome.permissions needs no permission of its own; chrome.tabs.create does
  // not either (only reading a tab's address or title would ask for "tabs").
  if (ad === 'permissions') continue;
  if (ad === 'tabs' && ![...tumKaynak.matchAll(/chrome\.tabs\.(\w+)/g)].some((t) => t[1] !== 'create')) continue;
  if (!(mf.permissions || []).includes(ad)) bildir(`EKSİK İZİN  chrome.${ad} kullanılıyor ama izni istenmemiş`);
}

/* ---------------------------------- the shipped preset must be usable as-is */

const preset = JSON.parse(oku('presets/avukatbeta.json'));
for (const [ad, uc] of Object.entries(preset.endpoints || {})) {
  if (!uc.path) bildir(`BOŞ  preset ucu doldurulmamış: ${ad}.path`);
}
for (const host of mf.host_permissions || []) {
  const alan = host.replace(/^https?:\/\//, '').replace(/\/\*$/, '');
  if (preset.origin && !preset.origin.includes(alan) && mf.host_permissions.length === 1) {
    bildir(`UYUMSUZ  preset origin (${preset.origin}) host izniyle (${host}) örtüşmüyor`);
  }
}

if (sorun) {
  console.log(`\n${sorun} sorun bulundu.`);
  process.exit(1);
}
console.log('manifest denetimi: temiz');
