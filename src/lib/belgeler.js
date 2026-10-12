/**
 * belgeler.js — the remaining formats UYAP hands out.
 *
 * A case file is not only UDF and PDF. KEP correspondence arrives as .eml, some
 * offices attach .docx, and plain text turns up as .txt or .csv. Each of them
 * used to reach the printout as a marker page saying the format could not be
 * printed, while the content was a few lines of text away.
 */

const kacisCoz = (s) =>
  String(s)
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');

const par = (metin, o = {}) => ({
  hiza: 'left',
  boyut: o.boyut || 11,
  ustBosluk: o.ust || 0,
  altBosluk: o.alt || 2,
  sekmeler: [],
  parcalar: [{ metin, kalin: Boolean(o.kalin), boyut: o.boyut || 11 }]
});

/* ------------------------------------------------------------------- docx */

/** An OOXML text document: a zip carrying word/document.xml. */
export function docxMi(girdiler) {
  return girdiler.some((g) => g.ad === 'word/document.xml');
}

export async function docxParagraflar(girdiler) {
  const girdi = girdiler.find((g) => g.ad === 'word/document.xml');
  if (!girdi) return [];
  const veri = await girdi.oku();
  if (!veri) return [];

  const xml = new TextDecoder('utf-8', { fatal: false }).decode(veri);
  const out = [];

  for (const p of xml.matchAll(/<w:p\b[^>]*>([\s\S]*?)<\/w:p>/g)) {
    const govde = p[1];
    // Bold is a property of the run, and a paragraph can mix them; a heading is
    // simply a paragraph whose runs are all bold.
    const parcalar = [];
    for (const r of govde.matchAll(/<w:r\b[^>]*>([\s\S]*?)<\/w:r>/g)) {
      const kalin = /<w:b\b[^>]*\/>|<w:b\b[^>]*>(?!<w:val="0")/.test(r[1]);
      const metin = [...r[1].matchAll(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g)].map((m) => kacisCoz(m[1])).join('');
      if (metin) parcalar.push({ metin, kalin, boyut: 11 });
    }

    if (parcalar.length) {
      out.push({ hiza: 'left', boyut: 11, ustBosluk: 0, altBosluk: 2, sekmeler: [], parcalar });
    } else if (out.length) {
      out.push(par('', { alt: 4 })); // an empty paragraph is a deliberate break
    }
  }
  return out;
}

/* -------------------------------------------------------------------- eml */

/** RFC 822 message: headers, a blank line, then the body. */
export function emlMi(bytes) {
  const bas = new TextDecoder('utf-8', { fatal: false }).decode(bytes.subarray(0, 2000));
  return /^(from|to|subject|date|message-id|mime-version|received|return-path)\s*:/im.test(bas);
}

function basligiCoz(ham) {
  // "=?UTF-8?B?...?=" — encoded words, used for any header that is not ASCII.
  return ham.replace(/=\?([^?]+)\?([bq])\?([^?]*)\?=/gi, (tam, kod, yontem, govde) => {
    try {
      if (yontem.toLowerCase() === 'b') {
        const ikili = Uint8Array.from(atob(govde), (c) => c.charCodeAt(0));
        return new TextDecoder(kod).decode(ikili);
      }
      const metin = govde.replace(/_/g, ' ').replace(/=([0-9A-F]{2})/gi, (_, h) => String.fromCharCode(parseInt(h, 16)));
      return metin;
    } catch {
      return tam;
    }
  });
}

export function emlParagraflar(bytes) {
  const ham = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
  const bolme = ham.search(/\r?\n\r?\n/);
  const basliklarHam = bolme > 0 ? ham.slice(0, bolme) : ham;
  const govde = bolme > 0 ? ham.slice(bolme).trim() : '';

  // Folded headers continue on lines that start with whitespace.
  const satirlar = basliklarHam.replace(/\r?\n[ \t]+/g, ' ').split(/\r?\n/);
  const out = [];
  const gosterilecek = ['from', 'to', 'cc', 'subject', 'date'];
  const turkce = { from: 'Gönderen', to: 'Alıcı', cc: 'Bilgi', subject: 'Konu', date: 'Tarih' };

  for (const satir of satirlar) {
    const m = satir.match(/^([\w-]+)\s*:\s*(.*)$/);
    if (!m) continue;
    const ad = m[1].toLowerCase();
    if (!gosterilecek.includes(ad)) continue;
    out.push(par(`${turkce[ad]}: ${basligiCoz(m[2]).trim()}`, { kalin: ad === 'subject' }));
  }

  if (out.length) out[out.length - 1].altBosluk = 10;

  // Only the readable part of the body. A multipart message carries the same
  // text twice, once as HTML, and its attachments are separate documents in the
  // case file — reproducing them here would duplicate what is already listed.
  const duz = govdeMetni(govde, basliklarHam);
  for (const paragraf of duz.split(/\n{2,}/)) {
    const metin = paragraf.replace(/\s*\n\s*/g, ' ').trim();
    if (metin) out.push(par(metin));
  }
  return out;
}

function govdeMetni(govde, basliklar = '') {
  let metin = govde;

  // The boundary is declared in the headers, not in the body. Looking for it in
  // the body alone meant multipart messages were never split, and their MIME
  // scaffolding — boundaries, part headers, base64 attachments — was printed as
  // if it were the letter.
  const sinir = `${basliklar}\n${govde}`.match(/boundary="?([^"\s;]+)"?/i);
  if (sinir) {
    const parcalar = govde.split(new RegExp(`--${sinir[1].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
    const duzParca = parcalar.find((p) => /content-type:\s*text\/plain/i.test(p));
    const htmlParca = parcalar.find((p) => /content-type:\s*text\/html/i.test(p));
    const secilen = duzParca || htmlParca || '';
    const bas = secilen.search(/\r?\n\r?\n/);
    metin = bas > 0 ? secilen.slice(bas) : secilen;
    if (!duzParca && htmlParca) metin = metin.replace(/<[^>]*>/g, ' ');
  }

  return quotedPrintableCoz(metin).replace(/\r/g, '').trim();
}

/**
 * Quoted-printable, decoded through the bytes.
 *
 * "=C4=B1" is one Turkish letter written as two bytes. Turning each escape into
 * a character on its own produced "SayÄ±n" instead of "Sayın", because the pair
 * was never handed to a UTF-8 decoder.
 */
function quotedPrintableCoz(metin) {
  const yumusak = metin.replace(/=\r?\n/g, '');
  const baytlar = [];

  for (let i = 0; i < yumusak.length; i++) {
    const m = yumusak.slice(i, i + 3).match(/^=([0-9A-F]{2})$/i);
    if (m) {
      baytlar.push(parseInt(m[1], 16));
      i += 2;
      continue;
    }
    // Everything else is already text; encode it so the whole run decodes once.
    for (const b of new TextEncoder().encode(yumusak[i])) baytlar.push(b);
  }
  return new TextDecoder('utf-8', { fatal: false }).decode(new Uint8Array(baytlar));
}

/* ------------------------------------------------------------- plain text */

export function duzMetinParagraflar(bytes) {
  const metin = new TextDecoder('utf-8', { fatal: false }).decode(bytes).replace(/\r/g, '');
  return metin
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => par(p));
}
