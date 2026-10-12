/**
 * dizin.js — finding a document inside the merged printout.
 *
 * A merged case file runs to hundreds of pages, and a lawyer looking for the
 * bilirkişi raporu should not have to leaf through all of them. Three aids, each
 * for a different way of reading:
 *
 *  - bookmarks, for the screen: the viewer's side panel lists every document,
 *    attachments folded under their parent, one click away;
 *  - a table of contents, for paper: sequence number, date, document, page —
 *    and on screen each row is a link to its page;
 *  - page numbers on every sheet, without which a printed contents page points
 *    at nothing.
 *
 * Everything here works on a finished pdf-lib document. The pdf-lib module is
 * passed in rather than imported, because the extension loads it from its own
 * URL at run time and the tests load it from disk.
 */

import { PdfYazici } from './pdf.js';

/* --------------------------------------------------------------- the layout */

// One set of numbers decides both how many pages the contents need and where
// each row lands. The page count has to be known before the contents are
// written — it shifts every page number printed in them — so the two must
// never be computed apart.
const DUZEN = {
  kenar: 50,
  satir: 14, // row height
  boyut: 9, // row font size
  baslik: 54, // title block, first page only
  sutunBasi: 20, // column headings, every page
  altBosluk: 64 // bottom margin plus room for the page number
};

const A4_YUKSEKLIK = 841.89;
const ust = () => A4_YUKSEKLIK - DUZEN.kenar;
const satirSiniri = (ilkSayfa) =>
  Math.floor((ust() - (ilkSayfa ? DUZEN.baslik : 0) - DUZEN.sutunBasi - DUZEN.altBosluk) / DUZEN.satir);

/** How many pages the contents take for this many rows. */
export function icindekilerSayfaSayisi(satirSayisi) {
  const ilk = satirSiniri(true);
  if (satirSayisi <= ilk) return 1;
  return 1 + Math.ceil((satirSayisi - ilk) / satirSiniri(false));
}

/* ------------------------------------------------------- table of contents */

/**
 * Write the contents pages.
 *
 * @param {Object}   fontlar
 * @param {Array<{no: string, tarih: string, ad: string, kaynak?: string,
 *                ekMi?: boolean, not?: string, sayfa: number}>} girdiler
 *        in print order; `sayfa` is the final 0-based page index in the bundle
 * @param {Object}   o
 * @param {string}   o.baslik   the case file, for the title block
 * @param {string}   o.sira     a line saying which way the bundle runs
 * @returns {Promise<{bytes: Uint8Array, baglantilar: Array<{sayfa: number,
 *          alan: number[], hedef: number}>}>}  link rectangles, per contents page
 */
export async function icindekilerYaz(fontlar, girdiler, { baslik = '', sira = '' } = {}) {
  const y = new PdfYazici(fontlar, { kenar: DUZEN.kenar });
  const sol = y.solKenar;
  const genislik = y.genislik - y.solKenar - y.sagKenar;
  const { boyut, satir } = DUZEN;

  // Columns: number, date, document, page. The page column is right-aligned so
  // the numbers line up whatever their width.
  const noX = sol + 4;
  const tarihX = sol + 34;
  const evrakX = sol + 98;
  const sayfaSag = sol + genislik - 4;
  const evrakGenislik = sayfaSag - 44 - evrakX;

  const kisalt = (metin, kalin, alan) => {
    if (y.olc(metin, kalin, boyut) <= alan) return metin;
    let s = metin;
    while (s.length > 1 && y.olc(`${s}…`, kalin, boyut) > alan) s = s.slice(0, -1);
    return `${s.trimEnd()}…`;
  };

  const baglantilar = [];
  let sayfa = 0;
  let imlec = ust();
  let kalan = satirSiniri(true);

  const sutunBasliklari = () => {
    y.dolgu(sol, imlec - DUZEN.sutunBasi + 4, genislik, DUZEN.sutunBasi - 2, 0.9);
    const by = imlec - DUZEN.sutunBasi + 10;
    y.yaziKoy('No', noX, by, { boyut, kalin: true });
    y.yaziKoy('Tarih', tarihX, by, { boyut, kalin: true });
    y.yaziKoy('Evrak', evrakX, by, { boyut, kalin: true });
    y.yaziKoy('Sayfa', sayfaSag - y.olc('Sayfa', true, boyut), by, { boyut, kalin: true });
    imlec -= DUZEN.sutunBasi;
  };

  // Title block, first page only.
  y.yaziKoy('İÇİNDEKİLER', sol, imlec - 16, { boyut: 14, kalin: true });
  if (baslik) y.yaziKoy(kisalt(baslik, false, genislik), sol, imlec - 30, { boyut: 9.5 });
  if (sira) y.yaziKoy(kisalt(sira, false, genislik), sol, imlec - 41, { boyut: 7.5 });
  imlec -= DUZEN.baslik;
  sutunBasliklari();

  for (const [i, g] of girdiler.entries()) {
    if (kalan === 0) {
      y.yeniSayfa();
      sayfa++;
      imlec = ust();
      kalan = satirSiniri(false);
      sutunBasliklari();
    }

    const taban = imlec - satir + 4;
    // A faint band on alternate rows keeps a long line with its page number.
    if (i % 2 === 1) y.dolgu(sol, imlec - satir + 1, genislik, satir, 0.96);

    y.yaziKoy(g.no, noX, taban, { boyut });
    y.yaziKoy(g.tarih, tarihX, taban, { boyut });

    // Attachments sit indented under their parent; a linked file's documents
    // say which file they came from, as they do everywhere else.
    const girinti = g.ekMi ? 12 : 0;
    const ek = [g.kaynak, g.not].filter(Boolean).join(' · ');
    const metin = ek ? `${g.ad} · ${ek}` : g.ad;
    y.yaziKoy(kisalt(metin, false, evrakGenislik - girinti), evrakX + girinti, taban, { boyut });

    const no = String(g.sayfa + 1);
    y.yaziKoy(no, sayfaSag - y.olc(no, false, boyut), taban, { boyut });

    baglantilar.push({ sayfa, alan: [sol, imlec - satir + 1, sol + genislik, imlec + 1], hedef: g.sayfa });
    imlec -= satir;
    kalan--;
  }

  return { bytes: new Uint8Array(await y.bitir().arrayBuffer()), baglantilar };
}

