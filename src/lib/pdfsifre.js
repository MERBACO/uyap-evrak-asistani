/**
 * pdfsifre.js — opening PDFs that are "encrypted" without a password.
 *
 * Many official PDFs are encrypted only to restrict editing or copying: they
 * open in any viewer with no password asked, because the key is derived from
 * public material — an empty password, the file's own id, and values stored in
 * the file. pdf-lib reads the structure of such files but not their streams, so
 * their text came back as noise. One in two PDFs from a government source in a
 * first sample was of this kind.
 *
 * The standard security handler, revisions 2 to 4: RC4 (40 to 128 bit) and
 * AES-128. AES-256 (revisions 5 and 6) and files that really do need a
 * password are reported as unreadable rather than guessed at.
 *
 * MD5 and RC4 are written out here — WebCrypto offers neither — and AES uses
 * the browser's own implementation.
 */

/* --------------------------------------------------------------------- MD5 */

const MD5_S = [7, 12, 17, 22, 5, 9, 14, 20, 4, 11, 16, 23, 6, 10, 15, 21];
const MD5_K = Array.from({ length: 64 }, (_, i) => Math.floor(Math.abs(Math.sin(i + 1)) * 2 ** 32) >>> 0);

export function md5(veri) {
  const n = veri.length;
  const blokSayisi = ((n + 8) >>> 6) + 1;
  const b = new Uint8Array(blokSayisi * 64);
  b.set(veri);
  b[n] = 0x80;
  const bitler = n * 8;
  const dv = new DataView(b.buffer);
  dv.setUint32(b.length - 8, bitler >>> 0, true);
  dv.setUint32(b.length - 4, Math.floor(bitler / 2 ** 32), true);

  let a0 = 0x67452301, b0 = 0xefcdab89, c0 = 0x98badcfe, d0 = 0x10325476;
  const M = new Uint32Array(16);
  for (let blok = 0; blok < blokSayisi; blok++) {
    for (let j = 0; j < 16; j++) M[j] = dv.getUint32(blok * 64 + j * 4, true);
    let A = a0, B = b0, C = c0, D = d0;
    for (let i = 0; i < 64; i++) {
      let F, g;
      if (i < 16) { F = (B & C) | (~B & D); g = i; }
      else if (i < 32) { F = (D & B) | (~D & C); g = (5 * i + 1) % 16; }
      else if (i < 48) { F = B ^ C ^ D; g = (3 * i + 5) % 16; }
      else { F = C ^ (B | ~D); g = (7 * i) % 16; }
      F = (F + A + MD5_K[i] + M[g]) >>> 0;
      A = D;
      D = C;
      C = B;
      const s = MD5_S[(i >> 4) * 4 + (i % 4)];
      B = (B + ((F << s) | (F >>> (32 - s)))) >>> 0;
    }
    a0 = (a0 + A) >>> 0;
    b0 = (b0 + B) >>> 0;
    c0 = (c0 + C) >>> 0;
    d0 = (d0 + D) >>> 0;
  }
  const out = new Uint8Array(16);
  const ov = new DataView(out.buffer);
  [a0, b0, c0, d0].forEach((v, i) => ov.setUint32(i * 4, v, true));
  return out;
}

/* --------------------------------------------------------------------- RC4 */

export function rc4(anahtar, veri) {
  const S = new Uint8Array(256);
  for (let i = 0; i < 256; i++) S[i] = i;
  for (let i = 0, j = 0; i < 256; i++) {
    j = (j + S[i] + anahtar[i % anahtar.length]) & 0xff;
    [S[i], S[j]] = [S[j], S[i]];
  }
  const out = new Uint8Array(veri.length);
  for (let k = 0, i = 0, j = 0; k < veri.length; k++) {
    i = (i + 1) & 0xff;
    j = (j + S[i]) & 0xff;
    [S[i], S[j]] = [S[j], S[i]];
    out[k] = veri[k] ^ S[(S[i] + S[j]) & 0xff];
  }
  return out;
}

/* ------------------------------------------------- standard security handler */

// The 32-byte padding string every password is completed with.
const PAD = Uint8Array.from([
  0x28, 0xbf, 0x4e, 0x5e, 0x4e, 0x75, 0x8a, 0x41, 0x64, 0x00, 0x4e, 0x56, 0xff, 0xfa, 0x01, 0x08,
  0x2e, 0x2e, 0x00, 0xb6, 0xd0, 0x68, 0x3e, 0x80, 0x2f, 0x0c, 0xa9, 0xfe, 0x64, 0x53, 0x69, 0x7a
]);

const birlestir = (...parcalar) => {
  const out = new Uint8Array(parcalar.reduce((t, p) => t + p.length, 0));
  let o = 0;
  for (const p of parcalar) {
    out.set(p, o);
    o += p.length;
  }
  return out;
};
const le32 = (v) => Uint8Array.from([v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff]);

/**
 * The file key for the empty user password (Algorithm 2), and its check
 * against the stored U value (Algorithms 4 and 5).
 *
 * Exported for the tests, which build an encrypted file the same way.
 */
