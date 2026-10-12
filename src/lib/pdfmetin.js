/**
 * pdfmetin.js — the words of a PDF, for searching inside documents.
 *
 * Searching a case file for "bilirkişi" by document type finds the report and
 * misses the twelve müzekkere that mention it. The words are inside the files.
 * For UDF, HTML and the office formats the extension already reads them; this
 * is the missing piece for PDF.
 *
 * Built on the parser pdf-lib already ships, not on a second library: pdf-lib
 * finds the pages, fonts and streams and inflates them; what is added here is a
 * reader for the text operators and the font encodings. It aims at search, not
 * layout — word order within a line, line breaks where the page breaks them.
 * Scanned pages hold pictures, not text, and yield nothing; that is reported by
 * the caller, not guessed at here.
 *
 * pdf-lib is passed in, as in dizin.js: the extension loads it from its own URL,
 * the tests from disk.
 */

import { sifreCozucu } from './pdfsifre.js';

/* ---------------------------------------------------------- font encodings */

// WinAnsi, the default for simple fonts. 0x80–0x9F are not Latin-1 there.
const WIN_ANSI_80 = '€\u0081‚ƒ„…†‡ˆ‰Š‹Œ\u008dŽ\u008f\u0090‘’“”•–—˜™š›œ\u009džŸ';
const winAnsi = (b) => (b >= 0x80 && b <= 0x9f ? WIN_ANSI_80[b - 0x80] : String.fromCharCode(b));

// Glyph names a Differences array uses for what WinAnsi lacks — Turkish above
// all — plus the punctuation and digits that are spelled out by name.
const GLIF = {
  space: ' ', Gbreve: 'Ğ', gbreve: 'ğ', Idotaccent: 'İ', Idot: 'İ', dotlessi: 'ı',
  Scedilla: 'Ş', scedilla: 'ş', Ccedilla: 'Ç', ccedilla: 'ç', Odieresis: 'Ö', odieresis: 'ö',
  Udieresis: 'Ü', udieresis: 'ü', Acircumflex: 'Â', acircumflex: 'â', Icircumflex: 'Î',
  icircumflex: 'î', Ucircumflex: 'Û', ucircumflex: 'û', period: '.', comma: ',', colon: ':',
  semicolon: ';', hyphen: '-', minus: '-', slash: '/', backslash: '\\', parenleft: '(',
  parenright: ')', bracketleft: '[', bracketright: ']', quotesingle: "'", quotedbl: '"',
  quoteleft: '‘', quoteright: '’', quotedblleft: '“', quotedblright: '”', exclam: '!',
  question: '?', numbersign: '#', percent: '%', ampersand: '&', at: '@', underscore: '_',
  asterisk: '*', plus: '+', equal: '=', less: '<', greater: '>', endash: '–', emdash: '—',
  bullet: '•', ellipsis: '…', degree: '°', section: '§', paragraph: '¶', zero: '0', one: '1',
  two: '2', three: '3', four: '4', five: '5', six: '6', seven: '7', eight: '8', nine: '9'
};

function glifKarakteri(ad) {
  if (GLIF[ad]) return GLIF[ad];
  if (/^[A-Za-z]$/.test(ad)) return ad;
  let m = ad.match(/^uni([0-9A-Fa-f]{4})/);
  if (m) return String.fromCharCode(parseInt(m[1], 16));
  m = ad.match(/^u([0-9A-Fa-f]{4,6})$/);
  if (m) return String.fromCodePoint(parseInt(m[1], 16));
  return '';
}

/** UTF-16BE hex, as a ToUnicode map writes its targets. */
function utf16(hex) {
  const kodlar = [];
  for (let i = 0; i + 4 <= hex.length; i += 4) kodlar.push(parseInt(hex.slice(i, i + 4), 16));
  return String.fromCharCode(...kodlar);
}

/**
 * A ToUnicode CMap: code → text, and how many bytes one code takes.
 * Only the parts that carry meaning for extraction are read.
 */