/* ----------------------------------------------------------------- linking */

/** A destination that opens the page at its top, keeping the reader's zoom. */
function hedefDizisi(belge, sayfaNo) {
  const sayfa = belge.getPage(sayfaNo);
  return belge.context.obj([sayfa.ref, 'XYZ', null, sayfa.getHeight(), null]);
}

/**
 * Make each contents row a link to its page.
 *
 * @param {number} ilkSayfa  where the contents pages start in the bundle
 */
export function baglantilariEkle(belge, baglantilar, ilkSayfa) {
  const ctx = belge.context;
  for (const b of baglantilar) {
    const sayfa = belge.getPage(ilkSayfa + b.sayfa);
    const ref = ctx.register(
      ctx.obj({
        Type: 'Annot',
        Subtype: 'Link',
        Rect: b.alan,
        Border: [0, 0, 0],
        Dest: hedefDizisi(belge, b.hedef)
      })
    );
    sayfa.node.addAnnot(ref);
  }
}

/**
 * Write the bookmark tree and ask the viewer to open with it showing.
 *
 * pdf-lib has no outline API, so the dictionaries are built by hand: each item
 * knows its parent and siblings, each parent its first and last child. Titles
 * are UTF-16 hex strings — plain PDF strings would turn every Ş into garbage.
 * Parents with attachments start folded, so a long file reads as a list of
 * documents rather than a wall of annexes.
 *
 * @param {Array<{baslik: string, sayfa: number, cocuklar?: Array}>} dugumler
 */
export function yerImleriEkle(belge, pdfLib, dugumler) {
  if (!dugumler.length) return;
  const { PDFName, PDFHexString, PDFNumber } = pdfLib;
  const ctx = belge.context;

  const kur = (liste, ebeveyn) => {
    const refler = liste.map(() => ctx.nextRef());
    let gorunen = 0;

    for (const [i, d] of liste.entries()) {
      const sozluk = ctx.obj({});
      sozluk.set(PDFName.of('Title'), PDFHexString.fromText(d.baslik));
      sozluk.set(PDFName.of('Parent'), ebeveyn);
      sozluk.set(PDFName.of('Dest'), hedefDizisi(belge, d.sayfa));
      if (i > 0) sozluk.set(PDFName.of('Prev'), refler[i - 1]);
      if (i < liste.length - 1) sozluk.set(PDFName.of('Next'), refler[i + 1]);

      if (d.cocuklar?.length) {
        const alt = kur(d.cocuklar, refler[i]);
        sozluk.set(PDFName.of('First'), alt.ilk);
        sozluk.set(PDFName.of('Last'), alt.son);
        // Negative: folded, with this many items behind it.
        sozluk.set(PDFName.of('Count'), PDFNumber.of(-d.cocuklar.length));
      }
      ctx.assign(refler[i], sozluk);
      gorunen++;
    }
    return { ilk: refler[0], son: refler[refler.length - 1], gorunen };
  };

  const kokRef = ctx.nextRef();
  const ustDuzey = kur(dugumler, kokRef);
  const kok = ctx.obj({});
  kok.set(PDFName.of('Type'), PDFName.of('Outlines'));
  kok.set(PDFName.of('First'), ustDuzey.ilk);
  kok.set(PDFName.of('Last'), ustDuzey.son);
  kok.set(PDFName.of('Count'), PDFNumber.of(ustDuzey.gorunen));
  ctx.assign(kokRef, kok);

  belge.catalog.set(PDFName.of('Outlines'), kokRef);
  belge.catalog.set(PDFName.of('PageMode'), PDFName.of('UseOutlines'));
}

/* ------------------------------------------------------------ page numbers */

/**
 * "37 / 412" in the bottom-right corner of every page.
 *
 * The number is the page's place in the bundle, the same number the contents
 * and the viewer show, so paper and screen agree. Digits only, which the PDF's
 * built-in Helvetica covers — no Turkish letter is needed, and so no second
 * embedded font.
 *
 * @param {number} atla  pages at the front to leave unnumbered (the cover)
 */
export async function sayfaNumaralari(belge, pdfLib, atla = 0) {
  const { StandardFonts, rgb } = pdfLib;
  const font = await belge.embedFont(StandardFonts.Helvetica);
  const toplam = belge.getPageCount();
  const boyut = 8;

  for (const [i, sayfa] of belge.getPages().entries()) {
    if (i < atla) continue;
    const metin = `${i + 1} / ${toplam}`;
    const { x, y, width } = sayfa.getMediaBox();
    sayfa.drawText(metin, {
      x: x + width - 28 - font.widthOfTextAtSize(metin, boyut),
      y: y + 14,
      size: boyut,
      font,
      color: rgb(0.4, 0.4, 0.4)
    });
  }
}
