/**
 * durusmalar.js — the next thirty days of hearings, inside the panel.
 *
 * On any portal page after login the panel carries a "Duruşmalar" section. It
 * asks UYAP for the hearings from today through the twenty-nine days after it,
 * on its own when the list it has is from another day or more than an hour
 * old, and shows them in date order. The full table opens in a page of its own
 * (src/popup/durusmalar.html), which prints and exports to Excel.
 *
 * The request is the one the portal's own "Yaklaşan Duruşmalarım" card makes,
 * replayed with a thirty-day range: when the portal has been seen making it,
 * its exact URL and encoding are reused; otherwise the preset's template.
 */

import { buildRequest } from '../lib/preset.js';
import { saatMetni, sorguAraligi, durusmalariHazirla, GUN_SAYISI } from '../lib/durusma.js';
import { engelMetniMi, engelKalan, yeniEngel } from '../lib/engel.js';
import { YENILE_MESAJI, eklentiKoptuMu } from '../lib/baglanti.js';

const kucuk = (s) => (s || '').trim().toLocaleLowerCase('tr');
const girisSayfasiMi = (belge) =>
  [...belge.querySelectorAll('.dx-button')].some((el) => kucuk(el.textContent).includes('e-devlet ile giriş'));

// "Paz" would read as both Pazar and Pazartesi: the usual Turkish abbreviations.
const KISA_GUNLER = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'];
const kisaTarih = (z) => {
  const d = new Date(z);
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')} ${KISA_GUNLER[d.getDay()]} ${saatMetni(d)}`;
};

/** Put the range into the portal's own request body, wherever it keeps the two dates. */
function tarihleriYerlestir(govde, aralik) {
  let bulundu = false;
  const gez = (x) => {
    if (!x || typeof x !== 'object') return;
    for (const k of Object.keys(x)) {
      if (k === 'baslangicTarihi' || k === 'bitisTarihi') {
        x[k] = aralik[k];
        bulundu = true;
      } else {
        gez(x[k]);
      }
    }
  };
  gez(govde);
  return bulundu;
}

/**
 * @param {Object} ctx
 * @param {Document} [ctx.belge]
 * @param {Object} ctx.preset
 * @param {Function} ctx.portalFetch
 * @param {(pathname: string) => Promise<Array>} ctx.getRequests
 * @param {{get: Function, set: Function}} ctx.depo
 * @param {(msg: Object) => Promise<any>} ctx.mesaj
 * @param {() => number} [ctx.simdi]
 * @param {number} [ctx.gecikme]   wait before the automatic query, for the portal's own call to be seen
 * @param {number} [ctx.tazelik]   a list younger than this is not fetched again on its own
 */
