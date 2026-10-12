/**
 * gorsel.js — scanned pages into the printout, fast.
 *
 * The obvious route was canvas → PNG → pdf-lib's embedPng. Measured on an A4
 * scan at 300 dpi it took 0.9 s a page, and 0.7 s of that was pdf-lib decoding
 * the PNG we had just encoded, in JavaScript, to get back the pixels we already
 * had. A case file with a few hundred scanned pages spent minutes there.
 *
 * Here the pixels go straight into an image XObject, compressed by the
 * browser's own deflate (CompressionStream): 0.2 s a page, lossless, and about a
 * third of the size. Scans are almost always grey, so a page whose pixels are
 * all grey is stored with one channel instead of three.
 */

const A4 = [595.28, 841.89];

/**
 * @param {Uint8Array|Uint8ClampedArray} rgba
 * @returns {Promise<{genislik, yukseklik, renk: 'DeviceGray'|'DeviceRGB', veri: Uint8Array}>}
 */
export async function pikselSikistir(rgba, genislik, yukseklik) {
  let gri = true;
  for (let i = 0; i < rgba.length; i += 4) {
    if (rgba[i] !== rgba[i + 1] || rgba[i] !== rgba[i + 2]) {
      gri = false;
      break;
    }
  }
  const kanal = gri ? 1 : 3;
  const ham = new Uint8Array(genislik * yukseklik * kanal);
  // Transparency has no meaning on paper: composite onto white.
  const kanalDegeri = (v, a) => (a === 255 ? v : Math.round((v * a) / 255 + 255 - a));
  for (let i = 0, j = 0; i < rgba.length; i += 4) {
    const a = rgba[i + 3];
    ham[j++] = kanalDegeri(rgba[i], a);
    if (!gri) {
      ham[j++] = kanalDegeri(rgba[i + 1], a);
      ham[j++] = kanalDegeri(rgba[i + 2], a);
    }
  }
  const akis = new Blob([ham]).stream().pipeThrough(new CompressionStream('deflate'));
  const veri = new Uint8Array(await new Response(akis).arrayBuffer());
  return { genislik, yukseklik, renk: gri ? 'DeviceGray' : 'DeviceRGB', veri };
}

/**
 * Put one compressed image on a new A4 page, placed exactly as the old
 * drawImage route placed it: top-left, 30 pt in, scaled down to fit, never up.
 * @returns {PDFPage}
 */
export function gorselSayfasiEkle(belge, pdfLib, kare) {
  const { PDFName, pushGraphicsState, popGraphicsState, concatTransformationMatrix, drawObject } = pdfLib;
  const akis = belge.context.stream(kare.veri, {
    Type: 'XObject',
    Subtype: 'Image',
    Width: kare.genislik,
    Height: kare.yukseklik,
    ColorSpace: kare.renk,
    BitsPerComponent: 8,
    Filter: 'FlateDecode'
  });
  const ref = belge.context.register(akis);
  const olcek = Math.min(535 / kare.genislik, 760 / kare.yukseklik, 1);
  const en = kare.genislik * olcek;
  const boy = kare.yukseklik * olcek;
  const sayfa = belge.addPage(A4);
  const ad = sayfa.node.newXObject('Tarama', ref);
  sayfa.pushOperators(
    pushGraphicsState(),
    concatTransformationMatrix(en, 0, 0, boy, 30, A4[1] - 40 - boy),
    drawObject(ad instanceof PDFName ? ad : PDFName.of(String(ad))),
    popGraphicsState()
  );
  return sayfa;
}

/**
 * Compress what was left uncompressed, in the merged document only.
 *
 * Our own writer keeps its streams plain on purpose (src/lib/pdf.js: smaller
 * code, auditable output), and per document that costs little. Merged, a few
 * hundred documents of plain page text made a 20 MB file that the viewer and the
 * printer spool had to read through. The browser's own deflate shrinks it to a
 * fraction in a fraction of a second. Streams that already carry a filter —
 * scans, copied PDFs — are left exactly as they are.
 *
 * @returns {Promise<number>} bytes saved
 */
