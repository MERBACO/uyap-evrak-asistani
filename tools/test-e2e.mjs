/**
 * End-to-end regression over the libraries, against the real UDF sample.
 *
 * Every assertion here corresponds to a bug that actually shipped: ids encoded
 * so the server resolved a different document, file names mistaken for document
 * types, a placeholder "." printed as a party name, an attachment losing its
 * parent's date, a one-page document paginating onto two.
 *
 *   node tools/test-e2e.mjs [ornek.udf]
 *
 * Needs a DOM for the UDF parser. In Node:  npm i --no-save linkedom
 */

import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';

const KOK = path.resolve(import.meta.dirname, '..');
// import() wants a URL; a bare Windows path ("E:\…") reads as the scheme "e:".
const modul = (yol) => import(pathToFileURL(path.join(KOK, yol)).href);
const ORNEK = process.argv[2];

try {
  const { DOMParser } = await import('linkedom');
  globalThis.DOMParser = DOMParser;
} catch {
  console.log('linkedom kurulu değil — UDF testleri atlanacak (npm i --no-save linkedom)');
}

const { detectShape, resolveGroups, expandEvraklar, sortChronologically, buildRequest, varyantlariBirlestir } =
  await modul('src/lib/preset.js');
const { buildPath, extensionFrom, normalizeRoot, basligiSec } = await modul('src/lib/naming.js');
const { ZipYazici } = await modul('src/lib/zip.js');
const { TaskQueue, siraKapisi } = await modul('src/lib/queue.js');

let hata = 0;
const ok = (ad, kosul) => {
  console.log((kosul ? 'ok    ' : 'HATA  ') + ad);
  if (!kosul) hata++;
};

/* ------------------------------------------------------------- listing */

const json = {
  tumEvraklar: {
    '2026/1234(Ceza Dava Dosyası)': [
      {
        evrakId: '"A"',
        dosyaId: '"F"',
        tur: 'Tensip Zaptı',
        aciklama: '',
        onaylandigiTarih: '20/08/2026',
        gonderenYerKisi: 'Örnekköy',
        ekEvrakListesi: [{ evrakId: '"Ae"', sira: 1, ekTuru: 'Fezleke' }]
      },
      // A file name in the type field, and a placeholder description.
      { evrakId: '"B"', dosyaId: '"F"', tur: '2139383870.pdf', aciklama: '.', onaylandigiTarih: '01/06/2026', ekEvrakListesi: [] }
    ]
  }
};

const shape = detectShape(json);
const liste = sortChronologically(
  resolveGroups(json, shape.listPath).flatMap((g) => expandEvraklar(g.items, shape.fields))
);

ok('listeleme: ana evraklar ve ek çıkarıldı', liste.length === 3);
ok('dosya adı tür sayılmadı', liste.some((e) => e.tur === 'Adsız belge'));
ok('yer tutucu açıklama temizlendi', liste.every((e) => e.aciklama !== '.'));
ok('ek, ana evrağın tarihini devraldı', liste.find((e) => e.ekMi)?.tarih?.startsWith('2026-08-20'));
ok('imzalar benzersiz', new Set(liste.map((e) => e.imza)).size === liste.length);

/* ------------------------------------- full list over the "last 20" list */

// The full list is split per case file; the portal's "last twenty" list is one
// flat array beside it. Judged array by array, twenty beat fifteen-plus-five:
// the listing stopped at twenty and warned about "Son 20 Evrak" for nothing.
const evraklar = (n, onek) =>
  Array.from({ length: n }, (_, i) => ({ evrakId: `"${onek}${i}"`, tur: 'Dilekçe', onaylandigiTarih: '01/01/2026' }));

const bolunmus = {
  tumEvraklar: { '2026/1(Dava)': evraklar(15, 'a'), '2025/9(Soruşturma)': evraklar(10, 'b') },
  son20Evraklar: evraklar(20, 'c')
};
ok('tam liste: bölünmüş tam liste son 20\'ye yenilmedi', detectShape(bolunmus).listPath === 'tumEvraklar.*');
ok('tam liste: 25 evrağın hepsi geldi', detectShape(bolunmus).length === 25);

const esit = { son20Evraklar: { '2026/1(Dava)': evraklar(3, 'c') }, tumEvraklar: { '2026/1(Dava)': evraklar(3, 'a') } };
ok('tam liste: eşitlikte tam liste seçildi', detectShape(esit).listPath === 'tumEvraklar.*');

const duzEsit = { tumEvraklar: { '2026/1(Dava)': evraklar(4, 'a') }, son20Evraklar: evraklar(4, 'c') };
ok('tam liste: eşitlikte gruplu liste seçildi', detectShape(duzEsit).listPath === 'tumEvraklar.*');

/* ------------------------------------------------- merging list variants */

// Two unnumbered tebligat on the same day share a signature. The old merge
// kept one of them; a document vanished from the archive without a word.
const teb = (id) => ({ evrakId: id, tur: 'Tebligat', onaylandigiTarih: '02/03/2026' });
const tum = { tumEvraklar: { '2026/1(Dava)': [teb('"t1"'), teb('"t2"'), { evrakId: '"k"', tur: 'Karar', onaylandigiTarih: '05/03/2026' }] } };
const son20 = { tumEvraklar: { '2026/1(Dava)': [teb('"x1"')] } }; // same document, other token
const alanlar = { tur: 'tur', ad: 'tur' };
const birlesik = varyantlariBirlestir([[tum], [son20]], 'tumEvraklar.*', alanlar);

ok('aynı imzalı iki evrak birleşmede kaybolmadı', birlesik[0].items.filter((x) => x.tur === 'Tebligat').length === 2);
ok('varyantlar arası tekrar tek sayıldı', birlesik[0].items.length === 3);
const sayfali = varyantlariBirlestir(
  [[{ tumEvraklar: { a: [teb('"1"')] } }, { tumEvraklar: { a: [teb('"2"')] } }]],
  'tumEvraklar.*',
  alanlar
);
ok('aynı varyantın sayfaları toplandı', sayfali[0].items.length === 2);

/* ------------------------------------------- duplicate verdicts in order */

const zamanAsimi = (p) => Promise.race([p.then(() => true), new Promise((r) => setTimeout(() => r(false), 200))]);

