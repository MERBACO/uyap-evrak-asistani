/**
 * bridge.js — runs in the ISOLATED world of the portal page.
 *
 * Why the work happens here and not in the service worker: requests made from
 * this context carry the portal's own cookies and go out from the portal's own
 * origin, so UYAP sees exactly what it would see if the lawyer had clicked the
 * document. No credential is copied, stored or re-created anywhere.
 *
 * The service worker only ever receives finished bytes plus a target filename.
 */

const CH = '__uyap_arsiv__';

let authHeaders = {};
let lastIds = {};
let lastRequests = {};
let requestWaiters = [];
let preset = null;

/* ----------------------------------------------------- talk to the MAIN world */

document.addEventListener(CH, (e) => {
  const { type, payload } = e.detail || {};
  if (type === 'auth-headers') authHeaders = payload.headers || {};
  if (type === 'ids-seen') lastIds = { ...lastIds, ...(payload.ids || {}) };
  if (type === 'requests-seen') {
    lastRequests = { ...lastRequests, ...(payload.requests || {}) };
    const waiters = requestWaiters;
    requestWaiters = [];
    waiters.forEach((fn) => fn());
  }
  if (type === 'hook-ready') {
    requestAuthHeaders();
    cmd('ids-request');
    cmd('requests-request');
  }
});

const cmd = (type) => document.dispatchEvent(new CustomEvent(CH + ':cmd', { detail: { type } }));
const requestAuthHeaders = () => cmd('auth-request');


/* ------------------------------------------------------------------ requests */

class HttpError extends Error {
  /**
   * @param {string} [govde]  the start of the response's text, so the panel can
   *   tell what the server actually said — UYAP's security notice arrives this
   *   way, and a bare status code would read as an expired session.
   */
  constructor(status, message, govde = '') {
    super(message || `HTTP ${status}`);
    this.status = status;
    this.govde = govde;
  }
}

/** The first couple of thousand characters of a response, as plain text. */
async function yanitMetni(res) {
  try {
    return (await res.text())
      .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 2000);
  } catch {
    return '';
  }
}

/**
 * A request that gives up.
 *
 * Without a deadline a stalled request waits for the browser's own timeout,
 * which is minutes. Across a thousand documents a handful of stalls dominates
 * the whole run, so cut them off early: a document that has not started
 * answering within the deadline is not going to.
 */
async function portalFetch({ url, method, headers, body }, asBlob = false, zamanAsimi = 25000) {
  requestAuthHeaders();

  const durdurucu = new AbortController();
  const sayac = setTimeout(() => durdurucu.abort(), zamanAsimi);

  let res;
  try {
    res = await fetch(url, {
      method,
      headers: { ...headers, ...authHeaders },
      body,
      credentials: 'include',
      redirect: 'follow',
      signal: durdurucu.signal
    });
  } catch (err) {
    if (err?.name === 'AbortError') {
      throw new HttpError(null, `Sunucu ${Math.round(zamanAsimi / 1000)} saniyede yanıt vermedi.`);
    }
    throw err;
  } finally {
    clearTimeout(sayac);
  }

  if (!res.ok) {
    throw new HttpError(res.status, `${method} ${new URL(url).pathname} → ${res.status}`, await yanitMetni(res));
  }
  if (!asBlob) {
    // A page where JSON was expected is the server saying something in prose —
    // a block, a maintenance notice. Keep its words instead of a parse error.
    const metin = await res.text();
    try {
      return JSON.parse(metin);
    } catch {
      const duz = metin.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 2000);
      throw new HttpError(res.status, `${method} ${new URL(url).pathname}: sunucu beklenen yanıtı vermedi`, duz);
    }
  }

  // The list gives no file extension; the response headers do.
  return {
    blob: await res.blob(),
    contentType: res.headers.get('content-type') || '',
    contentDisposition: res.headers.get('content-disposition') || ''
  };
}

/* ------------------------------------------------- blob → service worker hop */

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result);
    fr.onerror = () => reject(new Error('Evrak okunamadı.'));
    fr.readAsDataURL(blob);
  });
}

/**
 * @param {Object} [secenek]
 * @param {boolean} [secenek.uzerineYaz]  replace a file of the same name. Only
 *   for files regenerated whole each time, like the index — never a document.
 */
async function saveBlob(blob, path, secenek = {}) {
  // MV3 service workers cannot create object URLs, so bytes travel as a data URL.
  // Fine for court documents; large scans are the one case worth watching.
  const dataUrl = await blobToDataUrl(blob);
  const res = await chrome.runtime.sendMessage({
    kind: 'download',
    dataUrl,
    path,
    uzerineYaz: Boolean(secenek.uzerineYaz)
  });
  if (!res?.ok) throw new Error(res?.error || 'İndirme başarısız.');
  return res.downloadId;
}

async function bildir(payload) {
  try {
    await chrome.runtime.sendMessage({ kind: 'bildir', ...payload });
  } catch {
    /* the extension may have been reloaded; a lost notification is not fatal */
  }
}

