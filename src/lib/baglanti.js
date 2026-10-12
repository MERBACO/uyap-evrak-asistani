/**
 * baglanti.js — when the page outlives the extension.
 *
 * Reloading or updating the extension while a UYAP tab stays open leaves that
 * tab running the old code with its line to the extension cut. Storage and
 * messaging then fail in two ways — "Extension context invalidated", or, once
 * chrome.storage itself has gone, "Cannot read properties of undefined (reading
 * 'local')" — and both reached the panel verbatim, which says nothing about the
 * one fix: reload the page.
 */

export const YENILE_MESAJI =
  'UYAP Dosyalama ve Evrak Asistanı yenilendi ya da güncellendi; bu sekme eski sürüme bağlı kaldı. ' +
  'Sayfayı yenileyin (F5), sonra yeniden deneyin.';

/** Whether an error means the extension is gone from under this page. */
export function eklentiKoptuMu(err) {
  return /Extension context invalidated|Receiving end does not exist|reading '(local|sendMessage|getURL)'/i.test(
    String(err?.message || err)
  );
}

/** The same, asked before trying: after the cut, chrome.storage is simply not there. */
export function eklentiBagliMi() {
  return Boolean(globalThis.chrome?.storage?.local);
}
