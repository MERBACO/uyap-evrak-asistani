/**
 * xlsx.js — read a spreadsheet well enough to print it.
 *
 * Bank statements arrive as .xlsx: "İŞLEM TABLOSU.xlsx", account movements filed
 * as an attachment. Being a zip, the file used to be taken for a document
 * package, searched for PDFs, and reported as containing nothing printable —
 * while the table the lawyer actually needed sat inside it.
 *
 * Values only. Formulas are read as their last computed result, formatting and
 * charts are ignored: a printed statement needs the numbers and the dates, and
 * carrying a rendering engine to reproduce cell borders would be absurd here.
 */

/** Excel keeps text either in a shared table or inline in the cell. */
function metinCoz(xml) {
  const out = [];
  for (const m of xml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)) {
    // A single string can be split across runs; concatenate them in order.
    const parcalar = [...m[1].matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((x) => x[1]);
    out.push(parcalar.map(kacisCoz).join(''));
  }
  return out;
}

function kacisCoz(s) {
  return String(s)
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

/** "BC12" → 54: the column index hidden in a cell reference. */
function sutunIndeksi(ref) {
  const harfler = String(ref || '').match(/^[A-Z]+/);
  if (!harfler) return 0;
  return [...harfler[0]].reduce((t, h) => t * 26 + (h.charCodeAt(0) - 64), 0) - 1;
}

function sayfaSatirlari(xml, paylasilan) {
  const satirlar = [];

  for (const satir of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const hucreler = [];
    for (const h of satir[1].matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/g)) {
      const nitelikler = h[1];
      const govde = h[2];
      const ref = (nitelikler.match(/r="([A-Z]+\d+)"/) || [])[1];
      const tur = (nitelikler.match(/t="(\w+)"/) || [])[1];

      let deger = '';
      if (tur === 's') {
        const i = Number((govde.match(/<v>(\d+)<\/v>/) || [])[1]);
        deger = paylasilan[i] ?? '';
      } else if (tur === 'inlineStr') {
        deger = [...govde.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((x) => kacisCoz(x[1])).join('');
      } else {
        deger = kacisCoz((govde.match(/<v>([\s\S]*?)<\/v>/) || [])[1] ?? '');
      }

      if (deger !== '') hucreler[sutunIndeksi(ref)] = deger;
    }

    // Trailing empty cells carry no information; a wholly empty row does.
    if (hucreler.length) satirlar.push([...hucreler].map((x) => x ?? ''));
  }
  return satirlar;
}

/**
 * The sheets as data: names and rows of strings.
 *
 * @param {Array<{ad: string, oku: () => Promise<Uint8Array|null>}>} girdiler  zip entries
 */
export async function xlsxSayfalar(girdiler) {
  const coz = new TextDecoder('utf-8', { fatal: false });
  const oku = async (ad) => {
    const girdi = girdiler.find((g) => g.ad === ad);
    if (!girdi) return '';
    const veri = await girdi.oku();
    return veri ? coz.decode(veri) : '';
  };

  const paylasilan = metinCoz(await oku('xl/sharedStrings.xml'));

  // Sheet names live in the workbook; the files themselves are numbered.
  const kitap = await oku('xl/workbook.xml');
  const adlar = [...kitap.matchAll(/<sheet\b[^>]*name="([^"]*)"/g)].map((m) => kacisCoz(m[1]));

  const dosyalar = girdiler
    .filter((g) => /^xl\/worksheets\/sheet\d+\.xml$/.test(g.ad))
    .sort((a, b) => Number(a.ad.match(/(\d+)/)[1]) - Number(b.ad.match(/(\d+)/)[1]));

  const out = [];
  for (const [i, dosya] of dosyalar.entries()) {
    const satirlar = sayfaSatirlari(await oku(dosya.ad), paylasilan);
    if (satirlar.length) out.push({ ad: adlar[i] || `Sayfa ${i + 1}`, satirlar });
  }
  return out;
}

const par = (metin, o = {}) => ({
  hiza: 'left',
  boyut: o.boyut || 8.5,
  ustBosluk: o.ust || 0,
  altBosluk: o.alt || 0,
  sekmeler: o.sekmeler || [],
  parcalar: [{ metin, kalin: Boolean(o.kalin), boyut: o.boyut || 8.5 }]
});

/**
 * Lay the sheets out for a page of a given width.
 *
 * A bank statement has twenty columns and does not fit A4. Forcing it into
 * columns anyway put the tab stops past the right margin and the rows collapsed
 * into each other — which is what "biraz karışık" looked like. So the layout
 * reports what it needs, the caller can offer a wider page, and if even that is
 * not enough each row is written out as labelled lines instead: unmistakably
 * readable, at the cost of being taller.
 *
 * @param {number} genislik  usable page width in points
 * @param {(metin: string, boyut: number) => number} olc
 * @returns {{paragraflar: Array, gerekenGenislik: number, kayitDuzeni: boolean}}
 */
export function xlsxDuzen(sayfalar, olc, genislik, { zorlaKayit = false, satirSiniri = 4000 } = {}) {
  const boyut = 8.5;
  const paragraflar = [];
  let gerekenGenislik = 0;

  for (const sayfa of sayfalar) {
    const sutunSayisi = Math.max(...sayfa.satirlar.map((s) => s.length));
    const genislikler = [];
    for (let s = 0; s < sutunSayisi; s++) {
      genislikler[s] = Math.min(200, Math.max(...sayfa.satirlar.map((r) => olc(String(r[s] ?? ''), boyut)), 12));
    }
    const toplam = genislikler.reduce((t, g) => t + g + 10, 0);
    gerekenGenislik = Math.max(gerekenGenislik, toplam);
  }

  const kayitDuzeni = zorlaKayit || gerekenGenislik > genislik;

  for (const [i, sayfa] of sayfalar.entries()) {
    if (sayfalar.length > 1 || sayfa.ad) {
      paragraflar.push(par(sayfa.ad, { boyut: 11, kalin: true, ust: i ? 14 : 0, alt: 4 }));
    }

    if (!kayitDuzeni) {
      const sutunSayisi = Math.max(...sayfa.satirlar.map((s) => s.length));
      const genislikler = [];
      for (let s = 0; s < sutunSayisi; s++) {
        genislikler[s] = Math.min(200, Math.max(...sayfa.satirlar.map((r) => olc(String(r[s] ?? ''), boyut)), 12));
      }
      const duraklar = [];
      let x = 0;
      for (let s = 0; s < sutunSayisi - 1; s++) {
        x += genislikler[s] + 10;
        duraklar.push({ konum: Math.round(x), hiza: 0 });
      }
      for (const [j, satir] of sayfa.satirlar.entries()) {
        const metin = Array.from({ length: sutunSayisi }, (_, s) => String(satir[s] ?? '')).join('\t');
        paragraflar.push(par(metin, { kalin: j === 0, sekmeler: duraklar }));
      }
      continue;
    }

    // Record layout. The header is not simply the first row: these sheets often
    // open with a one-cell title — "HESAP HAREKET TABLOSU" — and taking that as
    // the header labelled every field with the report's own name.
    const enGenis = Math.max(...sayfa.satirlar.map((r) => r.length));
    const baslikIndeksi = sayfa.satirlar.findIndex((r) => r.length >= Math.max(2, enGenis * 0.6));

    if (baslikIndeksi < 0) {
      for (const satir of sayfa.satirlar) paragraflar.push(par(satir.filter(Boolean).join('   ')));
      continue;
    }

    // Anything above the header is a caption; keep it as its own line.
    for (const ust of sayfa.satirlar.slice(0, baslikIndeksi)) {
      const metin = ust.filter(Boolean).join('   ');
      if (metin) paragraflar.push(par(metin, { kalin: true, alt: 2 }));
    }

    const basliklar = sayfa.satirlar[baslikIndeksi].map((h, k) => String(h || `Sütun ${k + 1}`));
    const veriSatirlari = sayfa.satirlar.slice(baslikIndeksi + 1);

    if (!veriSatirlari.length) {
      for (const satir of sayfa.satirlar) paragraflar.push(par(satir.filter(Boolean).join('   ')));
      continue;
    }

    // One transaction reads best as a labelled block. Two thousand of them do
    // not: at twenty fields each that is six hundred pages of "alan: değer".
    // Past a handful of rows the table is split into column groups instead —
    // still a table, still one line per row, just continued further down.
    if (veriSatirlari.length > 20) {
      const genislikler = basliklar.map((_, k) =>
        Math.min(200, Math.max(olc(basliklar[k], boyut), ...veriSatirlari.map((r) => olc(String(r[k] ?? ''), boyut)), 12))
      );

      // Greedy grouping, and the first column repeats in every group so a row can
      // be followed from one block to the next.
      const anahtarGenislik = genislikler[0] + 10;
      const obekler = [];
      let obek = [];
      let toplam = 0;
      for (let k = 0; k < basliklar.length; k++) {
        const g = genislikler[k] + 10;
        if (obek.length && toplam + g > genislik - (obekler.length ? anahtarGenislik : 0)) {
          obekler.push(obek);
          obek = [];
          toplam = 0;
        }
        obek.push(k);
        toplam += g;
      }
      if (obek.length) obekler.push(obek);

      const kesildi = veriSatirlari.length > satirSiniri;
      const gosterilen = kesildi ? veriSatirlari.slice(0, satirSiniri) : veriSatirlari;

      for (const [o, sutunlar] of obekler.entries()) {
        const kolonlar = o === 0 ? sutunlar : [0, ...sutunlar.filter((k) => k !== 0)];

        if (obekler.length > 1) {
          paragraflar.push(
            par(`Sütunlar ${kolonlar[0] + 1}–${kolonlar[kolonlar.length - 1] + 1} (${o + 1}/${obekler.length})`, {
              kalin: true,
              ust: o ? 12 : 4,
              alt: 2
            })
          );
        }

        const duraklar = [];
        let x = 0;
        for (let i = 0; i < kolonlar.length - 1; i++) {
          x += genislikler[kolonlar[i]] + 10;
          duraklar.push({ konum: Math.round(x), hiza: 0 });
        }

        paragraflar.push(par(kolonlar.map((k) => basliklar[k]).join('\t'), { kalin: true, sekmeler: duraklar }));
        for (const satir of gosterilen) {
          paragraflar.push(par(kolonlar.map((k) => String(satir[k] ?? '')).join('\t'), { sekmeler: duraklar }));
        }
      }

      if (kesildi) {
        paragraflar.push(
          par(
            `… tablonun ${veriSatirlari.length} satırından ilk ${satirSiniri} tanesi yazdırıldı. ` +
              'Tamamı, indirilen klasördeki özgün dosyada.',
            { kalin: true, ust: 10 }
          )
        );
      }
      continue;
    }

    for (const [j, satir] of veriSatirlari.entries()) {
      paragraflar.push(par(`— ${j + 1}. kayıt —`, { kalin: true, ust: 8, alt: 2 }));
      for (const [k, baslik] of basliklar.entries()) {
        const deger = String(satir[k] ?? '').trim();
        if (deger) paragraflar.push(par(`${baslik}: ${deger}`));
      }
    }
  }

  return { paragraflar, gerekenGenislik, kayitDuzeni };
}

/**

/** An Office file: a zip whose entries are the OOXML parts. */
export function xlsxMi(girdiler) {
  return girdiler.some((g) => /^xl\/worksheets\/sheet\d+\.xml$/.test(g.ad));
}
