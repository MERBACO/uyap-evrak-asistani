/**
 * excel.js — the index of a downloaded case file, as a spreadsheet.
 *
 * The numbered file names keep the folder in order; they cannot be filtered by
 * type, searched by sender, or tell which documents were never downloaded and
 * why. A spreadsheet does all of that in a program every office already has,
 * and still opens years from now without this extension.
 *
 * Written by hand like zip.js: the format is a handful of XML parts in a zip,
 * and a library for it would outweigh everything else the extension ships.
 * Strings are inline, so there is no shared-string table to keep in step;
 * dates are real dates, so the column sorts and filters as dates.
 *
 * Each file name links to the document beside it. The link is relative, so it
 * keeps working when the folder is moved or copied as a whole.
 */

import { ZipYazici } from './zip.js';

/** The columns, in order: heading, width, and how to read the value from a row. */
export const SUTUNLAR = [
  { baslik: 'Sıra', genislik: 6, alan: 'sira', tur: 'sayi' },
  { baslik: 'Tarih', genislik: 11, alan: 'tarih', tur: 'tarih' },
  { baslik: 'Tür', genislik: 24, alan: 'tur' },
  { baslik: 'Evrak', genislik: 34, alan: 'ad' },
  { baslik: 'Açıklama / Gönderen', genislik: 36, alan: 'aciklama' },
  { baslik: 'Ana Evrak', genislik: 22, alan: 'anaEvrak' },
  { baslik: 'Kaynak Dosya', genislik: 26, alan: 'kaynak' },
  { baslik: 'Dosya Adı', genislik: 48, alan: 'dosyaAdi', tur: 'baglanti' },
  { baslik: 'Durum', genislik: 30, alan: 'durum' }
];

const BASLIK_SATIRI = 4; // title, a line about the file, a blank, then headings