export function dosyaAnahtari({ O, P, id, R, n, metaSifreli = true }) {
  let h = md5(birlestir(PAD, O.subarray(0, 32), le32(P >>> 0), id, R >= 4 && !metaSifreli ? le32(0xffffffff) : new Uint8Array()));
  if (R >= 3) for (let i = 0; i < 50; i++) h = md5(h.subarray(0, n));
  return h.subarray(0, n);
}

export function uDegeri(anahtar, R, id) {
  if (R === 2) return rc4(anahtar, PAD);
  let x = rc4(anahtar, md5(birlestir(PAD, id)));
  for (let i = 1; i <= 19; i++) x = rc4(anahtar.map((b) => b ^ i), x);
  return x; // 16 bytes; the stored U pads them to 32 with arbitrary bytes
}

/**
 * Prepare a decryptor for a loaded document, or null when it is not encrypted.
 *
 * @returns {Promise<null | ((bytes: Uint8Array, ref: {objectNumber: number, generationNumber: number}) => Promise<Uint8Array>)>}
 * @throws when the file needs a password or uses an unsupported scheme
 */
export async function sifreCozucu(belge, pdfLib) {
  const { PDFName, PDFDict, PDFNumber, PDFArray, PDFBool } = pdfLib;
  const ctx = belge.context;
  const sifreSozlugu = ctx.lookup(ctx.trailerInfo.Encrypt);
  if (!(sifreSozlugu instanceof PDFDict)) return null;

  const al = (d, k) => ctx.lookup(d.get(PDFName.of(k)));
  const sayi = (d, k, varsayilan) => {
    const v = al(d, k);
    return v instanceof PDFNumber ? v.asNumber() : varsayilan;
  };
  const baytlar = (v) => (v && typeof v.asBytes === 'function' ? v.asBytes() : new Uint8Array());

  const filtre = al(sifreSozlugu, 'Filter');
  if (!(filtre instanceof PDFName) || filtre.decodeText() !== 'Standard') {
    throw new Error('Bu PDF tanınmayan bir yöntemle şifreli; metni okunamıyor.');
  }
  const V = sayi(sifreSozlugu, 'V', 0);
  const R = sayi(sifreSozlugu, 'R', 2);
  if (V >= 5 || R >= 5) throw new Error('Bu PDF AES-256 ile şifreli; metni okunamıyor.');

  let yontem = 'rc4';
  let n = V === 1 ? 5 : Math.min(16, Math.max(5, sayi(sifreSozlugu, 'Length', 40) / 8));
  if (V === 4) {
    const cf = al(sifreSozlugu, 'CF');
    const stmf = al(sifreSozlugu, 'StmF');
    const ad = stmf instanceof PDFName ? stmf.decodeText() : 'Identity';
    if (ad === 'Identity') return null; // streams are stored in the clear
    const filtreSozlugu = cf instanceof PDFDict ? al(cf, ad) : null;
    const cfm = filtreSozlugu instanceof PDFDict ? al(filtreSozlugu, 'CFM') : null;
    const cfmAdi = cfm instanceof PDFName ? cfm.decodeText() : 'None';
    if (cfmAdi === 'None') return null;
    if (cfmAdi === 'AESV2') yontem = 'aes';
    else if (cfmAdi !== 'V2') throw new Error(`Bu PDF desteklenmeyen bir yöntemle şifreli (${cfmAdi}); metni okunamıyor.`);
    n = 16;
  }

  const idDizisi = ctx.lookup(ctx.trailerInfo.ID);
  const id = idDizisi instanceof PDFArray ? baytlar(ctx.lookup(idDizisi.get(0))) : new Uint8Array();
  const metaDegeri = al(sifreSozlugu, 'EncryptMetadata');
  const metaSifreli = !(metaDegeri instanceof PDFBool) || metaDegeri.asBoolean() !== false;

  const anahtar = dosyaAnahtari({
    O: baytlar(al(sifreSozlugu, 'O')),
    P: sayi(sifreSozlugu, 'P', 0),
    id,
    R,
    n,
    metaSifreli
  });

  // An empty password that does not reproduce U is a file that needs a real one.
  const U = baytlar(al(sifreSozlugu, 'U'));
  const beklenen = uDegeri(anahtar, R, id);
  const karsilastir = R === 2 ? 32 : 16;
  for (let i = 0; i < karsilastir; i++) {
    if (U[i] !== beklenen[i]) throw new Error('Bu PDF parola korumalı; metni okunamıyor.');
  }

  return async (veri, ref) => {
    const no = ref.objectNumber;
    const nesil = ref.generationNumber;
    const tuz = yontem === 'aes' ? Uint8Array.from([0x73, 0x41, 0x6c, 0x54]) : new Uint8Array();
    const nesneAnahtari = md5(
      birlestir(anahtar, Uint8Array.from([no & 0xff, (no >> 8) & 0xff, (no >> 16) & 0xff, nesil & 0xff, (nesil >> 8) & 0xff]), tuz)
    ).subarray(0, Math.min(n + 5, 16));

    if (yontem === 'rc4') return rc4(nesneAnahtari, veri);
    if (veri.length < 32) return new Uint8Array();
    const k = await crypto.subtle.importKey('raw', nesneAnahtari, 'AES-CBC', false, ['decrypt']);
    return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-CBC', iv: veri.subarray(0, 16) }, k, veri.subarray(16)));
  };
}
