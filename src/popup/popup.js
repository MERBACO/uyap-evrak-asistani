/**
 * popup.js — the toolbar view.
 *
 * Mostly an explanation. The endpoint map ships inside the extension and is
 * re-derived from each live response, so there is nothing for a user to
 * configure — and a mapping editor within reach is mostly a way to break a
 * working install by accident. If UYAP ever changes its endpoints, the fix is a
 * one-line edit to presets/avukatbeta.json; see docs/ENDPOINT-DISCOVERY.md.
 *
 * One setting lives here: the quick mobile-signature login, because it holds
 * personal details. Entered in the extension's own page, they are never typed
 * into a page UYAP's scripts can read.
 */

import { OPERATORLER, bilgiyiDogrula, gsmMaskele, operatorAdi, tcMaskele } from '../lib/mobilimza.js';

document.querySelector('#surum').textContent = 'v' + chrome.runtime.getManifest().version;

const EDEVLET = ['https://giris.turkiye.gov.tr/*'];
const $ = (s) => document.querySelector(s);

const form = $('#hg-form');
const durum = $('#hg-durum');

for (const { kod, ad } of OPERATORLER) {
  const etiket = document.createElement('label');
  const kutu = document.createElement('input');
  kutu.type = 'radio';
  kutu.name = 'hg-operator';
  kutu.value = kod;
  etiket.append(kutu, ad);
  $('#hg-operator').appendChild(etiket);
}

function durumYaz(metin, tur = '') {
  durum.textContent = metin;
  durum.className = 'status' + (tur ? ' ' + tur : '');
}

async function goster() {
  const { mobilImza } = await chrome.storage.local.get('mobilImza');
  const izin = await chrome.permissions.contains({ origins: EDEVLET });
  $('#hg-kayitli').hidden = !mobilImza;
  $('#hg-kur-satiri').hidden = Boolean(mobilImza) || !form.hidden;
  if (mobilImza) {
    $('#hg-ozet').innerHTML = '';
    const satir = (etiket, deger) => {
      const b = document.createElement('b');
      b.textContent = etiket + ': ';
      $('#hg-ozet').append(b, deger, document.createElement('br'));
    };
    satir('T.C.', tcMaskele(mobilImza.tc));
    satir('GSM', `${gsmMaskele(mobilImza.gsm)} · ${operatorAdi(mobilImza.operator)}`);
    if (!izin) durumYaz("e-Devlet sayfasına erişim izni verilmemiş; Değiştir → Kaydet'e basıp izin verin.", 'err');
  }
}

function formuAc() {
  form.hidden = false;
  $('#hg-kur-satiri').hidden = true;
  // Never put the stored kimlik no back into a field: retyping is the safer default.
  $('#hg-tc').value = '';
  $('#hg-gsm').value = '';
  $('#hg-tc').focus();
  durumYaz('');
}

function formuKapat() {
  form.hidden = true;
  return goster();
}

$('#hg-kur').addEventListener('click', formuAc);
$('#hg-degistir').addEventListener('click', formuAc);
$('#hg-vazgec').addEventListener('click', () => {
  formuKapat();
  durumYaz('');
});

form.addEventListener('submit', (e) => {
  e.preventDefault();
  const sonuc = bilgiyiDogrula({
    tc: $('#hg-tc').value,
    gsm: $('#hg-gsm').value,
    operator: form.querySelector('input[name="hg-operator"]:checked')?.value
  });
  if (sonuc.hata) {
    durumYaz(sonuc.hata, 'err');
    return;
  }
  // Both start inside the click. The permission prompt can close the popup, and
  // whatever had not been started by then would never run.
  const kayit = chrome.storage.local.set({ mobilImza: sonuc.bilgi, hizliGirisGizli: false });
  const izin = chrome.permissions.request({ origins: EDEVLET });
  Promise.all([kayit, izin])
    .then(async ([, verildi]) => {
      // After the summary is drawn, or its own notice would replace this one.
      await formuKapat();
      if (verildi) durumYaz("Kaydedildi. UYAP'ın giriş sayfasında Giriş Yap düğmesi çıkacak.", 'ok');
      else durumYaz('Kaydedildi, ancak e-Devlet izni verilmedi; izin olmadan form doldurulamaz.', 'err');
    })
    .catch((err) => durumYaz('Kaydedilemedi: ' + (err?.message || err), 'err'));
});

$('#hg-sil').addEventListener('click', async () => {
  await chrome.storage.local.remove(['mobilImza', 'mobilImzaIstegi', 'mobilImzaImzala']);
  // Without details there is nothing to fill: give the access back too.
  await chrome.permissions.remove({ origins: EDEVLET }).catch(() => {});
  form.hidden = true;
  await goster();
  durumYaz('Bilgiler silindi ve e-Devlet erişim izni geri alındı.', 'ok');
});

/* ------------------------------------------------------------ hearings */

async function tabloDugmesi() {
  const { durusmaListesi } = await chrome.storage.local.get('durusmaListesi');
  $('#durusma-tablo').disabled = !durusmaListesi;
}
$('#durusma-tablo').addEventListener('click', () => chrome.runtime.sendMessage({ kind: 'durusmaTablosu' }));

tabloDugmesi();
goster();
if (location.hash === '#hizli-giris') {
  chrome.storage.local.get('mobilImza').then(({ mobilImza }) => {
    if (!mobilImza) formuAc();
  });
}