export async function akislariSikistir(belge, pdfLib, { enAz = 512 } = {}) {
  const { PDFName, PDFRawStream } = pdfLib;
  const filtre = PDFName.of('Filter');
  let kazanc = 0;
  for (const [ref, nesne] of belge.context.enumerateIndirectObjects()) {
    if (!(nesne instanceof PDFRawStream) || nesne.dict.has(filtre) || nesne.contents.length < enAz) continue;
    const akis = new Blob([nesne.contents]).stream().pipeThrough(new CompressionStream('deflate'));
    const sikis = new Uint8Array(await new Response(akis).arrayBuffer());
    if (sikis.length >= nesne.contents.length) continue;
    const sozluk = nesne.dict.clone(belge.context);
    sozluk.set(filtre, PDFName.of('FlateDecode'));
    belge.context.assign(ref, PDFRawStream.of(sozluk, sikis));
    kazanc += nesne.contents.length - sikis.length;
  }
  return kazanc;
}

/**
 * One copy of each font in the merged document.
 *
 * Every document this extension lays out (UDF, HTML, Word, the marker pages)
 * is its own small PDF carrying its own copy of the two Turkish fonts, about
 * 200 KB. Merged, a case file of 150 documents carried 150 copies — a 52 MB file
 * that the browser's viewer and the printer then had to chew through. The
 * copies are byte for byte identical, so every reference is pointed at the first
 * and the rest are dropped. Fonts that merely share a name are left alone.
 *
 * @returns {number} bytes saved
 */
export function fontlariTekle(belge, pdfLib) {
  const { PDFName, PDFDict, PDFRef, PDFRawStream } = pdfLib;
  const baglar = [
    ['FontDescriptor', ['FontFile2', 'FontFile', 'FontFile3']],
    ['Font', ['ToUnicode']]
  ];
  const ilkler = new Map(); // signature → [{ref, icerik}]
  const yonlendir = new Map(); // dropped ref → kept ref
  let kazanc = 0;

  const imza = (akis) => {
    const c = akis.contents;
    // Length plus a sparse sample is enough to bucket; equality is checked in full.
    let h = c.length;
    for (let i = 0; i < c.length; i += Math.max(1, c.length >> 6)) h = (h * 31 + c[i]) >>> 0;
    return `${c.length}:${h}:${akis.dict.toString()}`;
  };
  const esit = (a, b) => {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
  };

  for (const [, nesne] of belge.context.enumerateIndirectObjects()) {
    if (!(nesne instanceof PDFDict)) continue;
    const tur = nesne.get(PDFName.of('Type'));
    for (const [tip, anahtarlar] of baglar) {
      if (tur !== PDFName.of(tip)) continue;
      for (const anahtar of anahtarlar) {
        const ad = PDFName.of(anahtar);
        const ref = nesne.get(ad);
        if (!(ref instanceof PDFRef)) continue;
        if (yonlendir.has(ref)) {
          nesne.set(ad, yonlendir.get(ref));
          continue;
        }
        const akis = belge.context.lookup(ref);
        if (!(akis instanceof PDFRawStream)) continue;
        const k = imza(akis);
        const adaylar = ilkler.get(k) || [];
        const ayni = adaylar.find((x) => x.ref !== ref && esit(x.icerik, akis.contents));
        if (!ayni) {
          if (!adaylar.some((x) => x.ref === ref)) adaylar.push({ ref, icerik: akis.contents });
          ilkler.set(k, adaylar);
          continue;
        }
        nesne.set(ad, ayni.ref);
        yonlendir.set(ref, ayni.ref);
        belge.context.delete(ref);
        kazanc += akis.contents.length;
      }
    }
  }
  return kazanc;
}
