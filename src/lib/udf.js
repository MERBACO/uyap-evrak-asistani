/**
 * udf.js — read UYAP's UDF documents and render them as HTML.
 *
 * UDF is a ZIP holding content.xml (plus documentproperties.xml and, when the
 * document is signed, sign.sgn). Its layout model is unusual and, happily,
 * tractable: the entire document text sits in one CDATA block, and formatting is
 * expressed as ranges over that text —
 *
 *   <content><![CDATA[T.C. AYVALIK 3. ASLİYE CEZA MAHKEMESİ\tDosya No : …]]></content>
 *   <paragraph Alignment="1" size="12" family="Times New Roman">
 *     <content startOffset="0" length="5" bold="true" size="11" />
 *     <field   startOffset="5" length="7" fieldName="il_Ilce" />
 *   </paragraph>
 *
 * So rendering is: slice the text by offset, wrap each slice in the styling its
 * element declares, and lay the paragraphs out in order.
 *
 * HTML rather than PDF on purpose. Producing a PDF directly would mean writing a
 * PDF generator and embedding a Unicode font — Ğ, İ, Ş do not exist in the
 * encodings a simple generator can use. The browser already has a good HTML→PDF
 * engine behind Ctrl+P, and it handles Turkish text, pagination and margins.
 *
 * IMPORTANT: sign.sgn is not carried over. A rendered document is a readable
 * copy, never the signed original — see udfImzaliMi().
 */

/* ------------------------------------------------------------------ ZIP okuma */

const bul = (view, imza, baslangic) => {
  for (let i = baslangic; i >= 0; i--) if (view.getUint32(i, true) === imza) return i;
  return -1;
};

/**
 * Extract one file from a ZIP archive.
 * Only the two methods UDF uses are supported: stored and deflate.
 */
/**
 * Every entry in a zip container, with a reader for each.
 *
 * UDF is a zip, but so is EYP — UYAP's "elektronik yargı paketi", which wraps the
 * real documents. Both start with "PK", so treating every zip as a UDF made an
 * EYP attachment fail with "content.xml yok" and drop out of the printout, when
 * the documents it carries were right there inside it.
 *
 * @returns {Promise<Array<{ad: string, oku: () => Promise<Uint8Array|null>}>>}
 */
export async function zipIcerik(buffer) {
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);

  const eocd = bul(view, 0x06054b50, buffer.byteLength - 22);
  if (eocd < 0) return [];

  const adet = view.getUint16(eocd + 10, true);
  let offset = view.getUint32(eocd + 16, true);
  const girdiler = [];

  for (let i = 0; i < adet; i++) {
    if (view.getUint32(offset, true) !== 0x02014b50) break;
    const adUzunluk = view.getUint16(offset + 28, true);
    const ekUzunluk = view.getUint16(offset + 30, true);
    const yorumUzunluk = view.getUint16(offset + 32, true);
    const ad = new TextDecoder().decode(bytes.subarray(offset + 46, offset + 46 + adUzunluk));

    girdiler.push({ ad, oku: () => zipDosyaCikar(buffer, ad) });
    offset += 46 + adUzunluk + ekUzunluk + yorumUzunluk;
  }
  return girdiler;
}

async function zipDosyaCikar(buffer, aranan) {
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);

  const eocd = bul(view, 0x06054b50, buffer.byteLength - 22);
  if (eocd < 0) throw new Error('Zip dosyası okunamadı (zip sonu bulunamadı).');

  const adet = view.getUint16(eocd + 10, true);
  let offset = view.getUint32(eocd + 16, true);

  for (let i = 0; i < adet; i++) {
    if (view.getUint32(offset, true) !== 0x02014b50) break;

    const yontem = view.getUint16(offset + 10, true);
    const sikBoyut = view.getUint32(offset + 20, true);
    const adUzunluk = view.getUint16(offset + 28, true);
    const ekUzunluk = view.getUint16(offset + 30, true);
    const yorumUzunluk = view.getUint16(offset + 32, true);
    const yerelOffset = view.getUint32(offset + 42, true);
    const ad = new TextDecoder().decode(bytes.subarray(offset + 46, offset + 46 + adUzunluk));

    if (ad === aranan) {
      const yAdUzunluk = view.getUint16(yerelOffset + 26, true);
      const yEkUzunluk = view.getUint16(yerelOffset + 28, true);
      const veriBasi = yerelOffset + 30 + yAdUzunluk + yEkUzunluk;
      const veri = bytes.subarray(veriBasi, veriBasi + sikBoyut);

      if (yontem === 0) return veri;
      if (yontem === 8) return await inflate(veri);
      throw new Error(`UDF içinde desteklenmeyen sıkıştırma (${yontem}).`);
    }
    offset += 46 + adUzunluk + ekUzunluk + yorumUzunluk;
  }
  return null;
}