const kapi = siraKapisi();
ok('sıra kapısı: ilk evrak beklemiyor', await zamanAsimi(kapi.bekle(0)));
const ikinci = kapi.bekle(2);
kapi.tamamla(1); // a failure, ahead of its turn
ok('sıra kapısı: öndeki bitmeden geçilmiyor', !(await zamanAsimi(ikinci)));
kapi.tamamla(0);
ok('sıra kapısı: önündekiler bitince geçiliyor', await zamanAsimi(ikinci));

// Every task settles the gate, including one that fails for good: the run
// must finish rather than hang on the document behind it.
const kapi2 = siraKapisi();
const sirali = [];
const hatali = new TaskQueue({
  concurrency: 3,
  minDelayMs: 1,
  jitterMs: 0,
  maxRetries: 0,
  onSettled: ({ label }) => kapi2.tamamla(Number(label))
});
for (let i = 0; i < 6; i++) {
  hatali.add(String(i), async () => {
    await new Promise((r) => setTimeout(r, (6 - i) * 5)); // later ones finish first
    if (i === 1) throw Object.assign(new Error('ret'), { status: 404 });
    await kapi2.bekle(i);
    sirali.push(i);
    kapi2.tamamla(i);
  });
}
const bitti = await Promise.race([hatali.run().then(() => true), new Promise((r) => setTimeout(() => r(false), 3000))]);
ok('kuyruk hatalı evrağa rağmen bitti', bitti);
ok('kararlar seçim sırasıyla verildi', sirali.join(',') === '0,2,3,4,5');

/* --------------------------------------------------------- download url */

const url = buildRequest(
  'https://avukat.uyap.gov.tr',
  { method: 'GET', path: '/d.uyap?dosyaId=%22{{dosyaId}}%22&evrakId=%22{{evrakId}}%22' },
  { dosyaId: '"a+b/c"', evrakId: '"@x"' }
).url;

ok('kimlik tırnakları ikiye katlanmadı', !/%22%22/.test(url));
ok('artı ve at işareti kodlandı', url.includes('%2B') && url.includes('%40'));
const q = new URL(url).searchParams;
ok('sunucu değeri birebir okuyor', q.get('dosyaId') === '"a+b/c"' && q.get('evrakId') === '"@x"');

/* -------------------------------------------------------- names and zip */

const ev = {
  ad: 'Tensip Zaptı',
  tur: 'Tensip Zaptı',
  aciklama: '',
  kaynak: '',
  tarih: '2026-08-20T00:00:00.000Z',
  klasor: [],
  uzanti: extensionFrom('', 'text/udf')
};
const yol = buildPath({ root: normalizeRoot('UYAP Arsiv'), dosya: { esasNo: '2026/1234 Örnekköy' }, evrak: ev, index: 1, total: 9 });

ok('uzantı sunucu başlığından geldi', ev.uzanti === 'udf');
ok('dosya adı sıra numarasıyla başlıyor', /\/001_2026-08-20_Tensip Zaptı\.udf$/.test(yol));
ok('kayıt yolu temizlendi', normalizeRoot('C:\\..\\Hukuk//Arşiv') === 'C/Hukuk/Arşiv');

// The file list behind the overlay comes first in the page; its rows used to
// name the folder of whichever file was actually open.
const basliklar = [
  '2025/888 Örnekşehir 4. Asliye Hukuk Mahkemesi - Hukuk Dava Dosyası',
  '2026/1234 Örnekköy Cumhuriyet Başsavcılığı - Soruşturma Dosyası',
  '2026/1234 Örnekköy 3. Asliye Ceza Mahkemesi - Ceza Dava Dosyası'
];
ok('başlık: dosya numarası tutan seçildi', basligiSec(basliklar, '2026/1234(Ceza Dava Dosyası)') === basliklar[2]);
ok('başlık: başka numara hiç kullanılmadı', basligiSec(basliklar.slice(0, 1), '2026/1234(Ceza Dava Dosyası)') === '');
ok('başlık: anahtar yoksa eski davranış', basligiSec(basliklar, '') === basliklar[0]);

const z = new ZipYazici();
z.ekle(yol, new TextEncoder().encode('deneme'));
ok('zip üretiliyor', (await z.bitir()).size > 100);

/* ----------------------------------------------------------------- queue */

const kuyruk = new TaskQueue({ concurrency: 3, minDelayMs: 5, jitterMs: 0, maxRetries: 1 });
for (let i = 0; i < 20; i++) kuyruk.add('e' + i, async () => 1);
ok('kuyruk tüm işleri bitirdi', (await kuyruk.run()).results.length === 20);

/* --------------------------------------- the extension reloaded under a tab */

{
  const { eklentiKoptuMu } = await modul('src/lib/baglanti.js');
  ok(
    'bağlantı: eklentinin yenilenmesi her iki biçimde tanınıyor',
    eklentiKoptuMu(new Error('Extension context invalidated.')) &&
      eklentiKoptuMu(new TypeError("Cannot read properties of undefined (reading 'local')")) &&
      eklentiKoptuMu('Could not establish connection. Receiving end does not exist.')
  );
  ok('bağlantı: başka hatalar karışmıyor', !eklentiKoptuMu(new TypeError("Cannot read properties of undefined (reading 'length')")) && !eklentiKoptuMu('GET → 404'));
}

/* ------------------------------------------------ UYAP's security block */