export function cmapCoz(metin) {
  const harita = new Map();
  let genislik = 1;
  const alan = metin.match(/begincodespacerange([\s\S]*?)endcodespacerange/);
  if (alan) {
    const m = alan[1].match(/<([0-9a-fA-F]+)>/);
    if (m) genislik = Math.max(1, m[1].length / 2);
  }

  for (const blok of metin.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) {
    for (const m of blok[1].matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]*)>/g)) {
      harita.set(parseInt(m[1], 16), utf16(m[2]));
    }
  }
  for (const blok of metin.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) {
    for (const m of blok[1].matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>\s*(?:<([0-9a-fA-F]+)>|\[([^\]]*)\])/g)) {
      const bas = parseInt(m[1], 16);
      const son = parseInt(m[2], 16);
      if (!(son >= bas) || son - bas > 0xffff) continue;
      if (m[3] !== undefined) {
        // The last UTF-16 unit counts up through the range; anything before it is fixed.
        const onek = m[3].length > 4 ? utf16(m[3].slice(0, -4)) : '';
        const taban = parseInt(m[3].slice(-4), 16);
        for (let k = bas; k <= son; k++) harita.set(k, onek + String.fromCharCode(taban + k - bas));
      } else {
        [...m[4].matchAll(/<([0-9a-fA-F]*)>/g)].forEach((x, i) => harita.set(bas + i, utf16(x[1])));
      }
    }
  }
  return { harita, genislik };
}

/* ------------------------------------------------------------- tokenising */

const bosluk = (c) => c === 0x20 || c === 0x0a || c === 0x0d || c === 0x09 || c === 0x0c || c === 0x00;
const AYRAC = new Set([0x28, 0x29, 0x3c, 0x3e, 0x5b, 0x5d, 0x7b, 0x7d, 0x2f, 0x25]);

/**
 * The tokens of a content stream: strings (as bytes), names, numbers, array
 * brackets and operators. Inline images are skipped whole: their data is
 * binary and would otherwise be read as a stream of nonsense operators.
 */
function tokenle(b) {
  const out = [];
  const n = b.length;
  let i = 0;

  while (i < n) {
    const c = b[i];
    if (bosluk(c)) {
      i++;
      continue;
    }
    if (c === 0x25) {
      while (i < n && b[i] !== 0x0a && b[i] !== 0x0d) i++;
      continue;
    }
    if (c === 0x28) {
      // Literal string, with nested parentheses and escapes.
      const s = [];
      let derinlik = 1;
      i++;
      while (i < n) {
        const ch = b[i++];
        if (ch === 0x5c) {
          const e = b[i++];
          if (e === 0x6e) s.push(10);
          else if (e === 0x72) s.push(13);
          else if (e === 0x74) s.push(9);
          else if (e === 0x62) s.push(8);
          else if (e === 0x66) s.push(12);
          else if (e >= 0x30 && e <= 0x37) {
            let v = e - 0x30;
            for (let k = 0; k < 2 && b[i] >= 0x30 && b[i] <= 0x37; k++) v = v * 8 + (b[i++] - 0x30);
            s.push(v & 0xff);
          } else if (e === 0x0d) {
            if (b[i] === 0x0a) i++;
          } else if (e !== 0x0a && e !== undefined) s.push(e);
          continue;
        }
        if (ch === 0x28) derinlik++;
        else if (ch === 0x29 && --derinlik === 0) break;
        s.push(ch);
      }
      out.push({ t: 's', v: Uint8Array.from(s) });
      continue;
    }
    if (c === 0x3c && b[i + 1] === 0x3c) {
      out.push({ t: '<<' });
      i += 2;
      continue;
    }
    if (c === 0x3c) {
      let h = '';
      i++;
      while (i < n && b[i] !== 0x3e) {
        const ch = String.fromCharCode(b[i++]);
        if (/[0-9a-fA-F]/.test(ch)) h += ch;
      }
      i++;
      if (h.length % 2) h += '0';
      const v = new Uint8Array(h.length / 2);
      for (let k = 0; k < v.length; k++) v[k] = parseInt(h.substr(k * 2, 2), 16);
      out.push({ t: 's', v });
      continue;
    }
    if (c === 0x3e && b[i + 1] === 0x3e) {
      out.push({ t: '>>' });
      i += 2;
      continue;
    }
    if (c === 0x5b || c === 0x5d) {
      out.push({ t: c === 0x5b ? '[' : ']' });
      i++;
      continue;
    }
    if (c === 0x2f) {
      let s = '';
      i++;
      while (i < n && !bosluk(b[i]) && !AYRAC.has(b[i])) s += String.fromCharCode(b[i++]);
      out.push({ t: 'n', v: s });
      continue;
    }

    let s = '';
    while (i < n && !bosluk(b[i]) && !AYRAC.has(b[i])) s += String.fromCharCode(b[i++]);
    if (!s) {
      i++; // a stray delimiter
      continue;
    }
    if (/^[+-]?(\d+\.?\d*|\.\d+)$/.test(s)) {
      out.push({ t: '#', v: parseFloat(s) });
    } else if (s === 'BI') {
      // Skip to the data marker "ID", then to "EI" standing alone.
      while (i < n - 1 && !(b[i] === 0x49 && b[i + 1] === 0x44 && bosluk(b[i - 1]))) i++;
      i += 2;
      while (i < n - 2 && !(bosluk(b[i]) && b[i + 1] === 0x45 && b[i + 2] === 0x49 && (i + 3 >= n || bosluk(b[i + 3])))) i++;
      i += 3;
    } else {
      out.push({ t: 'op', v: s });
    }
  }
  return out;
}

