/**
 * hizli-giris.js — one-click mobile-signature login, inside the panel.
 *
 * UYAP hands mobile-signature logins to e-Devlet: "E-Devlet İle Giriş" →
 * "Mobil İmza İle Giriş" → a form on giris.turkiye.gov.tr. On UYAP's login page
 * the panel shows a login section in place of its listing controls, which mean
 * nothing before a case file is open. Its button takes the first two steps and
 * leaves a short-lived note in storage; src/content/edevlet-giris.js finds the
 * note on the e-Devlet side, fills the form, sends it and presses "İmzala".
 * What is left is the confirmation on the phone.
 *
 * The section never puts the kimlik no or the full GSM number into the page:
 * UYAP's own scripts can read this DOM. It shows the masked number only, and the
 * details are entered in the extension's popup, where the page cannot see them.
 */

import { gsmMaskele, operatorAdi } from '../lib/mobilimza.js';

/** How the panel reaches UYAP's buttons: DevExtreme reacts to pointer events, not to a bare click(). */
function bas(el) {
  const r = el.getBoundingClientRect();
  const o = {
    bubbles: true,
    cancelable: true,
    composed: true,
    clientX: r.x + r.width / 2,
    clientY: r.y + r.height / 2,
    button: 0,
    pointerId: 1,
    pointerType: 'mouse',
    isPrimary: true
  };
  for (const tur of ['pointerdown', 'mousedown', 'pointerup', 'mouseup']) {
    el.dispatchEvent(tur.startsWith('pointer') ? new PointerEvent(tur, o) : new MouseEvent(tur, o));
  }
  el.dispatchEvent(new MouseEvent('click', o));
}

const kucuk = (s) => (s || '').trim().toLocaleLowerCase('tr');

/** UYAP's own "E-Devlet İle Giriş" button: its presence is what makes a page the login page. */
function edevletDugmesi(belge) {
  return [...belge.querySelectorAll('.dx-button')].find((el) => kucuk(el.textContent).includes('e-devlet ile giriş'));
}

function mobilImzaSecenegi(belge) {
  return [...belge.querySelectorAll('.dx-list-item, [role="option"]')].find((el) =>
    kucuk(el.textContent).includes('mobil imza')
  );
}

const bekle = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * @param {Object} ctx
 * @param {Document} [ctx.belge]
 * @param {{get: Function, set: Function}} ctx.depo   chrome.storage.local
 * @param {(msg: Object) => Promise<any>} ctx.mesaj   chrome.runtime.sendMessage
 * @param {() => number} [ctx.simdi]
 */
