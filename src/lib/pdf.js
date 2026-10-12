/**
 * pdf.js — write a PDF, with real Turkish text.
 *
 * The hard part is not the file format, it is the alphabet. A PDF's built-in
 * fonts use encodings that have no Ğ, İ or Ş, so any generator that leans on
 * them turns "Örnekköy 3. Asliye Ceza Mahkemesi" into mojibake. The way out is to
 * embed a font and address glyphs directly: a CIDFontType2 with Identity-H
 * encoding, where a string is a sequence of glyph ids rather than characters.
 *
 * The font is Liberation Serif, subset at build time to the characters Turkish
 * legal text uses (tools/build-fonts.py). It is metric-compatible with Times New
 * Roman, which is what UYAP's own documents ask for.
 *
 * Deliberately no compression. It makes the file bigger and the code auditable,
 * and these documents are small.
 */

const A4 = { genislik: 595.28, yukseklik: 841.89 };

/** An RGB fill operator, or nothing when the run keeps the default black. */
function renkKodu(renk) {
  return Array.isArray(renk) ? `${renk.map((v) => v.toFixed(2)).join(' ')} rg ` : '';
}


export class PdfYazici {
  /**
   * @param {Object} fontlar  { serif: {metrics, bytes}, 'serif-bold': {...} }
   * @param {Object} sayfa    { genislik, yukseklik, kenar }
   */
  constructor(fontlar, sayfa = {}) {
    this.fontlar = fontlar;
    this.genislik = sayfa.genislik ?? A4.genislik;
    this.yukseklik = sayfa.yukseklik ?? A4.yukseklik;
    const b = sayfa.bicim || {};
    this.solKenar = b.solKenar ?? sayfa.kenar ?? 70.875;
    this.sagKenar = b.sagKenar ?? sayfa.kenar ?? 70.875;
    this.ustKenar = b.ustKenar ?? sayfa.kenar ?? 70.875;
    this.altKenar = b.altKenar ?? sayfa.kenar ?? 70.875;
    this.altbilgiMesafesi = b.altbilgiMesafesi ?? 60;
    this.kenar = this.solKenar; // kept for the header line

    this.sayfalar = [];
    this.akis = null;
    this.y = 0;
    // Optional tightening, used for one purpose only: pulling a handful of
    // trailing lines back onto the previous page. Bounded, and applied to
    // spacing alone — never to the text itself.
    this.sikilik = Math.min(Math.max(sayfa.sikilik || 0, 0), 0.12);
    this.ustuKullan = Boolean(sayfa.ustuKullan);
    this.altbilgi = sayfa.altbilgi || [];
    this.altbilgiYuksekligi = 0;
    this.altbilgiCiziliyor = false;
    this.ustBilgiMetni = '';
    // A fixed band at the very top for our own document marker. Positioning it
    // relative to the page margin put it inside the body whenever a document
    // declared a narrow top margin, and it printed on top of the court's name.
    this.etiketSeridi = 26;
    this.yeniSayfa();
  }

  /** How much of the current page the body has used, in points. */
  get sonSayfaDoluluk() {
    return this.yukseklik - this.ustKenar - this.y;
  }

  get yaziGenisligi() {
    return this.genislik - this.solKenar - this.sagKenar;
  }

  yeniSayfa() {
    this.akis = [];
    this.sayfalar.push(this.akis);
    // Body starts below the marker band, whatever the document's own top margin is.
    // In compact mode the body may start just under the marker band, reclaiming
    // most of the top margin.
    const ustSinir = this.ustuKullan
      ? (this.ustBilgiMetni ? this.etiketSeridi + 10 : 12)
      : Math.max(this.ustKenar, this.ustBilgiMetni ? this.etiketSeridi + 10 : 0);
    this.y = this.yukseklik - ustSinir;
    // Repeated on every page: in a merged printout of a hundred documents, a
    // marker that appears only on first pages leaves the rest unattributable.
    if (this.ustBilgiMetni) this._ustBilgiCiz(this.ustBilgiMetni);
    if (this.altbilgi.length) this._altbilgiCiz();
  }