/* ------------------------------------------------------------- the reader */

/**
 * Extract the text of a PDF.
 *
 * @param {Uint8Array} bytes
 * @param {Object} pdfLib  the pdf-lib module
 * @returns {Promise<string>}  lines of text; empty when the PDF holds none
 */
export async function pdfMetni(bytes, pdfLib) {
  const { PDFDocument, PDFName, PDFDict, PDFArray, PDFNumber, PDFRawStream, PDFStream, PDFRef, decodePDFRawStream } = pdfLib;

  const belge = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
  // Encrypted without a password is common and readable; anything else throws
  // here with a reason, rather than indexing noise.
  const sifre = belge.isEncrypted ? await sifreCozucu(belge, pdfLib) : null;
  const ctx = belge.context;
  const ad = (n) => PDFName.of(n);
  const bak = (o) => (o == null ? o : ctx.lookup(o));

  /**
   * A stream's decoded bytes. Takes the reference, not the object: in an
   * encrypted file every stream's key is derived from its object number.
   */
  const akisBaytlari = async (deger) => {
    const akis = bak(deger);
    if (!(akis instanceof PDFStream)) return new Uint8Array();
    if (!(akis instanceof PDFRawStream)) return typeof akis.getContents === 'function' ? akis.getContents() : new Uint8Array();
    let ham = akis.contents;
    if (sifre && deger instanceof PDFRef) ham = await sifre(ham, deger);
    return decodePDFRawStream(sifre ? PDFRawStream.of(akis.dict, ham) : akis).decode();
  };
  const latin1 = (b) => {
    let s = '';
    for (let i = 0; i < b.length; i += 8192) s += String.fromCharCode(...b.subarray(i, i + 8192));
    return s;
  };

  /** Bytes → text for one font, decided once per font. */
  const cozuculer = new Map();
  const BILINMEYEN = { coz: () => '', olc: (b) => b.length * 500 };
  const fontCozucu = async (fontDict) => {
    if (!(fontDict instanceof PDFDict)) return BILINMEYEN;
    if (cozuculer.has(fontDict)) return cozuculer.get(fontDict);

    const altTur = bak(fontDict.get(ad('Subtype')));
    const bilesik = altTur instanceof PDFName && altTur.decodeText() === 'Type0';

    // A simple font's own encoding: WinAnsi, with the Differences array laid
    // over it. Codes the array names are known exactly; a control code it does
    // not name is unreadable, and counted as a gap between words rather than
    // let through as noise.
    const tablo = Array.from({ length: 256 }, (_, k) => (k < 0x20 ? ' ' : winAnsi(k)));
    const kodlama = bak(fontDict.get(ad('Encoding')));
    const farklar = kodlama instanceof PDFDict ? bak(kodlama.get(ad('Differences'))) : null;
    if (farklar instanceof PDFArray) {
      let kod = 0;
      for (let k = 0; k < farklar.size(); k++) {
        const o = bak(farklar.get(k));
        if (o instanceof PDFNumber) kod = o.asNumber();
        else if (o instanceof PDFName) {
          const ch = glifKarakteri(o.decodeText());
          if (ch && kod < 256) tablo[kod] = ch;
          kod++;
        }
      }
    }

    let harita = null;
    let genislik = 1;
    const tuDeger = fontDict.get(ad('ToUnicode'));
    if (bak(tuDeger) instanceof PDFStream) {
      try {
        ({ harita, genislik } = cmapCoz(latin1(await akisBaytlari(tuDeger))));
      } catch {
        harita = null;
      }
    }

    // Glyph widths, so the reader knows where shown text ends: the only way to
    // tell a gap between words from the next piece of the same word.
    const sayiAl = (o) => {
      const v = bak(o);
      return v instanceof PDFNumber ? v.asNumber() : undefined;
    };
    let olcu;
    if (bilesik) {
      const torunlar = bak(fontDict.get(ad('DescendantFonts')));
      const cid = torunlar instanceof PDFArray ? bak(torunlar.get(0)) : null;
      const dw = (cid instanceof PDFDict && sayiAl(cid.get(ad('DW')))) || 1000;
      const wHarita = new Map();
      const W = cid instanceof PDFDict ? bak(cid.get(ad('W'))) : null;
      if (W instanceof PDFArray) {
        // [c [w1 w2 …]] or [c1 c2 w]
        const o = W.asArray().map(bak);
        for (let i = 0; i < o.length; ) {
          const c = o[i] instanceof PDFNumber ? o[i].asNumber() : undefined;
          if (c === undefined) {
            i++;
          } else if (o[i + 1] instanceof PDFArray) {
            o[i + 1].asArray().forEach((w, k) => wHarita.set(c + k, sayiAl(w) ?? dw));
            i += 2;
          } else {
            const c2 = o[i + 1] instanceof PDFNumber ? o[i + 1].asNumber() : undefined;
            const w = o[i + 2] instanceof PDFNumber ? o[i + 2].asNumber() : undefined;
            if (c2 !== undefined && w !== undefined && c2 - c < 0x10000) for (let k = c; k <= c2; k++) wHarita.set(k, w);
            i += 3;
          }
        }
      }
      olcu = (kod) => wHarita.get(kod) ?? dw;
    } else {
      const ilk = sayiAl(fontDict.get(ad('FirstChar'))) ?? 0;
      const genislikler = bak(fontDict.get(ad('Widths')));
      const dizi = genislikler instanceof PDFArray ? genislikler.asArray().map(sayiAl) : [];
      const tanim = bak(fontDict.get(ad('FontDescriptor')));
      const eksik = tanim instanceof PDFDict ? sayiAl(tanim.get(ad('MissingWidth'))) : undefined;
      // The standard fonts carry no widths; half an em is a fair average.
      olcu = (kod) => dizi[kod - ilk] ?? eksik ?? 500;
    }
    const kodBoyu = harita ? genislik : bilesik ? 2 : 1;
    const olc = (b) => {
      let t = 0;
      for (let i = 0; i + kodBoyu <= b.length; i += kodBoyu) t += olcu(kodBoyu === 2 ? (b[i] << 8) | b[i + 1] : b[i]) || 0;
      return t;
    };

    let cozucu;
    if (harita) {
      // ToUnicode first, as the format intends. But producers ship incomplete
      // ones: a subset font with the space at code 1 and no entry for it, or
      // "ş" missing outright, while the Differences array names both. Where the
      // map is silent or answers with a control character, the encoding speaks.
      cozucu = (b) => {
        let s = '';
        for (let i = 0; i + genislik <= b.length; i += genislik) {
          const kod = genislik === 2 ? (b[i] << 8) | b[i + 1] : b[i];
          const v = harita.get(kod);
          if (v && !/^[\u0000-\u001f]+$/.test(v)) s += v;
          else if (genislik === 1) s += tablo[kod];
        }
        return s;
      };
    } else if (bilesik) {
      // Glyph ids with no map back to letters: nothing reliable to read.
      cozucu = () => '';
    } else {
      cozucu = (b) => {
        let s = '';
        for (const x of b) s += tablo[x];
        return s;
      };
    }
    const sonuc = { coz: cozucu, olc };
    cozuculer.set(fontDict, sonuc);
    return sonuc;
  };

  // Values are kept as stored — references included — so a stream can still be
  // decrypted with its own object number when it is read.
  const kaynakSozlugu = (kaynaklar, tur) => {
    const d = kaynaklar instanceof PDFDict ? bak(kaynaklar.get(ad(tur))) : null;
    const out = new Map();
    if (d instanceof PDFDict) for (const [anahtar, deger] of d.entries()) out.set(anahtar.decodeText(), deger);
    return out;
  };

  const satirlar = [];
  let satir = '';
  const yeniSatir = () => {
    if (satir.trim()) satirlar.push(satir.replace(/\s+/g, ' ').trim());
    satir = '';
  };

  /**
   * Run one content stream; forms (Do) are entered with their own resources.
   *
   * The text position is tracked so each piece of text can be placed against
   * where the previous one ended. A new line is a move down by half a line or
   * more. A gap along the line wider than a thin space is a word break; less
   * than that is the same word continued — producers set "şek" and "ilde"
   * apart, while this extension's own writer sets every word apart, and only
   * the widths tell the two cases from each other. Rotation and the graphics
   * matrix are not followed; search needs words, not geometry.
   */
  const oku = async (baytlar, kaynaklar, derinlik) => {
    const fontlar = kaynakSozlugu(kaynaklar, 'Font');
    const xler = kaynakSozlugu(kaynaklar, 'XObject');
    let font = BILINMEYEN;
    let boyut = 12;
    let aralik = 0;
    let tm = { a: 1, d: 1, e: 0, f: 0 };
    let sat = { e: 0, f: 0 };
    let imlec = null; // where the last shown text ended
    let islenenler = [];
    const dizi = [];

    const goster = (b) => {
      const yatay = Math.abs(boyut * tm.a) || 1;
      const dikey = Math.abs(boyut * tm.d) || 1;
      if (imlec) {
        if (Math.abs(tm.f - imlec.f) > dikey * 0.5) yeniSatir();
        else if (tm.e - imlec.e > yatay * 0.15 || imlec.e - tm.e > yatay * 2) satir += ' ';
      }
      satir += font.coz(b);
      tm.e += (font.olc(b) / 1000) * boyut * tm.a;
      imlec = { e: tm.e, f: tm.f };
    };
    const satirBasi = () => {
      sat = { e: sat.e, f: sat.f - aralik * tm.d };
      tm = { ...tm, e: sat.e, f: sat.f };
      yeniSatir();
      imlec = null;
    };

    for (const tok of tokenle(baytlar)) {
      if (tok.t === '[') {
        dizi.push([]);
        continue;
      }
      if (tok.t === ']') {
        const d = dizi.pop() || [];
        (dizi.length ? dizi[dizi.length - 1] : islenenler).push({ t: 'a', v: d });
        continue;
      }
      if (tok.t !== 'op') {
        (dizi.length ? dizi[dizi.length - 1] : islenenler).push(tok);
        continue;
      }

      const op = tok.v;
      const a = islenenler;
      islenenler = [];

      const sayi = (k) => (a[k]?.t === '#' ? a[k].v : 0);

      if (op === 'BT') {
        tm = { a: 1, d: 1, e: 0, f: 0 };
        sat = { e: 0, f: 0 };
      } else if (op === 'Tf' && a[0]?.t === 'n') {
        font = await fontCozucu(bak(fontlar.get(a[0].v)));
        boyut = sayi(1) || boyut;
      } else if (op === 'TL') aralik = sayi(0);
      else if (op === 'Tm' && a.length >= 6) {
        tm = { a: sayi(0), d: sayi(3), e: sayi(4), f: sayi(5) };
        sat = { e: tm.e, f: tm.f };
      } else if (op === 'Td' || op === 'TD') {
        if (op === 'TD') aralik = -sayi(1);
        sat = { e: sat.e + sayi(0) * tm.a, f: sat.f + sayi(1) * tm.d };
        tm = { ...tm, e: sat.e, f: sat.f };
      } else if (op === 'T*') satirBasi();
      else if (op === 'Tj' && a[0]?.t === 's') goster(a[0].v);
      else if (op === "'" && a[0]?.t === 's') {
        satirBasi();
        goster(a[0].v);
      } else if (op === '"' && a[2]?.t === 's') {
        satirBasi();
        goster(a[2].v);
      } else if (op === 'TJ' && a[0]?.t === 'a') {
        for (const o of a[0].v) {
          if (o.t === 's') goster(o.v);
          // Adjustments are in thousandths of an em, positive moves left.
          else if (o.t === '#') tm.e -= (o.v / 1000) * boyut * tm.a;
        }
      } else if (op === 'Do' && a[0]?.t === 'n' && derinlik < 6) {
        const xDeger = xler.get(a[0].v);
        const x = bak(xDeger);
        const altTur = x instanceof PDFStream ? bak(x.dict.get(ad('Subtype'))) : null;
        if (altTur instanceof PDFName && altTur.decodeText() === 'Form') {
          yeniSatir();
          const kendi = bak(x.dict.get(ad('Resources')));
          await oku(await akisBaytlari(xDeger), kendi instanceof PDFDict ? kendi : kaynaklar, derinlik + 1);
          yeniSatir();
        }
      }
    }
  };

  for (const sayfa of belge.getPages()) {
    const kaynaklar = bak(sayfa.node.getInheritableAttribute(ad('Resources')));
    const icerikDeger = sayfa.node.get(ad('Contents'));
    const icerik = bak(icerikDeger);
    const akislar = icerik instanceof PDFArray ? icerik.asArray() : [icerikDeger];
    const parcalar = [];
    for (const s of akislar) if (bak(s) instanceof PDFStream) parcalar.push(await akisBaytlari(s));

    // A page's streams form one program; an operator may be split across them.
    const toplam = new Uint8Array(parcalar.reduce((t, p) => t + p.length + 1, 0));
    let o = 0;
    for (const p of parcalar) {
      toplam.set(p, o);
      o += p.length;
      toplam[o++] = 0x0a;
    }
    await oku(toplam, kaynaklar, 0);
    yeniSatir();
  }

  return satirlar.join('\n');
}
