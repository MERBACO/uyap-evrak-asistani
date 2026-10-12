/**
 * service-worker.js
 *
 * Deliberately thin. It owns the capabilities the page cannot have: writing to
 * disk, raising notifications, attaching the quick-login script to e-Devlet once
 * the lawyer has allowed it, and opening the hearing table. It never talks to
 * UYAP, e-Devlet or anyone else: it sends nothing over the network at all.
 */

// Asked for only when the lawyer saves their mobile-signature details in the
// popup. An install that never uses the quick login has no access to e-Devlet,
// and an update carrying the feature is not held back for a permission prompt.
const EDEVLET = ['https://giris.turkiye.gov.tr/*'];
const GIRIS_BETIGI = {
  id: 'edevlet-giris',
  matches: EDEVLET,
  js: ['src/content/edevlet-giris.js'],
  runAt: 'document_idle'
};

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.kind === 'download') {
    saveToDisk(msg.dataUrl, msg.path, msg.uzerineYaz === true).then(sendResponse);
    return true; // async
  }

  if (msg?.kind === 'bildir') {
    bildir(msg).then(() => sendResponse({ ok: true }));
    return true;
  }

  if (msg?.kind === 'hizliGirisIzni') {
    chrome.permissions.contains({ origins: EDEVLET }).then((izin) => sendResponse({ izin }));
    return true;
  }

  // The setup lives in the popup, which a content script cannot open: show it in a tab.
  if (msg?.kind === 'hizliGirisAyarlari') {
    chrome.tabs
      .create({ url: chrome.runtime.getURL('src/popup/popup.html') + '#hizli-giris' })
      .then(() => sendResponse({ ok: true }));
    return true;
  }

  if (msg?.kind === 'durusmaTablosu') {
    chrome.tabs.create({ url: chrome.runtime.getURL('src/popup/durusmalar.html') }).then(() => sendResponse({ ok: true }));
    return true;
  }

  return false;
});

/**
 * Keep the e-Devlet script registered exactly while the permission is held.
 * Re-registered on install and update, so a changed script takes effect.
 */
async function girisBetiginiEsitle(yenile = false) {
  try {
    const izin = await chrome.permissions.contains({ origins: EDEVLET });
    const kayitli = (await chrome.scripting.getRegisteredContentScripts({ ids: [GIRIS_BETIGI.id] })).length > 0;
    if (kayitli && (!izin || yenile)) await chrome.scripting.unregisterContentScripts({ ids: [GIRIS_BETIGI.id] });
    if (izin && (!kayitli || yenile)) await chrome.scripting.registerContentScripts([GIRIS_BETIGI]);
  } catch (err) {
    console.warn('[UYAP Arşiv] e-Devlet giriş betiği ayarlanamadı:', err);
  }
}

// One at a time: an install and a permission change can arrive together, and two
// overlapping runs would both see "not registered" and register twice.
let esitlemeSirasi = Promise.resolve();
const esitle = (yenile) => (esitlemeSirasi = esitlemeSirasi.then(() => girisBetiginiEsitle(yenile)));

chrome.runtime.onInstalled.addListener(() => {
  esitle(true);
  // Google Calendar sync was removed in 2.16.0; drop what it left in storage.
  chrome.storage.local
    .remove(['gtakvimId', 'gtakvimBagli', 'gtakvimOtomatik', 'gtakvimSon'])
    .catch(() => {});
});
chrome.runtime.onStartup.addListener(() => esitle(false));
chrome.permissions.onAdded.addListener(() => esitle(false));
chrome.permissions.onRemoved.addListener(() => esitle(false));

async function saveToDisk(dataUrl, path, uzerineYaz = false) {
  try {
    const downloadId = await chrome.downloads.download({
      url: dataUrl,
      filename: path,
      // Documents must never overwrite one another: two files can legitimately
      // share a name across runs, and losing one silently is worse than a suffix.
      // The index is the exception — it describes the whole folder and is
      // rebuilt every run, so a second copy beside it would only be stale.
      conflictAction: uzerineYaz ? 'overwrite' : 'uniquify',
      saveAs: false
    });
    return { ok: true, downloadId };
  } catch (err) {
    // Chrome refuses oversized data: URLs. Very large scanned documents are the
    // realistic trigger; say so plainly instead of failing silently.
    const msg = String(err?.message || err);
    return {
      ok: false,
      error: /data:|url/i.test(msg)
        ? 'Evrak tarayıcının indirme sınırını aştı (çok büyük tarama olabilir). Bu evrağı portaldan tek tek indirin.'
        : msg
    };
  }
}

/**
 * A long download runs while the lawyer is doing something else. Failures that
 * only appear in a panel behind another window are failures nobody sees, so
 * raise them where the operating system will show them.
 */
async function bildir({ basarisiz, toplam, sebep }) {
  try {
    await chrome.notifications.create({
      type: 'basic',
      iconUrl: chrome.runtime.getURL('icons/icon128.png'),
      title: 'UYAP Dosyalama ve Evrak Asistanı — indirilemeyen evrak var',
      message:
        `${toplam} evraktan ${basarisiz} tanesi alınamadı.` + (sebep ? `\n${String(sebep).slice(0, 160)}` : ''),
      priority: 2
    });
  } catch (err) {
    // A missing notification must never take the download down with it.
    console.warn('[UYAP Arşiv] bildirim gönderilemedi:', err);
  }
}
