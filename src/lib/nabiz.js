/**
 * nabiz.js — telling "working, just slow" from "stuck".
 *
 * A long print run has stretches where nothing visible changes: one slow
 * document, a large scan being decoded, the final PDF being written. From the
 * outside those look exactly like a hang. The pulse answers the question
 * directly: what is being done right now, for how long, and whether that is
 * still a normal wait.
 *
 * Pure bookkeeping; the panel draws it once a second. The drawing being done by
 * a timer is itself the honest part: if the page truly freezes, the seconds stop
 * counting and the dot stops blinking.
 */

// A document still not back after this long, or no step finished for this long,
// is worth saying out loud. The request deadline is 25 s and a failure is retried
// twice, so a slow but healthy document can take most of a minute.
export const IS_ESIGI = 45_000;
export const SESSIZLIK_ESIGI = 75_000;

export function sureMetni(ms) {
  const sn = Math.max(0, Math.floor(ms / 1000));
  if (sn < 60) return `${sn} sn`;
  const dk = Math.floor(sn / 60);
  if (dk < 60) return `${dk} dk ${String(sn % 60).padStart(2, '0')} sn`;
  return `${Math.floor(dk / 60)} sa ${String(dk % 60).padStart(2, '0')} dk`;
}

export class Nabiz {
  /**
   * @param {Object} [o]
   * @param {() => number} [o.simdi]
   * @param {(anahtar: string) => string} [o.etiket]  a readable name for a work item
   */
  constructor({ simdi = Date.now, etiket = (k) => k } = {}) {
    this.simdi = simdi;
    this.etiket = etiket;
    this.isler = new Map();
    this.baslangic = 0;
    this.sonIlerleme = 0;
  }

  basla() {
    this.baslangic = this.sonIlerleme = this.simdi();
    this.isler.clear();
  }

  /** Something visibly moved on: a step finished, a phase began. */
  ilerledi() {
    this.sonIlerleme = this.simdi();
  }

  /** Work on one item began. A second call for the same item is a retry. */
  isBasladi(anahtar) {
    const is = this.isler.get(anahtar);
    if (is) is.deneme++;
    else this.isler.set(anahtar, { bas: this.simdi(), deneme: 1 });
  }

  isBitti(anahtar) {
    if (this.isler.delete(anahtar)) this.ilerledi();
  }

  /** A new phase: whatever the previous one left behind is no longer being waited on. */
  asama() {
    this.isler.clear();
    this.ilerledi();
  }

  ozet() {
    const t = this.simdi();
    let enUzun = null;
    for (const [k, is] of this.isler) {
      if (!enUzun || is.bas < enUzun.bas) enUzun = { anahtar: k, ...is };
    }
    return {
      gecen: t - this.baslangic,
      sessiz: t - this.sonIlerleme,
      enUzun: enUzun && { etiket: this.etiket(enUzun.anahtar), sure: t - enUzun.bas, deneme: enUzun.deneme }
    };
  }
}

/**
 * The line under the status.
 *
 * @param {ReturnType<Nabiz['ozet']>} o
 * @param {Object} [d]
 * @param {boolean} [d.duraklatildi]
 * @param {number}  [d.donma]  how long the page was last unable to run, if recently
 * @returns {{metin: string, uyari: boolean}}
 */
export function nabizMetni(o, { duraklatildi = false, donma = 0 } = {}) {
  if (duraklatildi) return { metin: `Duraklatıldı · toplam ${sureMetni(o.gecen)}`, uyari: false };

  const is = o.enUzun;
  const takildi = (is && is.sure > IS_ESIGI) || o.sessiz > SESSIZLIK_ESIGI;
  if (takildi) {
    const bekleyen = is
      ? ` — “${is.etiket}” bekleniyor${is.deneme > 1 ? ` (${is.deneme}. deneme)` : ''}`
      : '';
    return {
      metin:
        `${sureMetni(is ? Math.max(is.sure, o.sessiz) : o.sessiz)}'dir ilerleme yok${bekleyen}. ` +
        'Sunucu ya da evrak yavaş olabilir: sayaç işliyorsa eklenti çalışıyordur, beklemeye devam ' +
        "edebilir ya da İptal Et'e basabilirsiniz.",
      uyari: true
    };
  }

  let metin = `Çalışıyor · ${sureMetni(o.gecen)}`;
  // A wait of a second or two is the normal pace; name the item once it is not.
  if (is && is.sure >= 3000) {
    metin += ` · şu an: ${is.etiket} (${sureMetni(is.sure)}${is.deneme > 1 ? `, ${is.deneme}. deneme` : ''})`;
  }
  if (donma) metin += ` · tarayıcı ağır bir işte ${sureMetni(donma)} meşgul kaldı`;
  return { metin, uyari: false };
}