/**
 * Hand a finished archive to the browser as one download.
 *
 * The downloads API cannot take a Blob from the service worker, and a data: URL
 * of a few hundred megabytes is not viable — so the file is delivered from the
 * page with an object URL, which also means one save prompt at most instead of
 * one per document.
 */
async function zipIndir(blob, dosyaAdi) {
  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement('a');
    a.href = url;
    a.download = dosyaAdi;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    // Give the browser a moment to start reading before the URL is revoked.
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }
}

/**
 * Open the merged document and start printing.
 *
 * The browser's PDF viewer is what actually prints; handing it a blob URL gets
 * one dialog for the whole case file instead of one per document. Some builds
 * refuse a print() call on a viewer tab, so the tab is left open either way —
 * the user can print from the viewer's own button.
 */
async function yazdirmayaGonder(blob, ad = 'UYAP Dosyalama ve Evrak Asistanı') {
  const url = URL.createObjectURL(blob);
  const pencere = window.open(url, '_blank');
  if (!pencere) {
    URL.revokeObjectURL(url);
    throw new Error('Tarayıcı yeni sekmeyi engelledi. Adres çubuğundaki engelleme simgesinden izin verin.');
  }
  // Everything about the opened tab is best-effort. It hosts the browser's PDF
  // viewer, and touching its document can raise a security error depending on
  // the build — which used to escape this function and make the caller believe
  // printing had failed, so it saved the file instead.
  try {
    pencere.document.title = ad;
  } catch {
    /* the viewer owns its own document; the title is cosmetic */
  }

  setTimeout(() => {
    try {
      pencere.focus();
      pencere.print();
    } catch {
      /* the viewer would not take a programmatic print — its own button works */
    }
  }, 1200);
  setTimeout(() => URL.revokeObjectURL(url), 120000);
}

/* --------------------------------------------------------------- panel mount */

// The shipped map, verbatim. A stored copy is only valid against this exact text.
let paketMetni = '';

/**
 * The shipped map, or the copy the panel learned fields into — but only while
 * the shipped map is the one it was learned from.
 *
 * The stored copy used to win unconditionally. Since every listing saves one,
 * an update to presets/avukatbeta.json never reached anyone who had listed a
 * file even once: the fix the README promises ("one preset PR repairs every
 * install") silently did nothing. Learned fields are re-derived on every
 * listing anyway, so discarding them on a change costs nothing.
 */
async function loadPreset() {
  const url = chrome.runtime.getURL('presets/avukatbeta.json');
  paketMetni = await (await fetch(url)).text();

  const { preset, presetKaynagi } = await chrome.storage.local.get(['preset', 'presetKaynagi']);
  if (preset && presetKaynagi === paketMetni) return preset;
  return JSON.parse(paketMetni);
}

async function boot() {
  preset = await loadPreset();
  const { mountPanel } = await import(chrome.runtime.getURL('src/content/panel.js'));
  mountPanel({
    preset,
    portalFetch,
    saveBlob,
    bildir,
    zipIndir,
    yazdirmayaGonder,
    getDosyaId: () => lastIds.dosyaId || null,
    getRequests,
    savePreset: async (p) => {
      preset = p;
      await chrome.storage.local.set({ preset: p, presetKaynagi: paketMetni });
    }
  });

  // The hearing list lives in the panel's body, so it comes after the panel.
  const { durusmalariKur } = await import(chrome.runtime.getURL('src/content/durusmalar.js'));
  durusmalariKur({
    preset,
    portalFetch,
    getRequests,
    depo: chrome.storage.local,
    mesaj: (m) => chrome.runtime.sendMessage(m)
  });
}

/**
 * The portal's own recent requests to a path.
 * Asking the page world is a round trip. Returning the stale cache made the
 * result depend on timing — the very thing this was meant to remove.
 */
function getRequests(pathname) {
  return new Promise((resolve) => {
    const done = () => resolve(lastRequests[pathname] || []);
    requestWaiters.push(done);
    cmd('requests-request');
    setTimeout(done, 500); // the page world may be gone; don't hang the panel
  });
}

// UYAP has served the V3 interface from both hosts during the migration.
const PORTAL_HOSTS = ['avukat.uyap.gov.tr', 'avukatbeta.uyap.gov.tr'];

/** The one-click mobile-signature card; it shows itself only on the login page. */
async function hizliGiris() {
  const { hizliGirisiKur } = await import(chrome.runtime.getURL('src/content/hizli-giris.js'));
  hizliGirisiKur({ depo: chrome.storage.local, mesaj: (m) => chrome.runtime.sendMessage(m) });
}

if (PORTAL_HOSTS.includes(location.hostname)) {
  boot().catch((err) => console.error('[UYAP Arşiv] açılamadı:', err));
  hizliGiris().catch((err) => console.error('[UYAP Arşiv] hızlı giriş açılamadı:', err));
}