  /**
   * Draw the document's footer at the foot of the current page and remember how
   * much room it takes, so the body stops above it instead of running underneath.
   */
  _altbilgiCiz() {
    const yedek = this.y;

    // Drawn inside the bottom margin, where the document places it, so the body
    // area is unaffected. While it is being drawn pagination must be off: a
    // footer that overflows would open a page whose footer overflows again.
    this.altbilgiCiziliyor = true;
    this.y = this.altbilgiMesafesi;
    for (const p of this.altbilgi) this.paragraf(p);
    this.altbilgiCiziliyor = false;

    this.altbilgiYuksekligi = 0;
    this.y = yedek;
  }

  /** Single-spaced line height for a font size, from the embedded font metrics. */
  _satirYuksekligi(boyut) {
    const m = this.fontlar.serif.metrics;
    return ((m.ascent - m.descent) / 1000) * boyut * (1 - this.sikilik);
  }

  _font(kalin) {
    return this.fontlar[kalin ? 'serif-bold' : 'serif'];
  }

  /** Width of a string at a given size, in points. */
  olc(metin, kalin, boyut) {
    const f = this._font(kalin).metrics;
    let toplam = 0;
    for (const ch of metin) {
      const gid = f.cmap[String(ch.codePointAt(0))];
      toplam += gid === undefined ? 500 : f.widths[String(gid)] ?? 500;
    }
    return (toplam * boyut) / 1000;
  }

  _hex(metin, kalin) {
    const f = this._font(kalin).metrics;
    let out = '';
    for (const ch of metin) {
      const gid = f.cmap[String(ch.codePointAt(0))] ?? 0;
      out += gid.toString(16).padStart(4, '0');
    }
    return out;
  }

  /**
   * Lay out one paragraph, breaking lines and pages as needed.
   *
   * @param {Object} par  from udfCozumle(): { hiza, boyut, solGirinti, ustBosluk, altBosluk, parcalar }
   */
  paragraf(par) {
    const boyut = par.boyut || 12;
    // Line height from the font's own ascent and descent, not a guessed factor.
    // The 1.25 multiplier used before was ~11% looser than the document's own
    // spacing, which is enough to push a one-page UDF onto a second page.
    // LineSpacing is UDF's extra leading; 0 means single.
    const satirYuksekligi = this._satirYuksekligi(boyut) * (1 + (par.satirAraligi || 0));
    const sol = this.solKenar + (par.solGirinti || 0);
    const kullanilabilir = this.genislik - this.sagKenar - sol;
    const sekmeler = par.sekmeler || [];

    this.y -= (par.ustBosluk || 0) * (1 - this.sikilik);

    // Runs carry their own styling, so a line is a list of pieces, not a string.
    // Split on explicit newlines first: UDF keeps them inside the run text.
    let satir = [];
    let satirGenislik = 0;
    let yazilanSatir = 0;

    const satirBitir = (sonuncu) => {
      if (satir.length) {
        this._satirCiz(satir, sol, kullanilabilir, par.hiza, sonuncu);
        yazilanSatir++;
      } else {
        this.y -= satirYuksekligi;
        yazilanSatir++;
      }
      satir = [];
      satirGenislik = 0;
    };

    const yerVar = () => {
      if (this.altbilgiCiziliyor) return true; // footers never paginate
      if (this.y - satirYuksekligi < this.altKenar) {
        this.yeniSayfa();
        return false;
      }
      return true;
    };

    for (const parca of par.parcalar) {
      const boyutP = parca.boyut || boyut;

      for (const [i, blok] of String(parca.metin).split('\n').entries()) {
        if (i > 0) {
          yerVar();
          satirBitir(true);
        }
        if (!blok) continue;

        // Tabs are stops, not spaces. UYAP lines up "DOSYA NO<tab>: 2026/1234"
        // and centres headings by tabbing to a fixed column; measuring a tab as
        // a blank of its own width collapses all of that to the left margin.
        for (const kelime of blok.split(/(\t| +)/)) {
          if (!kelime) continue;

          if (kelime === '\t') {
            const durak = this._sonrakiDurak(satirGenislik, sekmeler);
            satir.push({ metin: '\t', sekme: true, durak, kalin: parca.kalin, boyut: boyutP, genislik: 0 });
            satirGenislik = durak.konum;
            continue;
          }

          const g = this.olc(kelime, parca.kalin, boyutP);
          if (satirGenislik + g > kullanilabilir && satirGenislik > 0) {
            yerVar();
            satirBitir(false);
          }
          satir.push({ metin: kelime, kalin: parca.kalin, boyut: boyutP, genislik: g, renk: parca.renk || par.renk });
          satirGenislik += g;
        }
      }
    }

    // UDF paragraphs usually end with their own newline. Flushing again here
    // would print a second empty line for every paragraph — which is what made
    // the converted documents look so airy compared with the original.
    if (satir.length || yazilanSatir === 0) {
      yerVar();
      satirBitir(true);
    }
    this.y -= (par.altBosluk || 0) * (1 - this.sikilik);
  }

