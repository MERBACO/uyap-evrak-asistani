/**
 * edevlet-giris.js — fills e-Devlet's mobile-signature form for a UYAP login.
 *
 * Runs on giris.turkiye.gov.tr, and only once the lawyer has granted that site
 * from the popup: the service worker registers it then, so installs that never
 * use the quick login neither ask for nor get access to e-Devlet.
 *
 * It acts only when both hold:
 *   - the lawyer pressed "Giriş Yap" on UYAP's login page in the last 90 seconds
 *     (src/content/hizli-giris.js leaves the note), and
 *   - this e-Devlet login returns to UYAP.
 * Any other visit to e-Devlet — a login to e-Devlet itself, another site's — is
 * left untouched. The note is used up before the form is sent, so an error page
 * or a reload never sends it twice.
 *
 * After "Devam Et" e-Devlet shows a second step with an "İmzala" button, which
 * is what sends the request to the phone. Sending the form leaves a second,
 * shorter-lived note; the page that carries the button — the next page load, or
 * the same page redrawn — presses it once and uses the note up. That page may no
 * longer carry UYAP's address, so here the note alone, which only this script
 * writes and only for a UYAP login, is the permission.
 *
 * A classic script, not a module: it cannot import from the extension without
 * making extension files visible to e-Devlet's pages.
 */

const ISTEK_OMRU = 90_000;
const IMZALA_OMRU = 60_000;
const UYAP_HOSTLARI = ['avukat.uyap.gov.tr', 'avukatbeta.uyap.gov.tr'];
const MOBIL_IMZA_YOLU = /^\/Giris\/Mobil-Imza/i;

function istekTazeMi(istek, simdi, omur = ISTEK_OMRU) {
  return typeof istek === 'number' && simdi >= istek && simdi - istek < omur;
}

/** The second step's button: exactly "İmzala", nothing that merely contains it. */
function imzalaDugmesi(belge) {
  const adaylar = belge.querySelectorAll('button, input[type="submit"], input[type="button"], a.btn, [role="button"]');
  return [...adaylar].find((el) => {
    const yazi = (el.tagName === 'INPUT' ? el.value : el.textContent) || '';
    return yazi.trim().toLocaleLowerCase('tr') === 'imzala' && !el.disabled;
  });
}

/**
 * Press "İmzala" once it appears.
 * @returns {Promise<string>} 'imzalandı' or 'imzala yok'
 */
async function imzala({ belge, depo, sure = 20_000 }) {
  let dugme = null;
  for (let t = 0; t < sure && !(dugme = imzalaDugmesi(belge)); t += 200) await bekle(200);
  if (!dugme) return 'imzala yok';
  await depo.remove('mobilImzaImzala');
  bilgiNotu(belge, "İmzala'ya basıldı. Telefonunuza gelen mobil imza isteğini onaylayın.");
  dugme.click();
  return 'imzalandı';
}

/**
 * Whether this login hands the session back to UYAP. e-Devlet carries the
 * destination as `continue` → its OAuth address → `redirect_uri`.
 */
function uyapDonusuMu(arama) {
  try {
    const devam = new URL(new URLSearchParams(arama).get('continue') || '');
    const donus = new URL(devam.searchParams.get('redirect_uri') || '');
    return donus.protocol === 'https:' && UYAP_HOSTLARI.includes(donus.hostname);
  } catch {
    return false;
  }
}

/** Set a field the way typing would, so e-Devlet's own scripts see the value. */
function alaniDoldur(alan, deger) {
  alan.focus();
  alan.value = deger;
  alan.dispatchEvent(new Event('input', { bubbles: true }));
  alan.dispatchEvent(new Event('change', { bubbles: true }));
  alan.blur();
}

/** @returns {boolean} whether every field was found and filled */
function formuDoldur(belge, { tc, gsm, operator }) {
  const tcAlani = belge.querySelector('#tridField');
  const gsmAlani = belge.querySelector('#gsmField');
  const operatorKutusu = [...belge.querySelectorAll('input[name="gsmtype"]')].find((k) => k.id === operator);
  if (!tcAlani || !gsmAlani || !operatorKutusu) return false;
  alaniDoldur(tcAlani, tc);
  alaniDoldur(gsmAlani, gsm);
  operatorKutusu.checked = true;
  operatorKutusu.dispatchEvent(new Event('change', { bubbles: true }));
  return tcAlani.value === tc && gsmAlani.value === gsm && operatorKutusu.checked;
}

