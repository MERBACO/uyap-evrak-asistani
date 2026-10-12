/**
 * Keep the documentation honest.
 *
 * The READMEs drifted badly once already: they described a recorder that had been
 * deleted, an index file that was no longer written, and claimed "no
 * dependencies" while a font and a PDF library sat in the repo. Prose does not
 * fail loudly the way code does, so check the checkable parts of it.
 *
 * Run: node tools/check-docs.mjs
 */

import fs from 'fs';
import path from 'path';

const KOK = path.resolve(import.meta.dirname, '..');
// The popup's own text is documentation too: it is what most users will ever
// read, and it went stale the same way the READMEs did.
const BELGELER = [
  'README.md',
  'README.tr.md',
  'docs/ENDPOINT-DISCOVERY.md',
  'vendor/README.md',
  'src/popup/popup.html',
  'PRIVACY.md',
  'docs/YAYINLAMA.md',
  'CHANGELOG.md'
];

// Features that were removed. A document naming one is out of date, and the
// reader will go looking for a button that is not there.
const KALDIRILANLAR = [
  { desen: /kaydedici|recorder|Kaydı başlat/i, ne: 'kaldırılan kaydedici' },
  { desen: /00_icindekiler|icindekiler\.csv/i, ne: 'kaldırılan içindekiler dosyası' },
  { desen: /PDF'e Çevir/i, ne: 'kaldırılan PDF çevirme düğmesi' },
  { desen: /Durumu Yenile/i, ne: 'kaldırılan durum yenileme düğmesi' },
  { desen: /sayfalama .{0,20}(uygulanmadı|not implemented)/i, ne: 'sayfalama artık var' },
  { desen: /(bağımlılık yok|No dependencies)/i, ne: 'artık gömülü kütüphane ve font var' },
  { desen: /(Seçtiğiniz boyut hatırlanır|boyut hatırlan)/i, ne: 'panel boyutu artık hatırlanmıyor' },
  // The changelog keeps its history; every other document must not offer it.
  { desen: /Google Takvim|Google Calendar|gtakvim/i, ne: 'kaldırılan Google Takvim eşitlemesi', haric: ['CHANGELOG.md'] }
];

let sorun = 0;

for (const belge of BELGELER) {
  const tamYol = path.join(KOK, belge);
  if (!fs.existsSync(tamYol)) {
    console.log(`EKSİK BELGE  ${belge}`);
    sorun++;
    continue;
  }
  const metin = fs.readFileSync(tamYol, 'utf8');

  // Relative links and inline paths must point at something that exists.
  const yollar = new Set();
  for (const m of metin.matchAll(/\]\((?!https?:|#)([^)]+)\)/g)) yollar.add(m[1].split('#')[0]);
  for (const m of metin.matchAll(/`((?:src|tools|docs|fonts|vendor|presets)\/[\w./-]+)`/g)) yollar.add(m[1]);

  for (const yol of yollar) {
    if (!fs.existsSync(path.join(KOK, yol))) {
      console.log(`KIRIK YOL    ${belge} → ${yol}`);
      sorun++;
    }
  }

  for (const { desen, ne, haric = [] } of KALDIRILANLAR) {
    if (haric.includes(belge)) continue;
    const m = metin.match(desen);
    // ENDPOINT-DISCOVERY explains the manual method and says so at the top; it is
    // allowed to name the recorder in that historical context.
    if (m && !(belge.includes('ENDPOINT-DISCOVERY') && /kaydedici|recorder/i.test(m[0]))) {
      console.log(`ESKİ İÇERİK  ${belge} → ${ne} ("${m[0]}")`);
      sorun++;
    }
  }
}

if (sorun) {
  console.log(`\n${sorun} sorun bulundu.`);
  process.exit(1);
}
console.log('belge denetimi: temiz');