  /**
   * The next declared tab stop past the current offset.
   * Falls back to a plain 35pt grid when the paragraph declares none.
   */
  _sonrakiDurak(x, sekmeler) {
    const sonraki = sekmeler.find((d) => d.konum > x + 0.01);
    if (sonraki) return sonraki;
    return { konum: Math.ceil((x + 0.01) / 35) * 35, hiza: 0 };
  }

  _satirCiz(parcalar, sol, kullanilabilir, hiza, sonSatir) {
    const boyut = Math.max(...parcalar.map((p) => p.boyut));
    const toplam = parcalar.reduce((t, p) => t + p.genislik, 0);

    let x = sol;
    if (hiza === 'center') x = sol + (kullanilabilir - toplam) / 2;
    else if (hiza === 'right') x = sol + (kullanilabilir - toplam);

    // A tab stop can be a centre or right stop: the text between it and the next
    // tab is laid out around the stop, not merely started at it. This is how the
    // court's name block is centred in the original document.
    const parcaGenisligi = (bas) => {
      let t = 0;
      for (let i = bas; i < parcalar.length && !parcalar[i].sekme; i++) t += parcalar[i].genislik;
      return t;
    };

    // Justification stretches the gaps, never the last line of a paragraph — and
    // never a line containing a tab. A tab jumps to a fixed column, so the space
    // it consumes is not in the run widths; justifying anyway distributes room
    // that does not exist and pushes the line past the right margin.
    const sekmeliSatir = parcalar.some((p) => p.sekme);
    let ekBosluk = 0;
    if (hiza === 'justify' && !sonSatir && !sekmeliSatir) {
      const bosluklar = parcalar.filter((p) => !p.sekme && /^ +$/.test(p.metin)).length;
      if (bosluklar > 0) ekBosluk = (kullanilabilir - toplam) / bosluklar;
    }

    this.y -= this._satirYuksekligi(boyut);

    for (const [pi, p] of parcalar.entries()) {
      if (p.metin.trim()) {
        this.akis.push(
          `BT /F${p.kalin ? 'B' : 'R'} ${p.boyut} Tf ${renkKodu(p.renk)}1 0 0 1 ${x.toFixed(2)} ${this.y.toFixed(2)} Tm ` +
            `<${this._hex(p.metin, p.kalin)}> Tj ET${p.renk ? ' 0 0 0 rg' : ''}`
        );
      }
      if (p.sekme) {
        const genislik = parcaGenisligi(pi + 1);
        let hedef;
        if (p.durak.hiza === 2) hedef = sol + p.durak.konum - genislik / 2;
        else if (p.durak.hiza === 1) hedef = sol + p.durak.konum - genislik;
        else hedef = sol + p.durak.konum;

        // Centring on an early stop can push a long line into the left margin —
        // the court's name is wider than twice the 69pt stop it centres on.
        // Clamp instead: never start text outside the printable area.
        x = Math.max(sol, hedef);
      } else {
        x += p.genislik + (/^ +$/.test(p.metin) ? ekBosluk : 0);
      }
    }
  }

  /* ------------------------------------------------------ drawing primitives */

  /**
   * A rectangle, for ruling tables. The cover page needs boxes a lawyer can
   * write in by hand, and laying those out with text alone does not work.
   */
  dikdortgen(x, y, genislik, yukseklik, { kalinlik = 0.7, gri = 0.35 } = {}) {
    this.akis.push(
      `${gri} ${gri} ${gri} RG ${kalinlik} w ${x.toFixed(2)} ${y.toFixed(2)} ` +
        `${genislik.toFixed(2)} ${yukseklik.toFixed(2)} re S 0 0 0 RG`
    );
  }

