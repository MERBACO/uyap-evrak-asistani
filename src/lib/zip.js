/**
 * zip.js — a minimal ZIP writer.
 *
 * Written here rather than pulled from npm because the extension has no network
 * access and no build step: whatever ships is what you can read.
 *
 * Stored, never deflated. Court documents arrive as PDF, UDF (itself a zip) and
 * scanned images — all already compressed. Deflating them again costs seconds
 * per file across a thousand documents and saves almost nothing.
 *
 * Format: PKZIP APPNOTE 6.3.x, classic 32-bit records. ZIP64 is not implemented,
 * so the writer refuses to build an archive that would need it rather than
 * emitting one that silently truncates.
 */

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[i] = c >>> 0;
  }
  return t;
})();

export function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** MS-DOS date/time, the only timestamp the classic format carries. */
function dosZaman(d = new Date()) {
  const time = (d.getHours() << 11) | (d.getMinutes() << 5) | (Math.floor(d.getSeconds() / 2) & 0x1f);
  const date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  return { time, date };
}

function yaz(view, offset, degerler) {
  let o = offset;
  for (const [boyut, deger] of degerler) {
    if (boyut === 2) view.setUint16(o, deger, true);
    else view.setUint32(o, deger, true);
    o += boyut;
  }
  return o;
}

// 4 GB, minus room for the central directory. Past this the classic format
// cannot express the offsets and the archive would be quietly wrong.
const SINIR = 3_900_000_000;

export class ZipYazici {
  constructor() {
    this.parcalar = [];
    this.kayitlar = [];
    this.offset = 0;
  }

  get boyut() {
    return this.offset;
  }

  /**
   * @param {string} yol  path inside the archive, '/' separated
   * @param {Uint8Array} veri
   */
  ekle(yol, veri) {
    if (this.offset + veri.length > SINIR) {
      throw new Error('Arşiv 4 GB sınırını aşıyor. Daha az evrak seçip ayrı ayrı indirin.');
    }

    const ad = new TextEncoder().encode(yol);
    const crc = crc32(veri);
    const { time, date } = dosZaman();

    const yerel = new Uint8Array(30);
    yaz(new DataView(yerel.buffer), 0, [
      [4, 0x04034b50], // local file header
      [2, 20], // version needed
      [2, 0x0800], // bit 11: the name is UTF-8
      [2, 0], // stored
      [2, time],
      [2, date],
      [4, crc],
      [4, veri.length],
      [4, veri.length],
      [2, ad.length],
      [2, 0]
    ]);

    this.parcalar.push(yerel, ad, veri);
    this.kayitlar.push({ ad, crc, boyut: veri.length, offset: this.offset, time, date });
    this.offset += yerel.length + ad.length + veri.length;
  }

  /** @returns {Blob} the finished archive */
  bitir() {
    const merkezBasi = this.offset;
    let merkezBoyut = 0;

    for (const k of this.kayitlar) {
      const bas = new Uint8Array(46);
      yaz(new DataView(bas.buffer), 0, [
        [4, 0x02014b50], // central directory header
        [2, 20], // version made by
        [2, 20], // version needed
        [2, 0x0800],
        [2, 0],
        [2, k.time],
        [2, k.date],
        [4, k.crc],
        [4, k.boyut],
        [4, k.boyut],
        [2, k.ad.length],
        [2, 0], // extra
        [2, 0], // comment
        [2, 0], // disk
        [2, 0], // internal attrs
        [4, 0], // external attrs
        [4, k.offset]
      ]);
      this.parcalar.push(bas, k.ad);
      merkezBoyut += bas.length + k.ad.length;
    }

    const son = new Uint8Array(22);
    yaz(new DataView(son.buffer), 0, [
      [4, 0x06054b50], // end of central directory
      [2, 0],
      [2, 0],
      [2, this.kayitlar.length],
      [2, this.kayitlar.length],
      [4, merkezBoyut],
      [4, merkezBasi],
      [2, 0]
    ]);
    this.parcalar.push(son);

    return new Blob(this.parcalar, { type: 'application/zip' });
  }
}