export function durusmalariKur({
  belge = document,
  preset,
  portalFetch,
  getRequests,
  depo,
  mesaj,
  simdi = Date.now,
  gecikme = 4000,
  tazelik = 60 * 60_000
}) {
  let veri = null; // { zaman, aralik, kayitlar }
  let acik = false;
  let calisiyor = false;
  let hata = '';
  let bolum = null;
  let otomatikPlanli = false;
  let engelZamani = null; // when UYAP last suspended access, if it did
  let engelSayisi; // how many in a row; 0 once a run that fetched documents cleared it
  // The panel's Ayarlar option: wait after a block, or never wait on our own.
  let koruma = true;
  let beklemeYaziyor = false; // `hata` is the "wait N minutes" line

  const panelGovdesi = () => belge.querySelector('#ua-panel .ua-body');

  depo.get(['durusmaListesi', 'uyapEngeli', 'uyapEngelSayisi', 'engelKorumasi']).then((o) => {
    if (o.durusmaListesi?.kayitlar) veri = o.durusmaListesi;
    engelZamani = o.uyapEngeli ?? null;
    engelSayisi = o.uyapEngelSayisi;
    koruma = o.engelKorumasi !== false;
    ciz();
    denetle();
  });

  /**
   * Re-read the block state. The panel changes it while this page stays open —
   * "Beklemeyi Kaldır" clears it, the Ayarlar option turns the wait off — and
   * reading it only once at load kept the hearings waiting until a reload.
   */
  async function engelDurumunuOku() {
    try {
      const o = await depo.get(['uyapEngeli', 'uyapEngelSayisi', 'engelKorumasi']);
      engelZamani = o.uyapEngeli ?? null;
      engelSayisi = o.uyapEngelSayisi;
      koruma = o.engelKorumasi !== false;
    } catch {
      /* keep what was read before */
    }
  }

  /** How long the hearings still have to wait: never, with the option off. */
  const beklenecek = () => (koruma ? engelKalan(engelZamani, simdi(), engelSayisi) : 0);

  const yanitAlintisi = (govde) => {
    const t = String(govde || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200);
    return t ? ` UYAP'ın yanıtı: "${t}"` : '';
  };

  // Follow those changes live, so the wait line goes as soon as it is lifted.
  globalThis.chrome?.storage?.onChanged?.addListener?.((d, alan) => {
    if (alan !== 'local' || !('uyapEngeli' in d || 'uyapEngelSayisi' in d || 'engelKorumasi' in d)) return;
    engelDurumunuOku().then(() => {
      if (beklemeYaziyor && !beklenecek()) {
        hata = '';
        beklemeYaziyor = false;
        ciz();
      }
    });
  });

  function bayatMi() {
    // While UYAP's block lasts, nothing is asked on its own (src/lib/engel.js).
    if (beklenecek()) return false;
    if (!veri) return true;
    const bugun = sorguAraligi(new Date(simdi())).baslangicTarihi;
    return veri.aralik?.baslangicTarihi !== bugun || simdi() - veri.zaman > tazelik;
  }

  /* ----------------------------------------------------------------- query */

  async function istekHazirla(aralik) {
    const ep = preset?.endpoints?.durusmaListesi;
    if (!ep?.path) throw new Error('Uç haritasında durusmaListesi yok.');
    const yol = new URL(ep.path, location.origin).pathname;
    const yakalanan = ((await getRequests?.(yol)) || []).find((r) => r.body);
    if (yakalanan) {
      try {
        const govde = JSON.parse(yakalanan.body);
        if (tarihleriYerlestir(govde, aralik)) {
          return {
            url: yakalanan.url,
            method: yakalanan.method || 'POST',
            headers: yakalanan.contentType ? { 'Content-Type': yakalanan.contentType } : {},
            body: JSON.stringify(govde)
          };
        }
      } catch {
        /* not JSON: fall back to the template */
      }
    }
    return buildRequest(location.origin, ep, aralik);
  }

  async function yenile({ otomatik = false } = {}) {
    if (calisiyor) return;
    calisiyor = true;
    await engelDurumunuOku();
    const bekle = beklenecek();
    if (bekle) {
      calisiyor = false;
      hata = `UYAP erişimi geçici olarak durdurdu; duruşmalar ${Math.ceil(bekle / 60_000)} dakika sonra alınabilir.`;
      beklemeYaziyor = true;
      return ciz();
    }
    hata = '';
    beklemeYaziyor = false;
    ciz();
    const basladi = simdi();
    try {
      const aralik = sorguAraligi(new Date(simdi()));
      const yanit = await portalFetch(await istekHazirla(aralik));
      const kayitlar = durusmalariHazirla(yanit, aralik);
      veri = { zaman: simdi(), aralik, kayitlar };
      await depo.set({ durusmaListesi: veri });
    } catch (err) {
      if (engelMetniMi(err?.govde)) {
        await engelDurumunuOku();
        // With the panel's option off, nothing is recorded and nothing waits:
        // say what UYAP answered and let the next Yenile try again.
        if (!koruma) {
          hata = 'UYAP duruşma sorgusuna "erişiminiz durduruldu" yanıtı verdi.' + yanitAlintisi(err.govde);
          return;
        }
        // The panel may have recorded this same block while the request was
        // out; counting it a second time would double the wait.
        if (!(typeof engelZamani === 'number' && engelZamani >= basladi)) {
          const kayit = yeniEngel(engelZamani, engelSayisi, simdi());
          engelZamani = kayit.uyapEngeli;
          engelSayisi = kayit.uyapEngelSayisi;
          try {
            // A hearings query fetches no documents: the panel words the wait
            // for that case, not for a block that cut a run short.
            await depo.set({ ...kayit, uyapEngelIlerledi: false });
          } catch {
            /* the message below still says to wait */
          }
        }
        const kalan = Math.max(60_000, engelKalan(engelZamani, simdi(), engelSayisi));
        hata =
          `UYAP erişimi geçici olarak durdurdu; duruşmalar ${Math.ceil(kalan / 60_000)} dakika sonra alınabilir.` +
          yanitAlintisi(err.govde);
        beklemeYaziyor = true;
        return;
      }
      hata = eklentiKoptuMu(err) ? YENILE_MESAJI : `Duruşmalar alınamadı: ${err?.message || err}`;
      if (otomatik) console.warn('[UYAP Arşiv] duruşmalar alınamadı:', err);
    } finally {
      calisiyor = false;
      ciz();
    }
  }

  /* ------------------------------------------------------------------ view */

  function ozet() {
    if (calisiyor) return 'alınıyor…';
    if (!veri) return 'henüz sorgulanmadı';
    const n = veri.kayitlar.length;
    if (!n) return `${GUN_SAYISI} gün içinde duruşma yok`;
    return `${n} duruşma · ilki ${kisaTarih(veri.kayitlar[0].zaman)}`;
  }

  function ciz() {
    if (!bolum) return;
    const $ = (s) => bolum.querySelector(s);
    $('[data-role="ozet"]').textContent = ozet();
    $('[data-role="govde"]').hidden = !acik;
    $('[data-act="ac"]').setAttribute('aria-expanded', String(acik));
    $('[data-act="yenile"]').disabled = calisiyor;
    $('[data-act="tablo"]').disabled = !veri;

    const durum = $('[data-role="durum"]');
    durum.textContent = hata;
    durum.classList.toggle('is-hata', Boolean(hata));

    const bilgi = $('[data-role="bilgi"]');
    bilgi.textContent = veri
      ? `${veri.aralik.baslangicTarihi} – ${veri.aralik.bitisTarihi} · sorgu ${kisaTarih(veri.zaman).slice(-5)}`
      : '';

    const liste = $('[data-role="liste"]');
    liste.innerHTML = '';
    for (const d of veri?.kayitlar || []) {
      const li = belge.createElement('li');
      const zaman = belge.createElement('span');
      zaman.className = 'ua-durusma-zaman';
      zaman.textContent = kisaTarih(d.zaman);
      const ne = belge.createElement('span');
      ne.className = 'ua-durusma-ne';
      ne.textContent = `${d.dosyaNo} · ${d.birim}`;
      const ek = belge.createElement('span');
      ek.className = 'ua-durusma-ek';
      ek.textContent = [d.islem, d.vekiliOlunan.join(', ')].filter(Boolean).join(' · ');
      li.append(zaman, ne, ek);
      liste.appendChild(li);
    }
  }

  function bolumYap() {
    const b = belge.createElement('div');
    b.id = 'ua-durusma';
    b.className = 'ua-tur ua-durusma';
    b.innerHTML = `
      <div class="ua-tur-bas">
        <button type="button" class="ua-btn ua-btn-link" data-act="ac" aria-expanded="false">Duruşmalar</button>
        <span class="ua-durusma-ozet" data-role="ozet"></span>
      </div>
      <div class="ua-durusma-govde" data-role="govde" hidden>
        <p class="ua-durusma-bilgi" data-role="bilgi"></p>
        <ol class="ua-durusma-liste" data-role="liste"></ol>
        <div class="ua-bar">
          <button type="button" class="ua-btn" data-act="yenile">Yenile</button>
          <button type="button" class="ua-btn" data-act="tablo">Tabloyu Aç</button>
        </div>
      </div>
      <p class="ua-durusma-durum" data-role="durum"></p>`;
    b.querySelector('[data-act="ac"]').addEventListener('click', () => {
      acik = !acik;
      ciz();
    });
    b.querySelector('[data-act="yenile"]').addEventListener('click', () => yenile());
    b.querySelector('[data-act="tablo"]').addEventListener('click', () => mesaj({ kind: 'durusmaTablosu' }).catch(() => {}));
    return b;
  }

  // The panel redraws its body, and UYAP is a single-page app: keep the section
  // in the panel on every page but the login page.
  let planli = false;
  let durdu = false;
  function denetle() {
    planli = false;
    if (durdu) return;
    const govde = panelGovdesi();
    if (girisSayfasiMi(belge) || !govde) {
      bolum?.remove();
      return;
    }
    if (!bolum?.isConnected) {
      bolum ??= bolumYap();
      govde.prepend(bolum);
      ciz();
    }
    if (!otomatikPlanli && bayatMi()) {
      otomatikPlanli = true;
      setTimeout(() => durdu || yenile({ otomatik: true }), gecikme);
    }
  }
  const gozcu = new MutationObserver(() => {
    if (planli) return;
    planli = true;
    setTimeout(denetle, 300);
  });
  gozcu.observe(belge.body, { childList: true, subtree: true });

  function durdur() {
    durdu = true;
    gozcu.disconnect();
    bolum?.remove();
  }

  return { durdur, yenile };
}
