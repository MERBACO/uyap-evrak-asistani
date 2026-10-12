/**
 * html.js — turn an HTML document into paragraphs.
 *
 * UYAP serves some documents as HTML: vekalet pulu makbuzu, vekaletname ek
 * evrak, and other receipts produced by the portal itself. They downloaded fine
 * and then fell out of the printout with "bu biçim yazdırılamadı", because
 * nothing here could render them.
 *
 * This is not a browser engine and does not pretend to be one. It keeps what
 * these documents actually carry — lines of text, table rows, and which parts
 * are emphasised — and drops the rest. A receipt reads correctly; a page built
 * on floated layout would not, and no such document has been seen from UYAP.
 */

const BLOK = new Set([
  'p', 'div', 'br', 'tr', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'section', 'article', 'header', 'footer', 'hr', 'table', 'thead', 'tbody', 'blockquote'
]);
const KALIN = new Set(['b', 'strong', 'th', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6']);
const ATLA = new Set(['script', 'style', 'head', 'noscript', 'svg']);

/**
 * @param {string} html
 * @returns {Array} paragraphs in the shape udfCozumle produces
 */
export function htmlParagraflar(html) {
  // A document served without <html>/<body> can parse into an empty body
  // depending on the parser. Wrapping it costs nothing and turns a silently
  // blank page into the document it was.
  const metinVar = /\S/.test(String(html).replace(/<[^>]*>/g, ''));
  const kaynak = /<body[\s>]/i.test(html) ? html : `<!DOCTYPE html><html><body>${html}</body></html>`;

  const doc = new DOMParser().parseFromString(kaynak, 'text/html');
  const kok = doc.body || doc.documentElement;
  if (!kok) return [];

  const paragraflar = [];
  let satir = [];

  const satirBitir = () => {
    // Blank lines between blocks are the browser's doing, not the document's;
    // carrying them over would stretch a short receipt across two pages.
    if (satir.some((p) => p.metin.trim())) {
      paragraflar.push({
        hiza: 'left',
        boyut: 11,
        ustBosluk: 0,
        altBosluk: 2,
        sekmeler: [],
        parcalar: satir
      });
    }
    satir = [];
  };

  const gez = (dugum, kalin) => {
    for (const cocuk of dugum.childNodes) {
      if (cocuk.nodeType === 3) {
        const metin = String(cocuk.nodeValue || '').replace(/\s+/g, ' ');
        if (metin.trim()) satir.push({ metin, kalin, boyut: 11 });
        continue;
      }
      if (cocuk.nodeType !== 1) continue;

      const etiket = cocuk.tagName.toLowerCase();
      if (ATLA.has(etiket)) continue;

      // Cells are separated, not run together: "Tutar500,00 TL" is not a row.
      // Header cells too — they are the row that labels all the others.
      if ((etiket === 'td' || etiket === 'th') && satir.length) {
        satir.push({ metin: '   ', kalin: false, boyut: 11 });
      }

      if (BLOK.has(etiket)) satirBitir();
      gez(cocuk, kalin || KALIN.has(etiket));
      if (BLOK.has(etiket)) satirBitir();
    }
  };

  gez(kok, false);
  satirBitir();

  // Text went in and nothing came out: better to show the stripped text than to
  // report the document as unprintable.
  if (!paragraflar.length && metinVar) {
    const duz = String(html)
      .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (duz) {
      paragraflar.push({
        hiza: 'left',
        boyut: 11,
        ustBosluk: 0,
        altBosluk: 2,
        sekmeler: [],
        parcalar: [{ metin: duz, kalin: false, boyut: 11 }]
      });
    }
  }
  return paragraflar;
}

/** Does this look like an HTML document rather than a binary one? */
export function htmlMi(bytes, contentType = '') {
  if (/text\/html|application\/xhtml/i.test(contentType)) return true;

  // Sniff the opening bytes: "<!DOCTYPE", "<html", "<HTML", or a leading tag.
  const bas = new TextDecoder('utf-8', { fatal: false })
    .decode(bytes.subarray(0, 200))
    .trim()
    .toLowerCase();
  return bas.startsWith('<!doctype html') || bas.startsWith('<html') || /^<\w+[\s>]/.test(bas);
}