/** Raw deflate, via the browser's own decompressor — no library needed. */
async function inflate(veri) {
  const akis = new Blob([veri]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(akis).arrayBuffer());
}

/* --------------------------------------------------------------- UDF çözümleme */

export async function udfOku(buffer) {
  const xml = await zipDosyaCikar(buffer, 'content.xml');
  if (!xml) throw new Error('UDF içinde content.xml yok.');
  return {
    xml: new TextDecoder('utf-8').decode(xml),
    imzali: Boolean(await zipDosyaCikar(buffer, 'sign.sgn'))
  };
}

const HIZALAMA = { 0: 'left', 1: 'center', 2: 'right', 3: 'justify' };

/**
 * One field's value, with the markup some of them carry stripped out.
 *
 * The signature field holds an escaped HTML table — "&lt;table&gt;&lt;td&gt;Resmi
 * Mühür ve imza…" — which printed verbatim as tag soup at the foot of the page.
 * Cells become lines; that is all the table was doing.
 */
function alanDegeri(alan) {
  // A container holds several values; textContent would run them together as
  // "2026/342026/214". Join the parts instead of concatenating them.
  const cocuklar = [...alan.children];
  if (cocuklar.length) {
    return cocuklar
      .map(alanDegeri)
      .filter(Boolean)
      .join(' ');
  }

  const ham = (alan.textContent ?? '').trim();
  if (!ham.includes('<')) return ham;

  return ham
    .replace(/<\/t[dr]>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .split('\n')
    .map((satir) => satir.trim())
    .filter(Boolean)
    .join('\n');
}

/**
 * Match a field name to a value.
 *
 * Repeated fields are numbered ("dosyaNo1"), some carry a doubled final letter
 * ("kararTarihii"), and grouped ones are wrapped ("autoasucTarihiGrp"). Trying
 * only the exact name left a filled document showing its own field names.
 *
 * @param {boolean} doluBelge  whether the document carries a <data> block at all
 */
function alanBul(veri, ad, doluBelge) {
  const adaylar = [ad, ad.replace(/\d+$/, ''), ad.replace(/(.)\1$/, '$1'), `${ad}Grp`];
  for (const aday of adaylar) {
    if (veri.has(aday)) return veri.get(aday);
  }
  // In a filled document a field with no value is empty, not a placeholder. In a
  // blank form there is no <data> at all, and the names are the point.
  return doluBelge ? '' : null;
}

/**
 * The document as structured paragraphs, independent of any output format.
 *
 * Both renderers work from this: the HTML one for printing, the PDF one for
 * saving. Parsing twice would guarantee they eventually disagree about what a
 * document says.
 *
 * @returns {{paragraflar: Array, metin: string}}
 */
export function udfCozumle(xml) {
  const doc = new DOMParser().parseFromString(xml, 'text/xml');
  if (doc.querySelector('parsererror')) throw new Error('UDF içeriği çözümlenemedi.');

  // The text is read from the raw source, not the parsed tree: it lives in a
  // CDATA section and parsers differ on whether textContent exposes it — a
  // difference that would yield a perfectly formatted, completely empty
  // document. Requiring the CDATA marker means this can only match the one
  // <content> element holding the text, never the ~100 run elements.
  const cdata = xml.match(/<content[^>]*>\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*<\/content>/);
  const kok = doc.documentElement;
  const metin = cdata
    ? cdata[1]
    : ([...kok.children].find((c) => c.tagName === 'content')?.textContent ?? '');
  if (!metin) throw new Error('UDF içinde belge metni bulunamadı.');

  // Template documents — tali karar fişi, müzekkere forms — store field *names*
  // in the text and the real values in a <data> block keyed by those names. Read
  // as plain text the document prints "sanikSoyadi" where it should print
  // "YILMAZ", which is how these arrived: legible, complete, and about nobody.
  const dataDugum = doc.getElementsByTagName('data')[0];
  const veri = new Map();
  if (dataDugum) {
    // Values nest: <dosyaNokararNoGrp><dosyaNo>…</dosyaNo></…>. Index every
    // element, container and leaf alike, so both the group and its parts can be
    // found by name.
    const topla = (dugum) => {
      for (const alan of dugum.children) {
        const deger = alanDegeri(alan);
        if (deger) veri.set(alan.tagName, deger);
        topla(alan);
      }
    };
    topla(dataDugum);
  }

  const elemanlar = [...kok.children].find((c) => c.tagName === 'elements');
  const paragraflar = [];
  if (!elemanlar) return { paragraflar, metin, altbilgi: [], ustbilgi: [] };

  const parcala = (par) => {
    const boyut = parseFloat(par.getAttribute('size') || '12');
    return {
      hiza: HIZALAMA[par.getAttribute('Alignment')] || 'left',
      boyut,
      solGirinti: parseFloat(par.getAttribute('LeftIndent') || '0'),
      satirAraligi: parseFloat(par.getAttribute('LineSpacing') || '0') || 0,
      // "TabSet=69.0:2:0" or "9.0:0:0,351.0:0:0" — a comma-separated list of
      // stops, each "position:alignment:leader". The alignment digit follows
      // Java's TabStop: 0 left, 1 right, 2 centre. UYAP centres the court's name
      // block with a centre tab, so reading these as a plain repeating interval
      // pushed the heading to the left margin.
      sekmeler: (par.getAttribute('TabSet') || '')
        .split(',')
        .map((d) => d.split(':'))
        .filter((d) => d[0] && !Number.isNaN(parseFloat(d[0])))
        .map((d) => ({ konum: parseFloat(d[0]), hiza: Number(d[1]) || 0 }))
        .sort((a, b) => a.konum - b.konum),
      ustBosluk: parseFloat(par.getAttribute('SpaceAbove') || '0'),
      altBosluk: parseFloat(par.getAttribute('SpaceBelow') || '0'),
      parcalar: [...par.children]
        .map((el) => {
          const bas = parseInt(el.getAttribute('startOffset') ?? '-1', 10);
          const uzunluk = parseInt(el.getAttribute('length') ?? '0', 10);
          if (bas < 0 || uzunluk <= 0) return null;

          // A field carries its own value when the document supplies one; the
          // placeholder in the text is only a fallback for unfilled templates.
          const alanAdi = el.tagName === 'field' ? el.getAttribute('fieldName') : null;
          const deger = alanAdi ? alanBul(veri, alanAdi, Boolean(dataDugum)) : null;

          return {
            metin: deger ?? metin.slice(bas, bas + uzunluk),
            kalin: el.getAttribute('bold') === 'true',
            egik: el.getAttribute('italic') === 'true',
            altiCizili: el.getAttribute('underline') === 'true',
            boyut: parseFloat(el.getAttribute('size') || boyut),
            aile: el.getAttribute('family') || ''
          };
        })
        .filter(Boolean)
    };
  };

  for (const el of elemanlar.children) {
    if (el.tagName === 'paragraph') paragraflar.push(parcala(el));
    else if (el.tagName === 'table') {
      for (const satir of el.children) {
        if (satir.tagName !== 'row') continue;
        for (const hucre of satir.children) {
          if (hucre.tagName !== 'cell') continue;
          for (const par of hucre.children) if (par.tagName === 'paragraph') paragraflar.push(parcala(par));
        }
      }
    }
  }
  // The footer is printed on every page and takes real vertical space. Ignoring
  // it made our pages taller than the document's own, which is one reason the
  // page count drifted from what UYAP shows.
  // The footer sits inside <elements>, as a sibling of the body paragraphs —
  // not at the top level where the format's shape suggests. Look in both places
  // rather than assume: a footer that is silently missed costs a line of page
  // space on every page, and the page count drifts from the original.
  const bolum = (etiket) => {
    const d =
      [...(elemanlar?.children ?? [])].find((c) => c.tagName === etiket) ||
      [...kok.children].find((c) => c.tagName === etiket);
    return d ? [...d.children].filter((c) => c.tagName === 'paragraph').map(parcala) : [];
  };

  const pf = doc.getElementsByTagName('pageFormat')[0];
  const sayi = (ad, varsayilan) => {
    const v = parseFloat(pf?.getAttribute(ad) ?? '');
    return Number.isFinite(v) ? v : varsayilan;
  };

  return {
    paragraflar,
    metin,
    veri,
    altbilgi: bolum('footer'),
    ustbilgi: bolum('header'),
    // Page geometry from the document, not from our assumptions. footerFOffset
    // is measured from the bottom edge and falls *inside* the bottom margin, so
    // the footer costs the body no space at all — reserving space for it pushed
    // a one-page document onto two.
    sayfaBicimi: {
      solKenar: sayi('leftMargin', 70.875),
      sagKenar: sayi('rightMargin', 70.875),
      ustKenar: sayi('topMargin', 70.875),
      altKenar: sayi('bottomMargin', 70.875),
      altbilgiMesafesi: sayi('footerFOffset', 60),
      ustbilgiMesafesi: sayi('headerFOffset', 15)
    }
  };
}