{
  const { engelMetniMi, ErisimEngeli, engelKalan, ENGEL_BEKLEME, engelBeklemesi, yeniEngel, engelMesaji } = await modul('src/lib/engel.js');
  const { isRetriable } = await modul('src/lib/queue.js');
  const ENGEL =
    'Güvenlik sistemlerimiz, erişiminizde insan kullanımına uygun olmayan bir etkinlik örüntüsü tespit etmiştir. ' +
    'Bu nedenle erişiminiz geçici olarak durdurulmuştur.';
  ok('engel: UYAP\'ın uyarısı tanınıyor', engelMetniMi(ENGEL));
  ok('engel: büyük harf, Türkçesiz yazım ve HTML içinde de', engelMetniMi(ENGEL.toLocaleUpperCase('tr')) && engelMetniMi('ERISIMINIZ GECICI OLARAK DURDURULMUSTUR') && engelMetniMi(`<div class="msg"><b>Güvenlik</b> ${ENGEL.replace(/ /g, '&nbsp; ')}</div>`));
  ok('engel: başka ret mesajları ve evrak metni engel sayılmıyor', !engelMetniMi('İlgili dosyada vekil kaydınız bulunmamaktadır.') && !engelMetniMi('Bilirkişi raporu: güvenlik kamerası kayıtları incelenmiştir.') && !engelMetniMi(''));
  ok('engel: hiçbir zaman yeniden denenmiyor', !isRetriable(new ErisimEngeli()) && isRetriable(Object.assign(new Error('x'), { status: 429 })));
  const t = 1_800_000_000_000;
  ok('engel: bekleme süresi', engelKalan(t, t + 60_000) === ENGEL_BEKLEME - 60_000 && engelKalan(t, t + ENGEL_BEKLEME + 1) === 0 && engelKalan(undefined, t) === 0);
  const dk = (n) => engelBeklemesi(n) / 60_000;
  ok('engel: üst üste engellerde bekleme uzuyor: 15 dk, 1 sa, 4 sa, en çok 12 sa', [1, 2, 3, 4, 5].map(dk).join() === '15,60,240,720,720', [1, 2, 3, 4, 5].map(dk).join());
  ok('engel: aynı gün içindeki engel üst üste sayılıyor, ertesi günkü yeniden başlıyor', yeniEngel(t, 1, t + 3_600_000).uyapEngelSayisi === 2 && yeniEngel(t, 3, t + 25 * 3_600_000).uyapEngelSayisi === 1 && yeniEngel(undefined, 0, t).uyapEngelSayisi === 1);
  ok('engel: evrak alan iş sayacı sıfırladıysa sonraki engel yine ilk sayılıyor (15 dk)', yeniEngel(t, 0, t + 3_600_000).uyapEngelSayisi === 1 && yeniEngel(t, undefined, t + 3_600_000).uyapEngelSayisi === 2);
  ok('engel: evraklar gelirken gelen ikinci engel yavaşlamayı söylüyor', /bugün yeniden durdurdu \(2\. kez\)/.test(engelMesaji(1, 2, true)) && /daha da yavaş/.test(engelMesaji(1, 2, true)) && !/henüz kalkmamış/.test(engelMesaji(1, 2, true)));
  ok('engel: ikinci engelde elle kontrol ve destek hattı öneriliyor', /yine durdurdu/.test(engelMesaji(engelBeklemesi(2), 2)) && /1 saat bekleyin/.test(engelMesaji(engelBeklemesi(2), 2)) && /444 8927/.test(engelMesaji(1, 2)) && /15 dakika bekleyin/.test(engelMesaji(engelBeklemesi(1), 1)));

  const sayac = { n: 0 };
  const q = new TaskQueue({ concurrency: 1, minDelayMs: 0, jitterMs: 0, maxRetries: 2 });
  q.add('a', async () => {
    sayac.n++;
    throw new ErisimEngeli();
  });
  const { failures } = await q.run();
  ok('engel: kuyruk tek denemede bırakıyor', sayac.n === 1 && failures.length === 1);
}

/* ------------------------------------- fast scans and one copy of each font */

{
  const pdfLib = await modul('vendor/pdf-lib.esm.min.js');
  const { PDFDocument } = pdfLib;
  const { pikselSikistir, gorselSayfasiEkle, fontlariTekle, akislariSikistir } = await modul('src/lib/gorsel.js');
  const { PdfYazici } = await modul('src/lib/pdf.js');
  const { pdfMetni } = await modul('src/lib/pdfmetin.js');
  const { inflateSync } = await import('zlib');

  const W = 40;
  const H = 30;
  const rgba = new Uint8Array(W * H * 4);
  for (let i = 0; i < W * H; i++) rgba.set([i % 251, i % 251, i % 251, 255], i * 4);
  const gri = await pikselSikistir(rgba, W, H);
  const acik = inflateSync(gri.veri);
  ok('tarama: gri sayfa tek kanal, kayıpsız', gri.renk === 'DeviceGray' && acik.length === W * H && acik.every((v, i) => v === i % 251));

  const renkli = rgba.slice();
  renkli.set([200, 10, 10, 255], 0); // one red pixel makes it a colour page
  renkli.set([0, 0, 0, 0], 4); // fully transparent → white
  renkli.set([0, 0, 0, 128], 8); // half transparent black → mid grey
  const r = await pikselSikistir(renkli, W, H);
  const ra = inflateSync(r.veri);
  ok('tarama: renkli sayfa üç kanal, saydamlık beyaza karışıyor', r.renk === 'DeviceRGB' && ra.length === W * H * 3 && ra[0] === 200 && ra[3] === 255 && ra[6] === 127, [...ra.slice(0, 9)].join());

  const d = await PDFDocument.create();
  gorselSayfasiEkle(d, pdfLib, gri);
  const metin = new TextDecoder('latin1').decode(await d.save({ useObjectStreams: false }));
  ok(
    'tarama: görüntü nesnesi ve yerleşimi eski yolla aynı',
    /\/Subtype \/Image/.test(metin) && /\/Width 40/.test(metin) && /\/ColorSpace \/DeviceGray/.test(metin) && /\/Filter \/FlateDecode/.test(metin)
  );
  const yeniden = await PDFDocument.load(await d.save());
  let akisMetni = '';
  for (const [, o] of yeniden.context.enumerateIndirectObjects()) {
    if (!(o instanceof pdfLib.PDFRawStream) || o.dict.get(pdfLib.PDFName.of('Subtype'))) continue;
    const t = new TextDecoder('latin1').decode(pdfLib.decodePDFRawStream(o).decode());
    if (/ Do\b/.test(t)) akisMetni = t;
  }
  ok('tarama: sayfanın sol üstünde, ölçeklenmeden', /40 0 0 30 30 771\.89 cm/.test(akisMetni), akisMetni.trim());

  const olculer = JSON.parse(fs.readFileSync(`${KOK}/fonts/metrics.json`, 'utf8'));
  const fontlar = {};
  for (const [ad, m] of Object.entries(olculer)) {
    fontlar[ad] = {
      metrics: { ...m, psAd: ad === 'serif-bold' ? 'LiberationSerif-Bold' : 'LiberationSerif' },
      bytes: new Uint8Array(fs.readFileSync(`${KOK}/fonts/${m.dosya}`))
    };
  }
  const birlesik = await PDFDocument.create();
  for (let k = 1; k <= 6; k++) {
    const y = new PdfYazici(fontlar);
    y.ustBilgi(`00${k} · 01.10.2026 · Evrak`);
    y.paragraf({ hiza: 'left', boyut: 12, sekmeler: [], parcalar: [{ metin: `Altıncı evrağa kadar: ${k}. ŞİKÂYETÇİ beyanı`, kalin: k % 2 === 0, boyut: 12 }] });
    const kaynak = await PDFDocument.load(new Uint8Array(await y.bitir().arrayBuffer()));
    for (const s of await birlesik.copyPages(kaynak, kaynak.getPageIndices())) birlesik.addPage(s);
  }
  const once = (await birlesik.save({ useObjectStreams: false })).length;
  const kazanc = fontlariTekle(birlesik, pdfLib);
  const sonra = await birlesik.save({ useObjectStreams: false });
  const dosyalar = new Set([...new TextDecoder('latin1').decode(sonra).matchAll(/\/FontFile2 (\d+) 0 R/g)].map((m) => m[1]));
  ok('font: her yazı tipi bir kez kalıyor', dosyalar.size === 2, String(dosyalar.size));
  ok('font: dosya küçülüyor', kazanc > 0 && sonra.length < once * 0.3, `${once} → ${sonra.length}`);
  const okunan = await pdfMetni(sonra, pdfLib);
  ok('font: tekilleştirmeden sonra metin okunuyor', [1, 2, 3, 4, 5, 6].every((k) => okunan.includes(`${k}. ŞİKÂYETÇİ beyanı`)), okunan.slice(0, 120));

  const sikisKazanc = await akislariSikistir(birlesik, pdfLib);
  const sikis = await birlesik.save({ useObjectStreams: false });
  const sikisOkunan = await pdfMetni(sikis, pdfLib);
  ok('sıkıştırma: dosya yine küçülüyor, metin okunuyor', sikisKazanc > 0 && sikis.length < sonra.length * 0.8 && [1, 6].every((k) => sikisOkunan.includes(`${k}. ŞİKÂYETÇİ beyanı`)), `${sonra.length} → ${sikis.length}`);
  ok('sıkıştırma: zaten sıkıştırılmış akışa dokunmuyor', (await akislariSikistir(birlesik, pdfLib)) === 0);
}