  /** A filled band, for section headers. */
  dolgu(x, y, genislik, yukseklik, ton = 0.92) {
    this.akis.push(
      `${ton} ${ton} ${ton} rg ${x.toFixed(2)} ${y.toFixed(2)} ${genislik.toFixed(2)} ${yukseklik.toFixed(2)} re f 0 0 0 rg`
    );
  }

  /** Text at an exact position, outside the paragraph flow. */
  yaziKoy(metin, x, y, { boyut = 11, kalin = false } = {}) {
    this.akis.push(
      `BT /F${kalin ? 'B' : 'R'} ${boyut} Tf 1 0 0 1 ${x.toFixed(2)} ${y.toFixed(2)} Tm ` +
        `<${this._hex(metin, kalin)}> Tj ET`
    );
  }

  /** Small grey line above the document body — which document this page belongs to. */
  ustBilgi(metin) {
    this.ustBilgiMetni = metin;
    // The first page was already opened without knowing there would be a marker;
    // give the body the same clearance the later pages get.
    const gerekli = this.yukseklik - Math.max(this.ustKenar, this.etiketSeridi + 10);
    if (this.y > gerekli) this.y = gerekli;
    this._ustBilgiCiz(metin);
  }

  _ustBilgiCiz(metin) {
    const boyut = 8;
    this.akis.push(
      `BT /FR ${boyut} Tf 0.45 0.45 0.45 rg 1 0 0 1 ${this.solKenar.toFixed(2)} ${(
        this.yukseklik - this.etiketSeridi
      ).toFixed(2)} Tm <${this._hex(metin, false)}> Tj ET 0 0 0 rg`
    );
  }

  /** @returns {Blob} */
  bitir() {
    const nesneler = [];
    const ekle = (icerik) => {
      nesneler.push(icerik);
      return nesneler.length; // object numbers are 1-based
    };

    // Fonts first: every page refers to them.
    const fontNesneleri = {};
    for (const [ad, font] of Object.entries(this.fontlar)) {
      const m = font.metrics;
      const dosyaNo = ekle({ akis: font.bytes, sozluk: `/Length1 ${font.bytes.length}` });
      const tanimNo = ekle(
        `<< /Type /FontDescriptor /FontName /${m.psAd} /Flags 34 ` +
          `/FontBBox [${m.bbox.join(' ')}] /ItalicAngle ${m.italicAngle} /Ascent ${m.ascent} ` +
          `/Descent ${m.descent} /CapHeight ${m.capHeight} /StemV 80 /FontFile2 ${dosyaNo} 0 R >>`
      );

      const gidler = [...new Set(Object.values(m.cmap))].sort((a, b) => a - b);
      const w = gidler.map((g) => `${g} [${m.widths[String(g)] ?? 500}]`).join(' ');

      const altNo = ekle(
        `<< /Type /Font /Subtype /CIDFontType2 /BaseFont /${m.psAd} ` +
          `/CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> ` +
          `/FontDescriptor ${tanimNo} 0 R /DW 500 /W [${w}] /CIDToGIDMap /Identity >>`
      );
      // Without a ToUnicode map the text draws correctly and extracts as
      // gibberish: Identity-H addresses glyphs, and nothing in the file says
      // which letter a glyph stands for. For a court document that would mean a
      // PDF you cannot search, select or copy from — so map every glyph back.
      const unicodeNo = ekle({
        akis: new TextEncoder().encode(toUnicodeCMap(m.cmap)),
        sozluk: ''
      });

      fontNesneleri[ad] = ekle(
        `<< /Type /Font /Subtype /Type0 /BaseFont /${m.psAd} /Encoding /Identity-H ` +
          `/DescendantFonts [${altNo} 0 R] /ToUnicode ${unicodeNo} 0 R >>`
      );
    }

    const sayfaNolar = [];
    const icerikNolar = [];
    for (const akis of this.sayfalar) {
      icerikNolar.push(ekle({ akis: new TextEncoder().encode(akis.join('\n')), sozluk: '' }));
    }

    const agacNo = nesneler.length + this.sayfalar.length + 1;
    for (const [i] of this.sayfalar.entries()) {
      sayfaNolar.push(
        ekle(
          `<< /Type /Page /Parent ${agacNo} 0 R /MediaBox [0 0 ${this.genislik.toFixed(2)} ${this.yukseklik.toFixed(
            2
          )}] /Resources << /Font << /FR ${fontNesneleri['serif']} 0 R /FB ${
            fontNesneleri['serif-bold']
          } 0 R >> >> /Contents ${icerikNolar[i]} 0 R >>`
        )
      );
    }

    const agac = ekle(
      `<< /Type /Pages /Kids [${sayfaNolar.map((n) => `${n} 0 R`).join(' ')}] /Count ${sayfaNolar.length} >>`
    );
    const katalog = ekle(`<< /Type /Catalog /Pages ${agac} 0 R >>`);

    return this._serilestir(nesneler, katalog);
  }

