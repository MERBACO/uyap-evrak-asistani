/**
 * naming.js — turns a case file into a folder a human can actually read.
 *
 * The ordering rule: a numeric prefix, zero-padded to the width of the largest
 * index. That way the operating system's own alphabetical sort reproduces the
 * chronology exactly — no viewer, no database, no extension needed to read the
 * archive five years from now.
 */

const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

/** Strip characters that Windows, macOS or Linux refuse, without mangling Turkish letters. */
export function sanitizeSegment(input, maxLength = 80) {
  let s = String(input ?? '')
    // Case numbers read as 2026/403; keep them legible as 2026-403 rather than 2026 403.
    .replace(/[/\\]/g, '-')
    .replace(/[<>:"|?*\u0000-\u001f]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[\s.]+|[\s.]+$/g, '')
    .trim();

  if (!s) s = 'adsiz';
  if (WINDOWS_RESERVED.test(s)) s = `_${s}`;
  if (s.length > maxLength) s = s.slice(0, maxLength).trim();
  return s;
}

/**
 * Clean a user-typed destination into something chrome.downloads will accept.
 *
 * The API only writes *below* the browser's own download directory: absolute
 * paths and ".." are rejected outright, and a rejected path fails the download
 * rather than falling back. So normalise here and let the caller show the user
 * exactly where files will land.
 */
export function normalizeRoot(input) {
  const segments = String(input ?? '')
    .replace(/\\/g, '/')
    .split('/')
    .map((x) => x.trim())
    .filter((x) => x && x !== '.' && x !== '..')
    .map((x) => sanitizeSegment(x, 60));

  return segments.slice(0, 4).join('/') || 'UYAP Arsiv';
}

export function padWidth(total) {
  return Math.max(3, String(Math.max(1, total)).length);
}

export function isoToStamp(iso) {
  if (!iso) return '0000-00-00';
  return iso.slice(0, 10);
}

/**
 * Pick the heading that belongs to the listed case file.
 *
 * The page shows many "yyyy/nnn …" texts at once — the file list behind the
 * overlay, linked files, the overlay's own heading. Only one of them names the
 * file whose documents were just listed, and the API key says which number that
 * is: "2026/1234(Ceza Dava Dosyası)". A heading with another number is never
 * used; when the type is known too, a heading that also names it wins.
 *
 * @param {string[]} adaylar    heading-shaped texts, in page order
 * @param {string}   anaAnahtar the API's key for the main group
 * @returns {string} the heading, or '' to fall back to the API key
 */
export function basligiSec(adaylar, anaAnahtar) {
  const no = String(anaAnahtar || '').match(/^\s*(\d{4})\/0*(\d+)/);
  // Nothing to check against. The key can be empty altogether (a list path with
  // no wildcard), and then a heading is the only thing that gives the case file
  // a folder of its own — without one, every file lands loose in the root.
  if (!no) return adaylar[0] || '';

  const kucuk = (s) => String(s).toLocaleLowerCase('tr');
  const ayniNo = adaylar.filter((m) => {
    const b = String(m).match(/^\s*(\d{4})\/0*(\d+)\s/);
    return b && b[1] === no[1] && b[2] === no[2];
  });

  const tur = (String(anaAnahtar).match(/\(([^)]+)\)\s*$/) || [])[1];
  return (tur && ayniNo.find((m) => kucuk(m).includes(kucuk(tur)))) || ayniNo[0] || '';
}

/**
 * Build the on-disk path for one document.
 *
 * @param {Object}  o
 * @param {string}  o.root        top folder, e.g. "UYAP Arşiv"
 * @param {Object}  o.dosya       { birim, esasNo }
 * @param {Object}  o.evrak       canonical Evrak record
 * @param {number}  o.index       1-based position in chronological order
 * @param {number}  o.total       total document count, for padding width
 * @param {boolean} o.keepFolders mirror the portal's folder tree
 * @returns {string} relative path suitable for chrome.downloads.download
 */
export function buildPath({ root, dosya, evrak, index, total, keepFolders = true }) {
  const parts = [sanitizeSegment(root || 'UYAP Arsiv')];

  // When the folder tree already carries the case number, don't repeat it here.
  const dosyaKlasor = [dosya?.birim, dosya?.esasNo].filter(Boolean).join(' ');
  if (dosyaKlasor) parts.push(sanitizeSegment(dosyaKlasor, 120));

  if (keepFolders && evrak.klasor?.length) {
    for (const k of evrak.klasor) parts.push(sanitizeSegment(k, 60));
  }

  const no = String(index).padStart(padWidth(total), '0');
  const stamp = isoToStamp(evrak.tarih);
  const ad = sanitizeSegment(stripExtension(evrak.ad), 60);

  // The description — party names and the like — trails the type, so files sort
  // by what they are and still say who they concern.
  const aciklamaRaw = evrak.aciklama ? sanitizeSegment(evrak.aciklama, 60) : '';
  const aciklama =
    aciklamaRaw && !ad.toLocaleLowerCase('tr').includes(aciklamaRaw.toLocaleLowerCase('tr'))
      ? aciklamaRaw
      : '';

  // Where the document came from, in the name rather than in a folder: one flat
  // directory is easier to search, sort and move, and the origin still travels
  // with the file instead of living in a path that a copy would lose.
  const kaynak = evrak.kaynak ? sanitizeSegment(evrak.kaynak, 40) : '';

  const file = [no, stamp, kaynak, ad, aciklama].filter(Boolean).join('_');
  parts.push(`${file}.${(evrak.uzanti || 'pdf').replace(/[^a-z0-9]/gi, '') || 'pdf'}`);

  return parts.join('/');
}

function stripExtension(name) {
  return String(name ?? '').replace(/\.[a-z0-9]{2,4}$/i, '');
}

/**
 * UYAP serves PDFs, UDFs and scans from the same endpoint, and the document list
 * says nothing about which. Trust what the server sends, not a guess.
 */
const MIME_EXT = {
  'application/pdf': 'pdf',
  'text/udf': 'udf',
  'application/udf': 'udf',
  'application/x-udf': 'udf',
  'image/tiff': 'tif',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'application/zip': 'zip',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'text/plain': 'txt',
  'text/html': 'html'
};

export function extensionFrom(contentDisposition, contentType, fallback = 'pdf') {
  const cd = String(contentDisposition || '');
  const star = cd.match(/filename\*=(?:UTF-8'')?([^;]+)/i);
  const plain = cd.match(/filename="?([^";]+)"?/i);
  const name = star ? safeDecode(star[1]) : plain ? plain[1] : '';
  const fromName = name.match(/\.([a-z0-9]{2,5})$/i);
  if (fromName) return fromName[1].toLowerCase();

  const mime = String(contentType || '').split(';')[0].trim().toLowerCase();
  return MIME_EXT[mime] || fallback;
}

function safeDecode(s) {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}
