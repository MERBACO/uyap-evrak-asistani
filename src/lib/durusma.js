/**
 * durusma.js — the hearing list: what to ask UYAP for and how to read the answer.
 *
 * The portal's own "Yaklaşan Duruşmalarım" card asks avukat_durusma_sorgula_brd.ajx
 * for seven days ({baslangicTarihi, bitisTarihi} as dd.MM.yyyy). The same call
 * with a thirty-day range is the whole of the query; everything here is pure so
 * the shape of a hearing can be tested without a portal.
 */

export const GUN_SAYISI = 30;

const iki = (n) => String(n).padStart(2, '0');
export const tarihMetni = (d) => `${iki(d.getDate())}.${iki(d.getMonth() + 1)}.${d.getFullYear()}`;
export const saatMetni = (d) => `${iki(d.getHours())}:${iki(d.getMinutes())}`;
const GUNLER = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];
export const gunAdi = (d) => GUNLER[d.getDay()];

/**
 * The thirty days from the query day, the query day included: today and the
 * twenty-nine after it.
 */
export function sorguAraligi(simdi = new Date()) {
  const bas = new Date(simdi.getFullYear(), simdi.getMonth(), simdi.getDate());
  const son = new Date(bas.getFullYear(), bas.getMonth(), bas.getDate() + GUN_SAYISI - 1);
  const bit = new Date(son.getFullYear(), son.getMonth(), son.getDate() + 1); // exclusive
  return { bas: bas.getTime(), bit: bit.getTime(), baslangicTarihi: tarihMetni(bas), bitisTarihi: tarihMetni(son) };
}

/**
 * The portal hands the hearing time to `new Date()` as it comes. Read it the
 * same way, and also accept "dd.MM.yyyy HH:mm", which `new Date()` misreads.
 */
export function zamanCoz(deger) {
  if (deger == null || deger === '') return null;
  if (typeof deger === 'number') return Number.isFinite(deger) ? deger : null;
  const s = String(deger).trim();
  const m = s.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})(?:[ T]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (m) return new Date(+m[3], +m[2] - 1, +m[1], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0)).getTime();
  if (/^\d{10,}$/.test(s)) return Number(s);
  const t = Date.parse(s);
  return Number.isNaN(t) ? null : t;
}

/**
 * The list inside the answer, wherever the portal put it: the first array of
 * hearings. An empty array counts — "no hearings" is an answer — but only when
 * no array with hearings in it exists anywhere else in the response.
 */
export function durusmaDizisi(yanit) {
  let bos = null;
  const ara = (x, derinlik) => {
    if (Array.isArray(x)) {
      if (x.some((o) => o && typeof o === 'object' && 'tarihSaat' in o)) return x;
      if (!x.length) bos ??= x;
      return null;
    }
    if (!x || typeof x !== 'object' || derinlik > 4) return null;
    for (const deger of Object.values(x)) {
      const bulunan = ara(deger, derinlik + 1);
      if (bulunan) return bulunan;
    }
    return null;
  };
  return ara(yanit, 0) || bos;
}

function kisiAdi(t) {
  const ad = [t?.isim, t?.soyad].map((x) => String(x || '').trim()).filter(Boolean).join(' ');
  const sifat = String(t?.sifat || '').trim();
  return ad ? (sifat ? `${ad} (${sifat})` : ad) : '';
}

const temiz = (x) => String(x ?? '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

/** One hearing, in the names the rest of the extension uses. */
export function durusmaKaydi(h) {
  const zaman = zamanCoz(h?.tarihSaat);
  if (zaman == null) return null;
  const taraflar = Array.isArray(h.dosyaTaraflari) ? h.dosyaTaraflari : [];
  const birim = temiz(h.yerelBirimAd || h.birimAdi);
  const dosyaNo = temiz(h.dosyaNo);
  return {
    // The portal's own calendar file keys a hearing by dosyaId and kayitId.
    anahtar: h.dosyaId || h.kayitId ? `${h.dosyaId || ''}-${h.kayitId || ''}` : `${dosyaNo}|${birim}|${zaman}`,
    zaman,
    birim,
    dosyaNo,
    dosyaTuru: temiz(h.dosyaTurKodAciklama),
    islem: temiz(h.islemTuruAciklama) || 'Duruşma',
    sonuc: temiz(h.islemSonucuAciklama),
    vekiliOlunan: taraflar.filter((t) => t?.isVekil === true).map(kisiAdi).filter(Boolean),
    digerTaraflar: taraflar.filter((t) => t?.isVekil === false).map(kisiAdi).filter(Boolean),
    hakimler: (Array.isArray(h.izinliHakimList) ? h.izinliHakimList : []).map(temiz).filter(Boolean)
  };
}

/** The answer as a sorted list of hearings within the range, each once. */
export function durusmalariHazirla(yanit, aralik) {
  const dizi = durusmaDizisi(yanit);
  if (!dizi) throw new Error('Duruşma yanıtında liste bulunamadı.');
  const gorulen = new Map();
  for (const h of dizi) {
    const k = durusmaKaydi(h);
    if (!k || (aralik && (k.zaman < aralik.bas || k.zaman >= aralik.bit))) continue;
    gorulen.set(k.anahtar + '@' + k.zaman, k);
  }
  return [...gorulen.values()].sort((a, b) => a.zaman - b.zaman || a.dosyaNo.localeCompare(b.dosyaNo, 'tr'));
}
