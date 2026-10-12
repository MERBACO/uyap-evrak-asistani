/**
 * gecmis.js — a case file's history: listings, downloads, printouts.
 *
 * "Did I already download this file? When did I last look at it?" are the
 * questions a lawyer asks before starting, and the panel used to have no
 * answer. The history lives in the browser beside the record of seen
 * documents, one short entry per operation, newest first.
 *
 * Entries:
 *   { tur: 'listeleme', zaman, toplam, yeni }
 *   { tur: 'indirme',   zaman, indirilen, kopya, hata, zip, iptal, oturumDustu }
 *   { tur: 'yazdirma',  zaman, evrak, sayfa, eklenemeyen, kaydedildi }
 *
 * Entries written before downloads and printouts were recorded carry no `tur`;
 * they are listings.
 */

export const ISLEM_ADI = { listeleme: 'Listeleme', indirme: 'İndirme', yazdirma: 'Yazdırma' };

const turu = (g) => g?.tur || 'listeleme';

/** "12.09.2026 14:05". */
export function tarihSaat(ms) {
  return new Date(ms).toLocaleString('tr-TR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

/** What an operation did, without its name or time: "12 evrak indirildi · 1 alınamadı". */
export function islemAyrintisi(g) {
  const parca = [];
  if (turu(g) === 'indirme') {
    parca.push(`${g.indirilen ?? 0} evrak indirildi`);
    if (g.kopya) parca.push(`${g.kopya} kopya atlandı`);
    if (g.hata) parca.push(`${g.hata} alınamadı`);
    if (g.zip) parca.push('zip');
    if (g.iptal) parca.push('iptal edildi');
    if (g.oturumDustu) parca.push('oturum düştü');
  } else if (turu(g) === 'yazdirma') {
    parca.push(`${g.evrak ?? 0} evrak, ${g.sayfa ?? 0} sayfa`);
    if (g.eklenemeyen) parca.push(`${g.eklenemeyen} eklenemedi`);
    if (g.kaydedildi) parca.push('PDF olarak indirildi');
  } else {
    // Listings recorded before the counts were kept have only a time.
    if (g.toplam != null) parca.push(`${g.toplam} evrak`);
    if (g.yeni) parca.push(`${g.yeni} yeni`);
  }
  return parca.join(' · ');
}

/** One line of the history list. */
export function islemSatiri(g, ziyaretBaslangici = Infinity) {
  const ayrinti = islemAyrintisi(g);
  return (
    `${ISLEM_ADI[turu(g)]} — ${tarihSaat(g.zaman)}` +
    (ayrinti ? ` · ${ayrinti}` : '') +
    (g.zaman >= ziyaretBaslangici ? ' (bu ziyarette)' : '')
  );
}

/**
 * Add an entry, newest first.
 *
 * Listing twice in a row on one visit — after a portal hiccup, say — is one
 * look at the file, so the second replaces the first. Anything in between (a
 * download) keeps them apart, and a new visit always gets an entry of its own.
 */
export function gecmiseEkle(gecmis, giris, ziyaretBaslangici, sinir = 100) {
  const liste = Array.isArray(gecmis) ? gecmis : [];
  const son = liste[0];
  const tekrar =
    turu(giris) === 'listeleme' && son && turu(son) === 'listeleme' && son.zaman >= ziyaretBaslangici;
  return [giris, ...(tekrar ? liste.slice(1) : liste)].slice(0, sinir);
}

/**
 * The lines always in view above the list.
 *
 * The listing named here is the last one *before* this visit — the one that
 * answers "when did I last look?". This visit's own listing is in the list
 * below, marked as such. Downloads and printouts are named whenever they
 * happened, this visit included: "have I downloaded this?" has the same answer
 * either way.
 */
export function gecmisOzeti(gecmis, ziyaretBaslangici = Infinity) {
  const liste = Array.isArray(gecmis) ? gecmis : [];
  const satirlar = [];

  const onceki = liste.find((g) => turu(g) === 'listeleme' && g.zaman < ziyaretBaslangici);
  if (onceki) {
    const a = islemAyrintisi(onceki);
    satirlar.push(`Son listeleme: ${tarihSaat(onceki.zaman)}${a ? ` · ${a}` : ''}`);
  } else {
    satirlar.push('Bu dosyada daha önce listeleme yapılmadı.');
  }

  for (const tur of ['indirme', 'yazdirma']) {
    const g = liste.find((x) => turu(x) === tur);
    if (g) satirlar.push(`Son ${ISLEM_ADI[tur].toLocaleLowerCase('tr')}: ${tarihSaat(g.zaman)} · ${islemAyrintisi(g)}`);
  }
  return satirlar;
}
