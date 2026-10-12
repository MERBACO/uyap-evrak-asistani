/**
 * arama.js — matching a search against documents, the way a lawyer types it.
 *
 * Typed in a hurry, "bilirkisi raporu" means "Bilirkişi Raporu": case, Turkish
 * letters and word order should not decide whether a document is found. So
 * both sides are folded the same way — Turkish lower case, then ç→c, ğ→g, ı→i,
 * ö→o, ş→s, ü→u, â→a and the like — and every word of the query must appear
 * somewhere, in any order.
 *
 * Folding works character by character, so positions in the folded text are
 * positions in the original: the excerpt shown under a result is cut from the
 * real text, with its real letters.
 */

// The last four are not Turkish letters: they are what Turkish letters become
// in documents made with old Latin-1 fonts — İ shown as Đ or Ý, ş as þ, ğ as ð.
// Seen in a real government PDF ("TÜBĐTAK"); folding them lets such a document
// still be found.
const KATLA = {
  ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u', â: 'a', î: 'i', û: 'u', é: 'e',
  đ: 'i', ý: 'i', þ: 's', ð: 'g'
};

/** One character, folded; always exactly one character long. */
function katlaKarakter(ch) {
  const kucuk = ch.toLocaleLowerCase('tr');
  const k = kucuk.length === 1 ? kucuk : ch.toLowerCase().charAt(0) || ch;
  if (/\s/.test(k)) return ' ';
  return KATLA[k] ?? k;
}

/** The text as the search sees it — same length as the input. */
export function katla(metin) {
  let s = '';
  for (const ch of String(metin ?? '')) {
    // Characters outside the BMP take two code units; keep the length equal.
    const k = katlaKarakter(ch);
    s += ch.length === 2 ? k + ' ' : k;
  }
  return s;
}

/** The words of a query, folded. Empty for a blank query. */
export function sorguKelimeleri(sorgu) {
  return katla(sorgu)
    .split(' ')
    .filter(Boolean);
}

/**
 * The passage around the first word of the query that occurs in the text.
 *
 * @param {string} metin       the original text
 * @param {string} katlanmis   katla(metin), passed in so a long text is folded once
 * @param {string[]} kelimeler the folded query words
 * @param {number} pay         characters of context on each side
 * @returns {{once: string, eslesen: string, sonra: string}|null}
 */
export function alintiBul(metin, katlanmis, kelimeler, pay = 60) {
  let konum = -1;
  let uzunluk = 0;
  for (const k of kelimeler) {
    const i = katlanmis.indexOf(k);
    if (i !== -1 && (konum === -1 || i < konum)) {
      konum = i;
      uzunluk = k.length;
    }
  }
  if (konum === -1) return null;

  let bas = Math.max(0, konum - pay);
  let son = Math.min(metin.length, konum + uzunluk + pay);
  // Start and end on word boundaries where there is one nearby.
  const solBosluk = metin.lastIndexOf(' ', konum - 1);
  if (bas > 0 && solBosluk > bas && solBosluk - bas < 20) bas = solBosluk + 1;
  const sagBosluk = metin.indexOf(' ', konum + uzunluk);
  if (son < metin.length && sagBosluk !== -1 && sagBosluk < son && son - sagBosluk < 20) son = sagBosluk;

  const temiz = (s) => s.replace(/\s+/g, ' ');
  return {
    once: (bas > 0 ? '…' : '') + temiz(metin.slice(bas, konum)),
    eslesen: temiz(metin.slice(konum, konum + uzunluk)),
    sonra: temiz(metin.slice(konum + uzunluk, son)) + (son < metin.length ? '…' : '')
  };
}
