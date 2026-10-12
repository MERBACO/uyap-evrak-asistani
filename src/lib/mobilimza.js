/**
 * mobilimza.js — the details the quick mobile-signature login keeps.
 *
 * UYAP's mobile-signature login is e-Devlet's: three fields (T.C. kimlik no, GSM
 * number, operator) and a confirmation on the phone. Nothing secret is stored —
 * the phone and its PIN are the credential — but the kimlik no is personal data,
 * so it is checked here once, when it is saved, and never shown again in full.
 */

// `kod` is the id of e-Devlet's own radio button for that operator.
export const OPERATORLER = [
  { kod: 'turkcell', ad: 'Turkcell' },
  { kod: 'vodafone', ad: 'Vodafone' },
  { kod: 'turktelekom', ad: 'Türk Telekom' }
];

export const operatorAdi = (kod) => OPERATORLER.find((o) => o.kod === kod)?.ad || '';

/** The checksum every kimlik no carries; catches a mistyped digit before e-Devlet does. */
export function tcGecerliMi(tc) {
  if (!/^[1-9]\d{10}$/.test(tc)) return false;
  const r = [...tc].map(Number);
  const tekler = r[0] + r[2] + r[4] + r[6] + r[8];
  const ciftler = r[1] + r[3] + r[5] + r[7];
  if ((((tekler * 7 - ciftler) % 10) + 10) % 10 !== r[9]) return false;
  return r.slice(0, 10).reduce((a, b) => a + b, 0) % 10 === r[10];
}

/**
 * The ten digits e-Devlet's field takes, from however the number was typed:
 * "0532 123 45 67", "+90 (532) 123-45-67", "5321234567". Null if it is not a
 * mobile number.
 */
export function gsmDuzelt(girdi) {
  let r = String(girdi || '').replace(/\D/g, '');
  if (r.length === 12 && r.startsWith('90')) r = r.slice(2);
  if (r.length === 11 && r.startsWith('0')) r = r.slice(1);
  return /^5\d{9}$/.test(r) ? r : null;
}

/** "0532 *** ** 67": enough to recognise one's own number, not enough to dial it. */
export function gsmMaskele(gsm) {
  return /^\d{10}$/.test(gsm || '') ? `0${gsm.slice(0, 3)} *** ** ${gsm.slice(8)}` : '';
}

export function tcMaskele(tc) {
  return /^\d{11}$/.test(tc || '') ? `${tc.slice(0, 2)}*******${tc.slice(9)}` : '';
}

/** @returns {{bilgi: {tc, gsm, operator}} | {hata: string}} */
export function bilgiyiDogrula({ tc, gsm, operator }) {
  const t = String(tc || '').replace(/\D/g, '');
  if (!tcGecerliMi(t)) return { hata: 'T.C. kimlik numarası geçerli değil; 11 haneyi kontrol edin.' };
  const g = gsmDuzelt(gsm);
  if (!g) return { hata: 'GSM numarası geçerli değil; 5 ile başlayan 10 haneyi yazın (ör. 532 123 45 67).' };
  if (!operatorAdi(operator)) return { hata: 'Mobil imzanızın bağlı olduğu operatörü seçin.' };
  return { bilgi: { tc: t, gsm: g, operator } };
}
