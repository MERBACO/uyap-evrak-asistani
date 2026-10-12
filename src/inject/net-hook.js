/**
 * net-hook.js — runs in the PAGE (MAIN) world.
 *
 * It watches the portal's own traffic so the downloader can reproduce it:
 *  1. Requests. The most recent list request per endpoint, kept so the panel can
 *     replay it verbatim instead of rebuilding it from a template.
 *  2. Ids. The case-file id, which travels in request bodies and never in the URL.
 *  3. Auth. The session headers the portal sends, kept in memory only, so replayed
 *     requests look exactly like the portal's own.
 *
 * This file never initiates a request on its own.
 */

(() => {
  const CH = '__uyap_arsiv__';

  // Headers the portal may use to authenticate. Held in memory for replay only:
  // never written to disk, never sent anywhere.
  const AUTH_HEADERS = ['authorization', 'x-auth-token', 'x-xsrf-token', 'x-csrf-token'];

  let lastAuthHeaders = {};

  // The portal opens case files in an overlay, so the address bar never carries
  // the file id. It does travel in the request bodies, though — remember the
  // last one seen there. Bodies only: the download URL reuses the name dosyaId
  // for the *document* id, which would poison this.
  let lastIds = {};

  // The portal already issues the exact request we need. Rebuilding it from a
  // template means guessing at ids, bodies and encodings; replaying it does not.
  // Keyed by pathname, so the newest call to each endpoint wins.
  let lastRequests = {};
  const ID_KEYS = /["']?\b(dosyaId|dosyaID|dosya_id|dosyaNo)\b["']?\s*[:=]\s*["']?([^"'&,}\s]{2,})/g;

  const send = (type, payload) =>
    document.dispatchEvent(new CustomEvent(CH, { detail: { type, payload } }));

  function noteAuth(headers) {
    for (const [k, v] of Object.entries(headers)) {
      if (AUTH_HEADERS.includes(k.toLowerCase()) && v) lastAuthHeaders[k] = v;
    }
  }

  // The download URL reuses the name dosyaId for the *document* id, so never
  // read ids from it. Every other request is fair game.
  const ID_SAFE = (url) => !/download_document|indir/i.test(String(url));

  function noteIds(body) {
    if (typeof body !== 'string' || !body) return;
    let m, touched = false;
    ID_KEYS.lastIndex = 0;
    while ((m = ID_KEYS.exec(body))) {
      lastIds.dosyaId = m[2];
      touched = true;
    }
    if (touched) send('ids-seen', { ids: { ...lastIds } });
  }

  // The portal issues a different list request per tree node ("Son 20 Evrak",
  // "Tüm Evrak", one folder). Keeping only the newest makes the result depend on
  // whatever was clicked last, so keep the recent distinct ones and let the
  // caller decide which is the most complete.
  const MAX_VARIANTS = 4;

  function noteRequest(method, url, body, headers) {
    try {
      const key = new URL(url, location.origin).pathname;
      const ct = Object.entries(headers || {}).find(([h]) => h.toLowerCase() === 'content-type');
      const entry = { method, url, body, contentType: ct ? ct[1] : null, ts: Date.now() };

      const list = (lastRequests[key] || []).filter((e) => !(e.url === url && e.body === body));
      list.unshift(entry);
      lastRequests[key] = list.slice(0, MAX_VARIANTS);
    } catch {
      /* not a usable URL — nothing to replay */
    }
  }

  function headersToObject(init) {
    const out = {};
    if (!init) return out;
    if (init instanceof Headers) {
      init.forEach((v, k) => (out[k] = v));
    } else if (Array.isArray(init)) {
      for (const [k, v] of init) out[k] = v;
    } else {
      Object.assign(out, init);
    }
    return out;
  }

  /* ---------------------------------------------------------------- fetch */
  const origFetch = window.fetch;
  // Not async: wrapping the portal's own fetch in an async function would add a
  // microtask to every request the page makes, for no gain — this hook only
  // observes and must stay out of the way.
  window.fetch = function (input, init = {}) {
    const url = typeof input === 'string' ? input : input?.url || String(input);
    const method = (init.method || (input && input.method) || 'GET').toUpperCase();
    const headers = headersToObject(init.headers || (input && input.headers));
    noteAuth(headers);

    if (typeof init.body === 'string') noteIds(init.body);
    if (ID_SAFE(url)) noteIds(url);
    noteRequest(method, url, typeof init.body === 'string' ? init.body : null, headers);

    return origFetch.apply(this, arguments);
  };

  /* ------------------------------------------------------------------ XHR */
  const XHR = XMLHttpRequest.prototype;
  const origOpen = XHR.open;
  const origSetHeader = XHR.setRequestHeader;
  const origSend = XHR.send;

  XHR.open = function (method, url, ...rest) {
    this.__ua = { method: String(method).toUpperCase(), url: String(url), headers: {} };
    return origOpen.call(this, method, url, ...rest);
  };

  XHR.setRequestHeader = function (name, value) {
    if (this.__ua) this.__ua.headers[name] = value;
    return origSetHeader.call(this, name, value);
  };

  XHR.send = function (body) {
    const meta = this.__ua;
    if (meta) {
      noteAuth(meta.headers);
      if (typeof body === 'string') noteIds(body);
      if (ID_SAFE(meta.url)) noteIds(meta.url);
      noteRequest(meta.method, meta.url, typeof body === 'string' ? body : null, meta.headers);
    }
    return origSend.call(this, body);
  };

  /* ------------------------------------------------- commands from bridge */
  document.addEventListener(CH + ':cmd', (e) => {
    const { type } = e.detail || {};
    if (type === 'auth-request') send('auth-headers', { headers: { ...lastAuthHeaders } });
    if (type === 'ids-request') send('ids-seen', { ids: { ...lastIds } });
    if (type === 'requests-request') send('requests-seen', { requests: { ...lastRequests } });
  });

  send('hook-ready', { at: location.href });
})();