function bilgiNotu(belge, metin, hata = false) {
  let not = belge.getElementById('ua-edevlet-not');
  if (!not) {
    not = belge.createElement('div');
    not.id = 'ua-edevlet-not';
    not.setAttribute('role', 'status');
    not.style.cssText =
      'position:fixed;left:50%;top:16px;transform:translateX(-50%);z-index:2147483000;max-width:min(560px,92vw);' +
      'padding:10px 16px;border-radius:4px;color:#fff;font:600 13px/1.45 "Segoe UI",Roboto,Arial,sans-serif;' +
      'box-shadow:0 8px 24px rgba(22,32,46,.25)';
    belge.body.appendChild(not);
  }
  not.style.background = hata ? '#93221f' : '#16202e';
  not.textContent = 'UYAP Dosyalama ve Evrak Asistanı: ' + metin;
}

const bekle = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * @param {Object} ctx
 * @param {Document} ctx.belge
 * @param {{pathname: string, search: string}} ctx.konum
 * @param {{get: Function, set: Function, remove: Function}} ctx.depo   chrome.storage.local
 * @param {() => number} ctx.simdi
 * @returns {Promise<string>} what was done, for the test
 */
async function calistir({ belge, konum, depo, simdi }) {
  const { mobilImza, mobilImzaIstegi, mobilImzaImzala } = await depo.get([
    'mobilImza',
    'mobilImzaIstegi',
    'mobilImzaImzala'
  ]);
  if (!mobilImza) return 'istek yok';
  // A fresh login request wins over a leftover signing note: pressing "Giriş
  // Yap" again after a failed try must fill the form, not wait for a button.
  if (!istekTazeMi(mobilImzaIstegi, simdi())) {
    return istekTazeMi(mobilImzaImzala, simdi(), IMZALA_OMRU) ? imzala({ belge, depo }) : 'istek yok';
  }
  if (!uyapDonusuMu(konum.search)) return 'uyap dönüşü değil';

  if (!MOBIL_IMZA_YOLU.test(konum.pathname)) {
    // Landed on another tab of the login page: switch to mobile signature and
    // leave the note for the page that loads next.
    const sekme = belge.querySelector('a[href*="/Giris/Mobil-Imza"]');
    if (sekme) sekme.click();
    return 'sekme değiştirildi';
  }

  await depo.remove('mobilImzaIstegi');

  let doldu = false;
  for (let i = 0; i < 50 && !(doldu = formuDoldur(belge, mobilImza)); i++) await bekle(100);
  if (!doldu) {
    bilgiNotu(belge, 'Mobil imza formu tanınmadı; bilgileri kendiniz yazın. (e-Devlet sayfası değişmiş olabilir.)', true);
    return 'form bulunamadı';
  }

  const gonder = belge.querySelector('button[name="submitButton"], #loginForm button[type="submit"]');
  if (!gonder) {
    bilgiNotu(belge, 'Bilgileriniz dolduruldu. "Devam Et"e basın, sonra telefonunuzdan onaylayın.');
    return 'dolduruldu';
  }
  bilgiNotu(belge, 'Bilgileriniz dolduruldu ve gönderildi; imza adımı bekleniyor.');
  // A moment for e-Devlet's scripts to take in the values before the submit.
  await bekle(300);
  await depo.set({ mobilImzaImzala: simdi() });
  gonder.click();
  // If e-Devlet redraws this page instead of loading a new one, the button
  // appears here; if it loads a new one, this script ends and the next run
  // finds the note.
  return (await imzala({ belge, depo })) === 'imzalandı' ? 'gönderildi ve imzalandı' : 'gönderildi';
}

if (location.hostname === 'giris.turkiye.gov.tr') {
  calistir({ belge: document, konum: location, depo: chrome.storage.local, simdi: Date.now }).catch((err) =>
    console.warn('[UYAP Arşiv] mobil imza formu doldurulamadı:', err)
  );
}