/* ------------------------------------------------- the pulse during a run */

{
  const { Nabiz, nabizMetni, sureMetni } = await modul('src/lib/nabiz.js');
  let t = 0;
  const n = new Nabiz({ simdi: () => t, etiket: (k) => `013 · ${k}` });
  ok('nabız: süre biçimi', sureMetni(8_400) === '8 sn' && sureMetni(125_000) === '2 dk 05 sn' && sureMetni(3_725_000) === '1 sa 02 dk');

  n.basla();
  n.isBasladi('Bilirkişi Raporu');
  t = 2_000;
  ok('nabız: kısa beklemede evrak adı yok', nabizMetni(n.ozet()).metin === 'Çalışıyor · 2 sn');
  t = 12_000;
  n.isBasladi('Bilirkişi Raporu'); // a retry
  let m = nabizMetni(n.ozet());
  ok('nabız: uzayan beklemede evrak ve deneme yazıyor', m.metin === 'Çalışıyor · 12 sn · şu an: 013 · Bilirkişi Raporu (12 sn, 2. deneme)' && !m.uyari, m.metin);
  t = 50_000;
  m = nabizMetni(n.ozet());
  ok('nabız: 45 sn sonra takılma uyarısı, hangi evrakta', m.uyari && /^50 sn'dir ilerleme yok — “013 · Bilirkişi Raporu” bekleniyor \(2\. deneme\)/.test(m.metin), m.metin);
  ok('nabız: duraklatılmışken uyarı yok', !nabizMetni(n.ozet(), { duraklatildi: true }).uyari);
  n.isBitti('Bilirkişi Raporu');
  ok('nabız: evrak bitince uyarı kalkıyor', !nabizMetni(n.ozet()).uyari);
  t = 130_000;
  m = nabizMetni(n.ozet());
  ok('nabız: hiçbir şey ilerlemezse de uyarıyor', m.uyari && m.metin.startsWith("1 dk 20 sn'dir ilerleme yok."), m.metin);
  n.asama();
  ok('nabız: yeni aşama ilerleme sayılıyor', !nabizMetni(n.ozet()).uyari);
  ok('nabız: tarayıcının meşgul kaldığı söyleniyor', /meşgul kaldı$/.test(nabizMetni(n.ozet(), { donma: 6000 }).metin));

  // The queue tells the watcher about every attempt and every settled task.
  const olaylar = [];
  const izleyici = { isBasladi: (k) => olaylar.push('+' + k), isBitti: (k) => olaylar.push('-' + k) };
  const q = new TaskQueue({ concurrency: 1, minDelayMs: 0, jitterMs: 0, maxRetries: 1, izleyici });
  let ilk = true;
  q.add('a', async () => {
    if (ilk) {
      ilk = false;
      throw new Error('ağ hatası'); // no status: retried
    }
    return 1;
  });
  q.add('b', async () => {
    throw Object.assign(new Error('yetki'), { status: 403 });
  });
  await q.run();
  ok('kuyruk: izleyici her denemeyi ve sonucu duyuyor', olaylar.join() === '+a,+a,-a,+b,-b', olaylar.join());
}

/* ----------------------------------------------------- case file history */

{
  const { gecmiseEkle, gecmisOzeti, islemSatiri } = await modul('src/lib/gecmis.js');
  const gun = Date.UTC(2026, 8, 1, 9, 0);
  const ziyaret = gun + 3 * 86_400_000;

  ok('geçmiş: hiç listeleme yokken söylüyor', gecmisOzeti([], ziyaret)[0] === 'Bu dosyada daha önce listeleme yapılmadı.');

  let g = gecmiseEkle([], { tur: 'listeleme', zaman: gun, toplam: 2, yeni: 0 }, gun);
  g = gecmiseEkle(g, { tur: 'listeleme', zaman: ziyaret, toplam: 5, yeni: 3 }, ziyaret);
  g = gecmiseEkle(g, { tur: 'listeleme', zaman: ziyaret + 60_000, toplam: 5, yeni: 3 }, ziyaret);
  ok('geçmiş: aynı ziyarette art arda listeleme tek kayıt', g.length === 2);

  g = gecmiseEkle(g, { tur: 'indirme', zaman: ziyaret + 120_000, indirilen: 4, kopya: 1, hata: 0 }, ziyaret);
  g = gecmiseEkle(g, { tur: 'listeleme', zaman: ziyaret + 180_000, toplam: 5, yeni: 3 }, ziyaret);
  ok('geçmiş: araya indirme girince listeleme ayrı kayıt', g.length === 4 && g[1].tur === 'indirme');

  const ozet = gecmisOzeti(g, ziyaret);
  ok('geçmiş: özet önceki ziyaretin listelemesini gösteriyor', /^Son listeleme: .* · 2 evrak$/.test(ozet[0]), ozet[0]);
  ok('geçmiş: özet son indirmeyi gösteriyor', /^Son indirme: .* · 4 evrak indirildi · 1 kopya atlandı$/.test(ozet[1] || ''), ozet[1]);
  ok('geçmiş: bu ziyaret işaretli', islemSatiri(g[0], ziyaret).endsWith('(bu ziyarette)') && !islemSatiri(g[3], ziyaret).includes('bu ziyaret'));
  ok('geçmiş: eski biçimli kayıt listeleme sayılıyor', islemSatiri({ zaman: gun, toplam: null }).startsWith('Listeleme — '));
  ok(
    'geçmiş: yazdırma satırı',
    islemSatiri({ tur: 'yazdirma', zaman: gun, evrak: 40, sayfa: 312, eklenemeyen: 2, kaydedildi: true }).endsWith(
      '40 evrak, 312 sayfa · 2 eklenemedi · PDF olarak indirildi'
    )
  );
}

/* ------------------------------------------ quick mobile-signature login */

{
  const { tcGecerliMi, gsmDuzelt, gsmMaskele, tcMaskele, bilgiyiDogrula } = await modul('src/lib/mobilimza.js');
  // A checksum-valid number that belongs to no one, the usual test value.
  ok('mobil imza: geçerli kimlik no kabul', tcGecerliMi('10000000146'));
  ok('mobil imza: tek hanesi yanlış kimlik no ret', !tcGecerliMi('10000000147') && !tcGecerliMi('10000000136'));
  ok('mobil imza: 0 ile başlayan, kısa ya da harfli kimlik no ret', !tcGecerliMi('01000000146') && !tcGecerliMi('1000000014') && !tcGecerliMi('1000000014a'));
  ok(
    'mobil imza: GSM her yazılışta 10 haneye iner',
    ['0532 123 45 67', '+90 (532) 123-45-67', '5321234567', '905321234567'].every((g) => gsmDuzelt(g) === '5321234567')
  );
  ok('mobil imza: sabit hat ve eksik numara ret', gsmDuzelt('0212 123 45 67') === null && gsmDuzelt('532 123 45') === null);
  ok('mobil imza: maskeler tamamını göstermiyor', gsmMaskele('5321234567') === '0532 *** ** 67' && tcMaskele('10000000146') === '10*******46');
  const d = bilgiyiDogrula({ tc: ' 100 000 001 46 ', gsm: '0532 123 45 67', operator: 'turkcell' });
  ok('mobil imza: doğrulama düzeltilmiş bilgiyi verir', d.bilgi?.tc === '10000000146' && d.bilgi?.gsm === '5321234567');
  ok('mobil imza: operatör seçilmeden kaydedilmez', /operatör/.test(bilgiyiDogrula({ tc: '10000000146', gsm: '5321234567' }).hata || ''));

  // The e-Devlet script is a classic script; run it with a hostname that keeps it idle.
  const vm = await import('vm');
  const kum = { location: { hostname: 'test' }, URL, URLSearchParams, setTimeout, console };
  vm.createContext(kum);
  vm.runInContext(fs.readFileSync(`${KOK}/src/content/edevlet-giris.js`, 'utf8') + '\n;globalThis.__f = { istekTazeMi, uyapDonusuMu };', kum);
  const { istekTazeMi, uyapDonusuMu } = kum.__f;
  const t0 = 1_800_000_000_000;
  ok('e-Devlet: taze istek kabul, eskisi ve gelecektekisi ret', istekTazeMi(t0, t0 + 5000) && !istekTazeMi(t0, t0 + 91_000) && !istekTazeMi(t0 + 1, t0) && !istekTazeMi(undefined, t0));
  const arama = (donus) =>
    '?oauthClientId=x&continue=' +
    encodeURIComponent('https://giris.turkiye.gov.tr/OAuth2AuthorizationServer/AuthorizationController?response_type=code&redirect_uri=' + encodeURIComponent(donus) + '&state=s');
  ok('e-Devlet: UYAP dönüşü tanınıyor', uyapDonusuMu(arama('https://avukat.uyap.gov.tr/edevlet-callback')) && uyapDonusuMu(arama('https://avukatbeta.uyap.gov.tr/x')));
  ok(
    'e-Devlet: başka siteye dönen giriş tanınmıyor',
    !uyapDonusuMu(arama('https://www.example.com/cb')) &&
      !uyapDonusuMu(arama('https://avukat.uyap.gov.tr.example.com/cb')) &&
      !uyapDonusuMu(arama('http://avukat.uyap.gov.tr/cb')) &&
      !uyapDonusuMu('') &&
      !uyapDonusuMu('?continue=bozuk')
  );
}

/* -------------------------------------------------------------- hearings */

{
  const { sorguAraligi, zamanCoz, durusmaDizisi, durusmalariHazirla } = await modul('src/lib/durusma.js');

  const a = sorguAraligi(new Date(2026, 9, 5, 14, 30));
  ok('duruşma: aralık bugünden başlar, 30 gün sürer', a.baslangicTarihi === '05.10.2026' && a.bitisTarihi === '03.11.2026');
  ok('duruşma: aralık bugünün başından son günün sonuna', a.bas === new Date(2026, 9, 5).getTime() && a.bit === new Date(2026, 10, 4).getTime());
  ok('duruşma: ay ve yıl dönümü', sorguAraligi(new Date(2026, 11, 20)).bitisTarihi === '18.01.2027');

  const t = new Date(2026, 9, 6, 9, 30).getTime();
  ok(
    'duruşma: saat her biçimde okunuyor',
    zamanCoz(t) === t && zamanCoz(String(t)) === t && zamanCoz('06.10.2026 09:30') === t && zamanCoz(new Date(t).toISOString()) === t && zamanCoz('') === null
  );

  const h = (gun, saat, ek = {}) => ({
    dosyaId: 'D' + gun,
    kayitId: 'K' + gun,
    tarihSaat: new Date(2026, 9, gun, saat, 0).getTime(),
    yerelBirimAd: 'Örnekköy 3. Asliye Ceza Mahkemesi',
    dosyaNo: `2026/${gun}`,
    dosyaTurKodAciklama: 'Ceza Dava Dosyası',
    islemTuruAciklama: 'Duruşma',
    dosyaTaraflari: [
      { isim: 'AHMET', soyad: 'YILMAZ', sifat: 'Sanık', isVekil: true },
      { isim: 'MEHMET', soyad: 'KAYA', sifat: 'Müşteki', isVekil: false }
    ],
    ...ek
  });
  ok('duruşma: liste yanıtın neresinde olursa bulunuyor', durusmaDizisi({ hatalar: [], veri: { liste: [h(6, 9)] } })?.length === 1 && durusmaDizisi([h(6, 9)]).length === 1);
  ok('duruşma: boş liste "duruşma yok" sayılıyor, liste yoksa hata', durusmaDizisi({ data: [] })?.length === 0 && durusmaDizisi({ x: 1 }) === null);

  const liste = durusmalariHazirla({ data: [h(20, 14), h(6, 9), h(6, 9), h(4, 10), h(4, 11, { dosyaId: 'X' }), h(7, 10, { islemTuruAciklama: 'Keşif' })] }, a);
  ok('duruşma: aralık dışı atılıyor, tekrar tek, tarih sırasında', liste.map((d) => d.dosyaNo).join(',') === '2026/6,2026/7,2026/20', liste.map((d) => d.dosyaNo).join(','));
  ok('duruşma: vekili olunan ve diğer taraf ayrılıyor', liste[0].vekiliOlunan[0] === 'AHMET YILMAZ (Sanık)' && liste[0].digerTaraflar[0] === 'MEHMET KAYA (Müşteki)');

}

/* ------------------------------------------------ searching inside documents */

{
  const { katla, sorguKelimeleri, alintiBul } = await modul('src/lib/arama.js');
  const eslesir = (katli, kelimeler) => kelimeler.every((x) => katli.includes(x)); // as panel.js matches

  ok('arama: Türkçe harfler ve büyük/küçük harf fark etmiyor', katla('Bilirkişi RAPORU İĞDIR') === 'bilirkisi raporu igdir');
  ok('arama: katlanan metin aynı uzunlukta', katla('Şçğİı öü\nX').length === 'Şçğİı öü\nX'.length);
  const metin = 'Dosya kapsamında alınan Bilirkişi Raporu ile davacının zararı belirlenmiştir.';
  const k = katla(metin);
  ok('arama: kelime sırası önemsiz, hepsi aranıyor', eslesir(k, sorguKelimeleri('raporu bilirkisi')) && !eslesir(k, sorguKelimeleri('bilirkisi keşif')));
  const alinti = alintiBul(metin, k, sorguKelimeleri('bilirkisi'), 20);
  ok('arama: alıntı özgün harflerle', alinti?.eslesen === 'Bilirkişi' && alinti.once.startsWith('…') && alinti.sonra.length > 0, JSON.stringify(alinti));
}

{
  const pdfLib = await modul('vendor/pdf-lib.esm.min.js');
  const { PDFDocument, StandardFonts } = pdfLib;
  const { pdfMetni, cmapCoz } = await modul('src/lib/pdfmetin.js');
  const { PdfYazici } = await modul('src/lib/pdf.js');

  const olculer = JSON.parse(fs.readFileSync(`${KOK}/fonts/metrics.json`, 'utf8'));
  const fontlar = {};
  for (const [ad, m] of Object.entries(olculer)) {
    fontlar[ad] = {
      metrics: { ...m, psAd: ad === 'serif-bold' ? 'LiberationSerif-Bold' : 'LiberationSerif' },
      bytes: new Uint8Array(fs.readFileSync(`${KOK}/fonts/${m.dosya}`))
    };
  }

  // 1. Our own writer: Identity-H glyph ids, mapped back by ToUnicode.
  const y = new PdfYazici(fontlar);
  const par = (metin) => ({ hiza: 'left', boyut: 12, sekmeler: [], parcalar: [{ metin, kalin: false, boyut: 12 }] });
  y.paragraf(par('AYVALIK 3. ASLİYE CEZA MAHKEMESİ'));
  y.paragraf(par('Bilirkişi raporu doğrultusunda ihtiyati tedbir kararı verildi.'));
  const kendi = await pdfMetni(new Uint8Array(await y.bitir().arrayBuffer()), pdfLib);
  ok('pdf metni: Türkçe karakterli kendi PDF\'imiz', kendi.includes('ASLİYE CEZA MAHKEMESİ') && kendi.includes('Bilirkişi raporu doğrultusunda'), kendi.slice(0, 80));
  ok('pdf metni: satırlar ayrı', kendi.split('\n').length >= 2);

  // 2. A standard font, compressed content stream (WinAnsi).
  const d = await PDFDocument.create();
  const helv = await d.embedFont(StandardFonts.Helvetica);
  const s = d.addPage();
  s.drawText('Tensip zapti ve durusma gunu', { x: 50, y: 700, font: helv, size: 12 });
  s.drawText('Ikinci satir (parantez) burada', { x: 50, y: 680, font: helv, size: 12 });
  const standart = await pdfMetni(await d.save(), pdfLib);
  ok('pdf metni: standart yazı tipi, sıkıştırılmış akış', standart.includes('Tensip zapti ve durusma gunu') && standart.includes('(parantez)'), standart);

  // 3. A page drawn into another as a form XObject, as merged printouts are.
  const kap = await PDFDocument.create();
  const [gomulu] = await kap.embedPdf(await d.save());
  kap.addPage().drawPage(gomulu);
  ok('pdf metni: gömülü form nesnesinin içi de okunuyor', (await pdfMetni(await kap.save(), pdfLib)).includes('Tensip zapti'));

  // 4. A page with no text — a scan, in effect.
  const bos = await PDFDocument.create();
  bos.addPage();
  ok('pdf metni: metinsiz sayfa boş döner', (await pdfMetni(await bos.save(), pdfLib)) === '');

  // 5. Encrypted with no password, as many official PDFs are: built here by the
  // standard algorithm (RC4, 128 bit, revision 3) so the test needs no file.
  const { md5, rc4, dosyaAnahtari, uDegeri } = await modul('src/lib/pdfsifre.js');
  const PAD = Uint8Array.from([
    0x28, 0xbf, 0x4e, 0x5e, 0x4e, 0x75, 0x8a, 0x41, 0x64, 0x00, 0x4e, 0x56, 0xff, 0xfa, 0x01, 0x08,
    0x2e, 0x2e, 0x00, 0xb6, 0xd0, 0x68, 0x3e, 0x80, 0x2f, 0x0c, 0xa9, 0xfe, 0x64, 0x53, 0x69, 0x7a
  ]);
  ok('şifre: md5 bilinen değer', [...md5(new TextEncoder().encode('abc'))].map((b) => b.toString(16).padStart(2, '0')).join('') === '900150983cd24fb0d6963f7d28e17f72');

  const sifreliPdf = (bozukU = false) => {
    const id = Uint8Array.from({ length: 16 }, (_, i) => i * 7 + 1);
    let ok3 = md5(PAD);
    for (let i = 0; i < 50; i++) ok3 = md5(ok3);
    let O = rc4(ok3, PAD);
    for (let i = 1; i <= 19; i++) O = rc4(ok3.map((b) => b ^ i), O);
    const P = -1852;
    const anahtar = dosyaAnahtari({ O, P, id, R: 3, n: 16 });
    const U = new Uint8Array(32);
    U.set(uDegeri(anahtar, 3, id));
    if (bozukU) U[0] ^= 0xff;

    const icerik = new TextEncoder().encode('BT /F1 12 Tf 50 700 Td (Gizli metin: tebligat) Tj ET');
    const nesneAnahtari = md5(Uint8Array.from([...anahtar, 4, 0, 0, 0, 0])).subarray(0, 16);
    const sifreli = rc4(nesneAnahtari, icerik);
    const hex = (b) => [...b].map((x) => x.toString(16).padStart(2, '0')).join('');

    const parcalar = [];
    const enc = new TextEncoder();
    let uzunluk = 0;
    const konum = [];
    const yaz = (x) => {
      const b = typeof x === 'string' ? enc.encode(x) : x;
      parcalar.push(b);
      uzunluk += b.length;
    };
    yaz('%PDF-1.4\n');
    const nesne = (no, govde) => {
      konum[no] = uzunluk;
      yaz(`${no} 0 obj\n`);
      for (const g of [].concat(govde)) yaz(g);
      yaz('\nendobj\n');
    };
    nesne(1, '<< /Type /Catalog /Pages 2 0 R >>');
    nesne(2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
    nesne(3, '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>');
    nesne(4, [`<< /Length ${sifreli.length} >>\nstream\n`, sifreli, '\nendstream']);
    nesne(5, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
    nesne(6, `<< /Filter /Standard /V 2 /R 3 /Length 128 /P ${P} /O <${hex(O)}> /U <${hex(U)}> >>`);
    const xref = uzunluk;
    yaz('xref\n0 7\n0000000000 65535 f \n');
    for (let i = 1; i <= 6; i++) yaz(`${String(konum[i]).padStart(10, '0')} 00000 n \n`);
    yaz(`trailer\n<< /Size 7 /Root 1 0 R /Encrypt 6 0 R /ID [<${hex(id)}> <${hex(id)}>] >>\nstartxref\n${xref}\n%%EOF\n`);
    const out = new Uint8Array(uzunluk);
    let o = 0;
    for (const p of parcalar) {
      out.set(p, o);
      o += p.length;
    }
    return out;
  };

  const cozulen = await pdfMetni(sifreliPdf(), pdfLib);
  ok('şifre: parolasız şifreli PDF okunuyor', cozulen.includes('Gizli metin: tebligat'), cozulen);
  let parolaHatasi = '';
  try {
    await pdfMetni(sifreliPdf(true), pdfLib);
  } catch (e) {
    parolaHatasi = String(e.message);
  }
  ok('şifre: gerçek parola isteyen PDF açıkça reddediliyor', /parola korumalı/.test(parolaHatasi), parolaHatasi);

  const harita = cmapCoz('1 begincodespacerange <0000> <FFFF> endcodespacerange 1 beginbfrange <0010> <0012> <015E> endbfrange 1 beginbfchar <0020> <0131> endbfchar');
  ok('pdf metni: ToUnicode aralık ve tekil eşleme', harita.genislik === 2 && harita.harita.get(0x11) === 'ş' && harita.harita.get(0x20) === 'ı');
}

/* ------------------------------------------------- the spreadsheet index */

{
  const { excelDizini } = await modul('src/lib/excel.js');
  const { xlsxSayfalar } = await modul('src/lib/xlsx.js');
  const { zipIcerik } = await modul('src/lib/udf.js');

  const blob = excelDizini({
    baslik: '2026/1234 Örnekköy 3. Asliye Ceza Mahkemesi',
    altBaslik: 'Oluşturma: test',
    satirlar: [
      { sira: 1, tarih: '2026-08-01T00:00:00.000Z', tur: 'Tensip Zaptı', ad: 'Tensip Zaptı', aciklama: 'A <&> "B"',
        dosyaAdi: '001_2026-08-01_Tensip Zaptı #1.pdf', baglanti: '001_2026-08-01_Tensip Zaptı #1.pdf', durum: 'İndirildi' },
      { sira: 2, tarih: null, tur: 'Ek', ad: 'Ek 01', durum: 'Seçilmedi\u0007' }
    ]
  });
  const bytes = await blob.arrayBuffer();
  const girdiler = await zipIcerik(bytes);
  const [sayfa] = await xlsxSayfalar(girdiler);

  ok('excel: okunabiliyor, sayfa adı doğru', sayfa?.ad === 'Evrak Dizini');
  ok('excel: başlık ve sütunlar yerinde', sayfa.satirlar[0][0].startsWith('2026/1234 Örnekköy') && sayfa.satirlar[2][7] === 'Dosya Adı');
  ok('excel: tarih gerçek tarih (seri numara)', sayfa.satirlar[3][1] === '46235', sayfa.satirlar[3][1]);
  ok('excel: özel karakterler korunuyor', sayfa.satirlar[3][4] === 'A <&> "B"');
  ok('excel: XML\'in yasakladığı karakter temizlendi', sayfa.satirlar[4][8] === 'Seçilmedi');

  const iliski = new TextDecoder().decode(await girdiler.find((g) => g.ad === 'xl/worksheets/_rels/sheet1.xml.rels').oku());
  // Written the way Excel writes its own links: Turkish letters kept, only
  // space, % and # escaped. Escaping "ı" made Excel look for a file that did
  // not exist.
  ok('excel: bağlantı Excel biçiminde', iliski.includes('Target="001_2026-08-01_Tensip%20Zaptı%20%231.pdf"'), iliski.match(/Target="[^"]*"/)?.[0]);
  ok('excel: yalnızca klasördeki dosyaya bağlantı', (iliski.match(/<Relationship /g) || []).length === 1);
}

/* ------------------------------------- contents, bookmarks, page numbers */

{
  const pdfLib = await modul('vendor/pdf-lib.esm.min.js');
  const { PDFDocument, PDFName } = pdfLib;
  const { icindekilerSayfaSayisi, icindekilerYaz, baglantilariEkle, yerImleriEkle, sayfaNumaralari } =
    await modul('src/lib/dizin.js');

  const olculer = JSON.parse(fs.readFileSync(`${KOK}/fonts/metrics.json`, 'utf8'));
  const fontlar = {};
  for (const [ad, m] of Object.entries(olculer)) {
    fontlar[ad] = {
      metrics: { ...m, psAd: ad === 'serif-bold' ? 'LiberationSerif-Bold' : 'LiberationSerif' },
      bytes: new Uint8Array(fs.readFileSync(`${KOK}/fonts/${m.dosya}`))
    };
  }

  // Seventy documents, two pages each, behind a cover: enough for the contents
  // to run onto a second page, which is where an off-by-one would show.
  const belge = await PDFDocument.create();
  const adet = 70;
  for (let i = 0; i < adet * 2 + 1; i++) belge.addPage([595.28, 841.89]);
  const once = 1;
  const tocSayfa = icindekilerSayfaSayisi(adet);
  const girdiler = Array.from({ length: adet }, (_, i) => ({
    no: String(i + 1).padStart(3, '0'),
    tarih: '2026-08-20',
    ad: i === 3 ? 'Çok uzun bir evrak adı '.repeat(8) : `Bilirkişi Raporu ${i + 1}`,
    ekMi: i % 5 === 4,
    sayfa: once + tocSayfa + i * 2
  }));

  const { bytes, baglantilar } = await icindekilerYaz(fontlar, girdiler, { baslik: '2026/1234 Örnekköy', sira: 'test' });
  const toc = await PDFDocument.load(bytes);
  ok('içindekiler: sayfa sayısı hesapla uyuşuyor', toc.getPageCount() === tocSayfa && tocSayfa > 1);

  const kopyalar = await belge.copyPages(toc, toc.getPageIndices());
  kopyalar.forEach((s, j) => belge.insertPage(once + j, s));
  baglantilariEkle(belge, baglantilar, once);
  yerImleriEkle(belge, pdfLib, [
    { baslik: 'Kapak', sayfa: 0 },
    { baslik: 'İçindekiler', sayfa: once },
    ...girdiler.map((g) => ({ baslik: `${g.no} · ${g.ad}`, sayfa: g.sayfa, cocuklar: [{ baslik: 'Ek 01', sayfa: g.sayfa + 1 }] }))
  ]);
  await sayfaNumaralari(belge, pdfLib, once);

  const kaydedilen = await belge.save({ useObjectStreams: false });
  const yeniden = await PDFDocument.load(kaydedilen);
  ok('içindekiler: belge kaydedilip yeniden açılıyor', yeniden.getPageCount() === adet * 2 + 1 + tocSayfa);

  const annotSayisi = yeniden
    .getPages()
    .slice(once, once + tocSayfa)
    .reduce((t, s) => t + (s.node.Annots()?.size() || 0), 0);
  ok('içindekiler: her satır bir bağlantı', annotSayisi === adet);

  // The last row must point at the last document's first page.
  const sonSatir = baglantilar[baglantilar.length - 1];
  const sonHedef = yeniden.getPage(sonSatir.hedef);
  ok('içindekiler: son satır doğru sayfaya gidiyor', sonSatir.hedef === yeniden.getPageCount() - 2 && Boolean(sonHedef));

  const outlines = yeniden.catalog.lookup(PDFName.of('Outlines'));
  ok('yer imleri: ağaç var', Boolean(outlines) && outlines.get(PDFName.of('Count')).asNumber() === adet + 2);
  ok('yer imleri: açılışta gösteriliyor', String(yeniden.catalog.get(PDFName.of('PageMode'))) === '/UseOutlines');

  if (process.env.ORNEK_PDF) fs.writeFileSync(process.env.ORNEK_PDF, kaydedilen);
}

/* -------------------------------------------------- UDF, PDF and merging */

const ornekYol = ORNEK || (fs.existsSync(`${KOK}/test-ornek.udf`) ? `${KOK}/test-ornek.udf` : null);

if (globalThis.DOMParser && ornekYol && fs.existsSync(ornekYol)) {
  const { udfOku, udfCozumle } = await modul('src/lib/udf.js');
  const { PdfYazici } = await modul('src/lib/pdf.js');
  const { PDFDocument } = await modul('vendor/pdf-lib.esm.min.js');

  const olculer = JSON.parse(fs.readFileSync(`${KOK}/fonts/metrics.json`, 'utf8'));
  const fontlar = {};
  for (const [ad, m] of Object.entries(olculer)) {
    fontlar[ad] = {
      metrics: { ...m, psAd: ad === 'serif-bold' ? 'LiberationSerif-Bold' : 'LiberationSerif' },
      bytes: new Uint8Array(fs.readFileSync(`${KOK}/fonts/${m.dosya}`))
    };
  }

  const buf = fs.readFileSync(ornekYol);
  const { xml } = await udfOku(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length));
  const belge = udfCozumle(xml);

  ok('UDF çözümlendi', belge.paragraflar.length > 0);
  ok('sayfa biçimi belgeden okundu', belge.sayfaBicimi.solKenar > 0);

  const yazici = new PdfYazici(fontlar, { altbilgi: belge.altbilgi, bicim: belge.sayfaBicimi });
  yazici.ustBilgi('001 · test');
  for (const p of belge.paragraflar) yazici.paragraf(p);
  const bytes = new Uint8Array(await yazici.bitir().arrayBuffer());

  ok('PDF üretildi', bytes.length > 1000 && bytes[0] === 0x25);

  const hedef = await PDFDocument.create();
  const kaynak = await PDFDocument.load(bytes, { ignoreEncryption: true });
  for (const s of await hedef.copyPages(kaynak, kaynak.getPageIndices())) hedef.addPage(s);
  ok('birleştirme sayfaları taşıdı', hedef.getPageCount() === yazici.sayfalar.length);
  ok('kaydetme çalışıyor', (await hedef.save({ useObjectStreams: false })).length > 1000);
} else {
  console.log('atlandı  UDF/PDF testleri (örnek dosya verilmedi)');
}

console.log(hata ? `\n${hata} sorun bulundu.` : '\nuçtan uca testler: temiz');
process.exit(hata ? 1 : 0);