export function hizliGirisiKur({ belge = document, depo, mesaj, simdi = Date.now }) {
  let bolum = null;
  let gizlendi = false;
  let kuruluyor = false;

  const panelGovdesi = () => belge.querySelector('#ua-panel .ua-body');

  async function bolumuKur() {
    if (kuruluyor || gizlendi) return;
    kuruluyor = true;
    try {
      const { mobilImza, hizliGirisGizli } = await depo.get(['mobilImza', 'hizliGirisGizli']);
      if (!mobilImza && hizliGirisGizli) return;
      let izin = false;
      if (mobilImza) {
        try {
          izin = Boolean((await mesaj({ kind: 'hizliGirisIzni' }))?.izin);
        } catch {
          /* the extension was reloaded under the page; the section says how to set it up */
        }
      }
      // The login page or the panel may have gone while storage answered.
      const govde = panelGovdesi();
      if (!edevletDugmesi(belge) || !govde || gizlendi || durdu) return;
      bolum?.remove();
      bolum = bolumYap(mobilImza, izin);
      govde.prepend(bolum);
      govde.closest('#ua-panel')?.classList.add('is-giris');
    } finally {
      kuruluyor = false;
    }
  }

  function bolumYap(bilgi, izin) {
    const b = belge.createElement('div');
    b.id = 'ua-giris';
    b.className = 'ua-giris';

    const baslik = belge.createElement('div');
    baslik.className = 'ua-giris-baslik';
    baslik.textContent = 'Mobil İmza ile Giriş';
    const metin = belge.createElement('p');
    const durum = belge.createElement('p');
    durum.className = 'ua-giris-durum';
    durum.setAttribute('aria-live', 'polite');
    const dugmeler = belge.createElement('div');
    dugmeler.className = 'ua-bar';

    const dugme = (yazi, sinif, fn) => {
      const d = belge.createElement('button');
      d.type = 'button';
      d.className = sinif;
      d.textContent = yazi;
      d.addEventListener('click', fn);
      dugmeler.appendChild(d);
      return d;
    };
    const ayarlar = () => mesaj({ kind: 'hizliGirisAyarlari' }).catch(() => {});

    if (bilgi && izin) {
      metin.className = 'ua-giris-numara';
      metin.textContent = `${gsmMaskele(bilgi.gsm)} · ${operatorAdi(bilgi.operator)}`;
      const giris = dugme('Giriş Yap', 'ua-btn ua-btn-primary', async () => {
        giris.disabled = true;
        durum.textContent = "e-Devlet'e yönlendiriliyor…";
        await girisiBaslat(durum);
        giris.disabled = false;
      });
      dugme('Bilgileri değiştir', 'ua-btn ua-btn-link', ayarlar);
    } else if (bilgi) {
      metin.className = 'ua-lead';
      metin.textContent =
        "Bilgileriniz kayıtlı ama eklentinin e-Devlet giriş sayfasına erişim izni yok. Kurulumu açıp Kaydet'e basın ve izin verin.";
      dugme('Kurulumu Aç', 'ua-btn ua-btn-primary', ayarlar);
    } else {
      metin.className = 'ua-lead';
      metin.textContent =
        'Bilgilerinizi bir kez kaydedin; sonra tek tıkla giriş yapılır, siz yalnızca telefonunuzdan onaylarsınız.';
      dugme('Kur', 'ua-btn ua-btn-primary', ayarlar);
      dugme('Gösterme', 'ua-btn ua-btn-link', async () => {
        gizlendi = true;
        kaldir();
        await depo.set({ hizliGirisGizli: true });
      });
    }

    b.append(baslik, metin, dugmeler, durum);
    return b;
  }

  async function girisiBaslat(durum) {
    // The note is the e-Devlet side's only reason to touch its form: without a
    // fresh one, a visit to e-Devlet for anything else is left alone.
    await depo.set({ mobilImzaIstegi: simdi() });

    const ed = edevletDugmesi(belge);
    let secenek = mobilImzaSecenegi(belge);
    if (ed && !secenek) {
      bas(ed);
      // DevExtreme builds the menu on first open.
      for (let i = 0; i < 30 && !(secenek = mobilImzaSecenegi(belge)); i++) await bekle(100);
    }
    if (secenek) {
      bas(secenek);
      durum.textContent = 'e-Devlet açılıyor; bilgileriniz doldurulup imzaya gönderilecek, telefonunuzdan onaylayın.';
      return;
    }
    durum.textContent =
      "UYAP'ın giriş düğmeleri bulunamadı. \"E-Devlet İle Giriş\" → \"Mobil İmza İle Giriş\"i kendiniz seçin; bilgileriniz e-Devlet'te yine doldurulur.";
  }

  function kaldir() {
    bolum?.closest('#ua-panel')?.classList.remove('is-giris');
    bolum?.remove();
    bolum = null;
    belge.querySelector('#ua-panel.is-giris')?.classList.remove('is-giris');
  }

  // UYAP is a single-page app: the login screen comes and goes without a reload
  // (a logout, an expired session), and the panel redraws its body on its own.
  // Follow UYAP's button rather than the address, and put the section back
  // whenever the panel has dropped it.
  let planli = false;
  let durdu = false;
  function denetle() {
    planli = false;
    if (durdu) return;
    if (!edevletDugmesi(belge)) return kaldir();
    if (!bolum?.isConnected) bolumuKur();
  }
  const gozcu = new MutationObserver(() => {
    if (planli) return;
    planli = true;
    setTimeout(denetle, 300);
  });
  gozcu.observe(belge.body, { childList: true, subtree: true });
  denetle();

  return {
    durdur() {
      durdu = true;
      gozcu.disconnect();
      kaldir();
    }
  };
}
