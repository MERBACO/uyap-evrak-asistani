/**
 * engel.js — when UYAP says stop, stop.
 *
 * Past some rate of requests UYAP's security layer suspends the session's
 * access and answers every request with one sentence: "Güvenlik sistemlerimiz,
 * erişiminizde insan kullanımına uygun olmayan bir etkinlik örüntüsü tespit
 * etmiştir. Bu nedenle erişiminiz geçici olarak durdurulmuştur."
 *
 * That page used to be taken for a document — it is HTML with text in it — so it
 * was saved as one, printed as one, and the run carried on at full pace into a
 * block it could not see, each refusal costing several more requests. Now the
 * first such answer ends the run, nothing is retried, and no new run starts for
 * a while. The extension does not try to look less like what it is: the answer
 * to "too many requests" is fewer requests.
 */

import { katla } from './arama.js';

// No new bulk run for this long after a block. UYAP does not say how long its
// block lasts. A second block soon after the first means it had not lifted, so
// each one in a row waits four times longer: 15 min, 1 h, 4 h, then 12 h. With a
// fixed 15 minutes the extension knocked on a closed door every quarter hour.
export const ENGEL_BEKLEME = 15 * 60_000;
const EN_UZUN_BEKLEME = 12 * 3_600_000;
// Blocks further apart than this are not "in a row".
const ARDISIK_PENCERE = 24 * 3_600_000;

const IFADELER = ['insan kullanimina uygun olmayan', 'erisiminiz gecici olarak durdurul'];

/** Whether a page's text is UYAP's suspension notice, in whatever case or markup. */
export function engelMetniMi(metin) {
  if (!metin) return false;
  const k = katla(String(metin).replace(/<[^>]*>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/\s+/g, ' '));
  return IFADELER.some((i) => k.includes(i));
}

export class ErisimEngeli extends Error {
  constructor() {
    super("UYAP'ın güvenlik sistemi erişiminizi geçici olarak durdurdu.");
    this.engel = true;
    // Never retried: every retry is one more request into the block.
    this.kalici = true;
  }
}

/** How long to hold off after the `sayi`th block in a row. */
export function engelBeklemesi(sayi = 1) {
  return Math.min(EN_UZUN_BEKLEME, ENGEL_BEKLEME * 4 ** Math.max(0, (sayi || 1) - 1));
}

/** Milliseconds still to wait after a block recorded at `zaman`, or 0. */
export function engelKalan(zaman, simdi = Date.now(), sayi = 1) {
  if (typeof zaman !== 'number') return 0;
  return Math.max(0, zaman + engelBeklemesi(sayi) - simdi);
}

/**
 * What to store after one more block. Counted as "in a row" when the previous
 * one was within a day; a run that fetches anything clears the count.
 */
export function yeniEngel(oncekiZaman, oncekiSayi, simdi = Date.now()) {
  const ardisik = typeof oncekiZaman === 'number' && simdi - oncekiZaman < ARDISIK_PENCERE;
  // A count of 0 is a run that fetched documents clearing it: the next block is
  // the first again. (A missing count is a record older than the count; it
  // stood for one block.) `(0 || 1) + 1` used to make that next block the
  // second, so it waited an hour instead of fifteen minutes.
  const sayilan = oncekiSayi === 0 ? 0 : oncekiSayi || 1;
  return { uyapEngeli: simdi, uyapEngelSayisi: ardisik && sayilan ? sayilan + 1 : 1 };
}

function sureYazisi(ms) {
  const dk = Math.max(1, Math.ceil(ms / 60_000));
  if (dk < 60) return `${dk} dakika`;
  const sa = Math.floor(dk / 60);
  return dk % 60 ? `${sa} saat ${dk % 60} dakika` : `${sa} saat`;
}

/**
 * What the panel says, with the wait still left.
 *
 * @param {boolean} [ilerledi]  documents arrived in the run before this block.
 *   Then the previous block had lifted and this one is about pace, which calls
 *   for a slower speed; with nothing arriving at all, access was never restored.
 */
export function engelMesaji(kalanMs, sayi = 1, ilerledi = false) {
  const ust = sayi > 1;
  let giris;
  let oneri;
  if (!ust) {
    giris = "UYAP'ın güvenlik sistemi, kısa sürede çok sayıda istek geldiği için erişiminizi geçici olarak durdurdu. ";
    oneri =
      "Bu sürede portalı elle kullanabilirsiniz; erişiminiz açılmadıysa UYAP'tan çıkıp yeniden girin. " +
      'Tekrar denerken daha az evrak seçin: alınmış olanlar yeniden istenmez.';
  } else if (ilerledi) {
    giris = `UYAP'ın güvenlik sistemi erişiminizi bugün yeniden durdurdu (${sayi}. kez). `;
    oneri =
      "Evraklar gelirken durdurduğu için eklenti sonraki işlerde daha da yavaş çalışacak. " +
      'Alınmış evraklar yeniden istenmez.';
  } else {
    giris = "UYAP'ın güvenlik sistemi erişiminizi yine durdurdu: önceki engel henüz kalkmamış. ";
    oneri =
      "Önce portalda bir evrağı elle açabildiğinizi kontrol edin; açılmıyorsa UYAP'tan çıkıp yeniden " +
      'girin, sürerse UYAP destek hattını (444 8927) arayın. Erişim düzelince küçük bir seçimle başlayın.';
  }
  return (
    giris +
    'Eklenti bütün istekleri hemen kesti ve bu sayfayı evrak olarak kaydetmedi.\n' +
    `Yeni bir toplu işlem için ${sureYazisi(kalanMs)} bekleyin. ` +
    oneri
  );
}