  _serilestir(nesneler, katalogNo) {
    const parcalar = [];
    const enc = new TextEncoder();
    let uzunluk = 0;
    const yaz = (x) => {
      const b = typeof x === 'string' ? enc.encode(x) : x;
      parcalar.push(b);
      uzunluk += b.length;
      return b.length;
    };

    yaz('%PDF-1.7\n');
    // The binary marker must be raw bytes; encoding it as text turned each into
    // a two-byte UTF-8 sequence, which is not what the comment is for.
    yaz(new Uint8Array([0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a]));

    const konumlar = [0];
    for (const [i, nesne] of nesneler.entries()) {
      konumlar.push(uzunluk);
      yaz(`${i + 1} 0 obj\n`);
      if (typeof nesne === 'string') {
        yaz(nesne + '\n');
      } else {
        yaz(`<< /Length ${nesne.akis.length} ${nesne.sozluk} >>\nstream\n`);
        yaz(nesne.akis);
        yaz('\nendstream\n');
      }
      yaz('endobj\n');
    }

    const xref = uzunluk;
    yaz(`xref\n0 ${nesneler.length + 1}\n0000000000 65535 f \n`);
    for (let i = 1; i <= nesneler.length; i++) {
      yaz(`${String(konumlar[i]).padStart(10, '0')} 00000 n \n`);
    }
    yaz(`trailer\n<< /Size ${nesneler.length + 1} /Root ${katalogNo} 0 R >>\nstartxref\n${xref}\n%%EOF\n`);

    return new Blob(parcalar, { type: 'application/pdf' });
  }
}

/** Glyph id → character, so the text can be searched and copied. */
function toUnicodeCMap(cmap) {
  const ciftler = Object.entries(cmap)
    .map(([kod, gid]) => [gid, Number(kod)])
    .sort((a, b) => a[0] - b[0]);

  let govde = '';
  for (let i = 0; i < ciftler.length; i += 100) {
    const blok = ciftler.slice(i, i + 100);
    govde += `${blok.length} beginbfchar\n`;
    for (const [gid, kod] of blok) {
      const u =
        kod > 0xffff
          ? // outside the BMP: a surrogate pair, as the CMap format requires
            (() => {
              const v = kod - 0x10000;
              return (
                (0xd800 + (v >> 10)).toString(16).padStart(4, '0') +
                (0xdc00 + (v & 0x3ff)).toString(16).padStart(4, '0')
              );
            })()
          : kod.toString(16).padStart(4, '0');
      govde += `<${gid.toString(16).padStart(4, '0')}> <${u}>\n`;
    }
    govde += 'endbfchar\n';
  }

  return (
    '/CIDInit /ProcSet findresource begin\n12 dict begin\nbegincmap\n' +
    '/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def\n' +
    '/CMapName /Adobe-Identity-UCS def\n/CMapType 2 def\n' +
    '1 begincodespacerange\n<0000> <FFFF>\nendcodespacerange\n' +
    govde +
    'endcmap\nCMapName currentdict /CMap defineresource pop\nend\nend'
  );
}

/** Load the bundled fonts once per page. */
let fontOnbellek = null;

export async function fontlariYukle(urlCoz) {
  if (fontOnbellek) return fontOnbellek;

  const metrics = await (await fetch(urlCoz('fonts/metrics.json'))).json();
  const out = {};
  for (const [ad, m] of Object.entries(metrics)) {
    const bytes = new Uint8Array(await (await fetch(urlCoz(`fonts/${m.dosya}`))).arrayBuffer());
    out[ad] = { metrics: { ...m, psAd: ad === 'serif-bold' ? 'LiberationSerif-Bold' : 'LiberationSerif' }, bytes };
  }
  fontOnbellek = out;
  return out;
}