/** Characters XML 1.0 forbids outright, which UYAP text occasionally carries. */
const YASAK = /[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g;

function xml(s) {
  return String(s ?? '')
    .replace(YASAK, '')
    .slice(0, 32000) // Excel's cell limit is 32767
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** "C" for the third column, "AA" for the 27th. */
function sutunHarfi(i) {
  let s = '';
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

/** Days since 1899-12-30, Excel's epoch; the date only, never the time. */
function excelTarihi(iso) {
  const ms = Date.parse(iso || '');
  return Number.isNaN(ms) ? null : Math.floor(ms / 86_400_000) + 25569;
}

/**
 * A relative link target, written the way Excel writes its own.
 *
 * Excel escapes only what would break the address — spaces, and the % and #
 * that would be read as an escape or a fragment — and keeps Turkish letters as
 * they are. Escaping those too ("Zapt%C4%B1") produced a link Excel would not
 * turn back into the file name, so it pointed at a file that does not exist.
 */
function goreliHedef(ad) {
  return String(ad).replace(/%/g, '%25').replace(/#/g, '%23').replace(/ /g, '%20');
}

const metinHucresi = (ref, deger, stil = 0) =>
  `<c r="${ref}" t="inlineStr"${stil ? ` s="${stil}"` : ''}><is><t xml:space="preserve">${xml(deger)}</t></is></c>`;

/**
 * Build the workbook.
 *
 * @param {Object}   o
 * @param {string}   o.baslik    the case file, for the title row
 * @param {string}   o.altBaslik one line under it: when, how many
 * @param {Array<Object>} o.satirlar  one per document, keyed by SUTUNLAR[].alan
 * @param {Array<Object>} [o.sutunlar] another table's columns, same shape as SUTUNLAR
 * @param {string}   [o.sayfaAdi]  the sheet's name (31 characters at most)
 * @returns {Blob}
 */
export function excelDizini({ baslik = '', altBaslik = '', satirlar = [], sutunlar = SUTUNLAR, sayfaAdi = 'Evrak Dizini' }) {
  const SUTUNLAR = sutunlar;
  const sonSatir = BASLIK_SATIRI + satirlar.length;
  const sonSutun = sutunHarfi(SUTUNLAR.length - 1);
  const baglantilar = [];

  const satirXml = [];
  satirXml.push(`<row r="1">${metinHucresi('A1', baslik, 1)}</row>`);
  satirXml.push(`<row r="2">${metinHucresi('A2', altBaslik, 4)}</row>`);
  satirXml.push(
    `<row r="${BASLIK_SATIRI}">` +
      SUTUNLAR.map((s, i) => metinHucresi(`${sutunHarfi(i)}${BASLIK_SATIRI}`, s.baslik, 2)).join('') +
      '</row>'
  );

  for (const [n, satir] of satirlar.entries()) {
    const r = BASLIK_SATIRI + 1 + n;
    const hucreler = SUTUNLAR.map((s, i) => {
      const ref = `${sutunHarfi(i)}${r}`;
      const deger = satir[s.alan];
      if (deger == null || deger === '') return '';
      if (s.tur === 'sayi' && Number.isFinite(Number(deger))) return `<c r="${ref}"><v>${Number(deger)}</v></c>`;
      if (s.tur === 'tarih') {
        const gun = excelTarihi(deger);
        return gun == null ? metinHucresi(ref, deger) : `<c r="${ref}" s="3"><v>${gun}</v></c>`;
      }
      if (s.tur === 'baglanti') {
        // Only a file that is actually in the folder gets a link.
        const hedef = satir.baglanti;
        if (hedef) baglantilar.push({ ref, hedef: goreliHedef(hedef) });
        return metinHucresi(ref, deger, hedef ? 5 : 0);
      }
      return metinHucresi(ref, deger);
    }).join('');
    satirXml.push(`<row r="${r}">${hucreler}</row>`);
  }

  const sayfa =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ' +
    'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
    `<dimension ref="A1:${sonSutun}${Math.max(sonSatir, BASLIK_SATIRI)}"/>` +
    // Headings stay in view while scrolling through a few hundred documents.
    '<sheetViews><sheetView workbookViewId="0">' +
    `<pane ySplit="${BASLIK_SATIRI}" topLeftCell="A${BASLIK_SATIRI + 1}" activePane="bottomLeft" state="frozen"/>` +
    '</sheetView></sheetViews>' +
    '<cols>' +
    SUTUNLAR.map((s, i) => `<col min="${i + 1}" max="${i + 1}" width="${s.genislik}" customWidth="1"/>`).join('') +
    '</cols>' +
    `<sheetData>${satirXml.join('')}</sheetData>` +
    `<autoFilter ref="A${BASLIK_SATIRI}:${sonSutun}${Math.max(sonSatir, BASLIK_SATIRI)}"/>` +
    (baglantilar.length
      ? '<hyperlinks>' +
        baglantilar.map((b, i) => `<hyperlink ref="${b.ref}" r:id="rIdB${i + 1}"/>`).join('') +
        '</hyperlinks>'
      : '') +
    '</worksheet>';

  const sayfaIliskileri =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    baglantilar
      .map(
        (b, i) =>
          `<Relationship Id="rIdB${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" ` +
          `Target="${xml(b.hedef)}" TargetMode="External"/>`
      )
      .join('') +
    '</Relationships>';

  const kitap =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
    '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ' +
    'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
    `<sheets><sheet name="${sayfaAdi}" sheetId="1" r:id="rId1"/></sheets>` +
    '<definedNames>' +
    `<definedName name="_xlnm._FilterDatabase" localSheetId="0" hidden="1">'${sayfaAdi}'!$A$${BASLIK_SATIRI}:$${sonSutun}$${Math.max(sonSatir, BASLIK_SATIRI)}</definedName>` +
    '</definedNames>' +
    '</workbook>';

  // 0 plain · 1 title · 2 heading · 3 date · 4 note · 5 link
  const stiller =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
    '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<numFmts count="1"><numFmt numFmtId="164" formatCode="dd\\.mm\\.yyyy"/></numFmts>' +
    '<fonts count="5">' +
    '<font><sz val="11"/><name val="Calibri"/><family val="2"/></font>' +
    '<font><b/><sz val="13"/><name val="Calibri"/><family val="2"/></font>' +
    '<font><b/><sz val="11"/><name val="Calibri"/><family val="2"/></font>' +
    '<font><i/><sz val="10"/><color rgb="FF5C6B7A"/><name val="Calibri"/><family val="2"/></font>' +
    '<font><u/><sz val="11"/><color rgb="FF0563C1"/><name val="Calibri"/><family val="2"/></font>' +
    '</fonts>' +
    '<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>' +
    '<fill><patternFill patternType="solid"><fgColor rgb="FFE4E9EF"/><bgColor indexed="64"/></patternFill></fill></fills>' +
    '<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border>' +
    '<border><left/><right/><top/><bottom style="thin"><color rgb="FF9AA7B4"/></bottom><diagonal/></border></borders>' +
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
    '<cellXfs count="6">' +
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
    '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
    '<xf numFmtId="0" fontId="2" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>' +
    '<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
    '<xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
    '<xf numFmtId="0" fontId="4" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
    '</cellXfs>' +
    '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
    '</styleSheet>';

  const parcalar = {
    '[Content_Types].xml':
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
      '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
      '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
      '</Types>',
    '_rels/.rels':
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
      '</Relationships>',
    'xl/workbook.xml': kitap,
    'xl/_rels/workbook.xml.rels':
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
      '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
      '</Relationships>',
    'xl/styles.xml': stiller,
    'xl/worksheets/sheet1.xml': sayfa,
    'xl/worksheets/_rels/sheet1.xml.rels': sayfaIliskileri
  };

  const zip = new ZipYazici();
  const enc = new TextEncoder();
  for (const [ad, icerik] of Object.entries(parcalar)) zip.ekle(ad, enc.encode(icerik));
  const blob = zip.bitir();
  return new Blob([blob], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  });
}
