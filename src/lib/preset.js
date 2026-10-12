/**
 * preset.js — the portal map.
 *
 * UYAP's internal API is not documented and changes when the portal is updated.
 * Rather than hard-coding endpoints in the source, this extension reads them from
 * a JSON preset (presets/*.json). When UYAP changes, a preset PR fixes the
 * extension for everyone — no new release, no code review of business logic.
 *
 * A preset says three things:
 *   - which request lists the documents of a case file,
 *   - where in that response the array lives and which key holds which field,
 *   - which request returns the bytes of one document.
 */

/**
 * Read `a.b.c` out of a nested object. A `*` segment means "whatever key is
 * there" — UYAP nests the document array under the case number itself
 * (tumEvraklar["2026/999(Hukuk Dava Dosyası)"]), so the path cannot be fixed.
 */
export function getByPath(obj, path) {
  return resolvePath(obj, path).value;
}

/** Same walk, but also reports the key a `*` matched — that key is the case label. */
export function resolvePath(obj, path) {
  if (!path) return { value: undefined, key: null };
  let key = null;

  const value = path.split('.').reduce((acc, seg) => {
    if (acc == null) return undefined;
    if (seg !== '*') return acc[seg];

    const entries = Object.entries(acc);
    const arrays = entries.filter(([, v]) => Array.isArray(v));
    if (arrays.length) {
      key = arrays.map(([k]) => k).join(' + ');
      return arrays.flatMap(([, v]) => v);
    }
    if (!entries.length) return undefined;
    key = entries[0][0];
    return entries[0][1];
  }, obj);

  return { value, key };
}

/**
 * Fill `{{name}}` placeholders.
 *
 * Escaping is not optional here. UYAP document ids look like
 * `"@ju8akt9uv19WGtywHt6+XNP7etyBSpFFoOhptMO"` — they contain `+`, `@`, `/` and
 * a pair of literal double quotes. Dropped into a query string unescaped, `+`
 * reads as a space and the server resolves a different document, or none. That
 * failure produces a file, so it looks like success.
 *
 * @param {string} mode 'url' for query strings, 'json' for request bodies, 'raw' otherwise
 */
export function render(template, vars, mode = 'raw') {
  if (template == null) return template;
  return String(template).replace(/\{\{(\w+)\}\}/g, (_, k) => {
    const v = vars[k];
    if (v == null) return '';
    if (mode === 'url') return encodeURIComponent(v);
    if (mode === 'json') return String(v).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    return String(v);
  });
}

/**
 * The recorded URL showed `dosyaId=%22…%22`, so the template wrapped the
 * placeholder in quotes. But those quotes belong to the value itself, and
 * wrapping again yields `%22%22…%22%22`. Drop the wrapper whenever the value
 * already carries one.
 */
export function stripRedundantQuotes(path, vars) {
  let out = String(path ?? '');
  for (const [k, v] of Object.entries(vars || {})) {
    if (typeof v !== 'string' || !(v.startsWith('"') && v.endsWith('"'))) continue;
    out = out
      .replace(new RegExp(`%22\\{\\{${k}\\}\\}%22`, 'gi'), `{{${k}}}`)
      .replace(new RegExp(`"\\{\\{${k}\\}\\}"`, 'g'), `{{${k}}}`);
  }
  return out;
}

/**
 * UYAP returns dates in several shapes depending on the endpoint:
 * epoch milliseconds, ISO strings, and dd/MM/yyyy or dd.MM.yyyy HH:mm.
 * Everything downstream assumes an ISO string, so normalize here.
 */
export function parseDate(value) {
  if (value == null || value === '') return null;

  if (typeof value === 'number' || /^\d{10,13}$/.test(String(value))) {
    const n = Number(value);
    const ms = String(value).length <= 10 ? n * 1000 : n;
    const d = new Date(ms);
    return isNaN(d) ? null : d.toISOString();
  }

  const s = String(value).trim();

  const tr = s.match(/^(\d{2})[./-](\d{2})[./-](\d{4})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (tr) {
    const [, dd, mm, yyyy, hh = '00', mi = '00', ss = '00'] = tr;
    const d = new Date(Date.UTC(+yyyy, +mm - 1, +dd, +hh, +mi, +ss));
    return isNaN(d) ? null : d.toISOString();
  }

  const d = new Date(s);
  return isNaN(d) ? null : d.toISOString();
}

/**
 * Canonical document record. Everything else in the extension speaks this shape.
 * @typedef {Object} Evrak
 * @property {string}   id       stable id used for de-duplication
 * @property {string}   ad       document title as shown in the portal
 * @property {string}   tur      document type (Karar, Dilekçe, Tebligat…)
 * @property {?string}  tarih    ISO date, or null when the portal gives none
 * @property {string[]} klasor   folder path inside the case file, outermost first
 * @property {string}   uzanti   file extension without the dot
 * @property {Object}   raw      the untouched source object, for debugging
 */

/**
 * Documents can carry attachments (the portal shows "(2 ek)"). They are real
 * documents in the file, so flatten them in right after their parent rather
 * than leaving them out of the archive.
 */
export function expandEvraklar(list, fields) {
  const out = [];
  for (const raw of list) {
    const parent = normalizeEvrak(raw, fields);
    parent.imza = belgeImzasi(raw, parent);
    out.push(parent);

    const ekler = fields.ekler ? getByPath(raw, fields.ekler) : null;
    if (!Array.isArray(ekler)) continue;

    // Attachments usually carry no name of their own. Numbering them keeps 222
    // siblings distinguishable and ordered; without it every file would collide
    // and the operating system would renumber them in arrival order, not document order.
    const width = Math.max(2, String(ekler.length).length);
    ekler.forEach((ek, i) => {
      const child = normalizeEvrak(ek, fields);
      child.tarih = child.tarih || parent.tarih;
      // Attachment records are sparse: they routinely omit the case-file id the
      // download endpoint needs, and sometimes their own id too. Inherit what is
      // missing rather than sending an empty parameter.
      child.dosyaId = child.dosyaId || parent.dosyaId;
      if (child.yetkili !== false) child.yetkili = parent.yetkili;
      if (!child.tarihAnahtari) child.tarihAnahtari = '(ana evraktan)';
      child.parentId = parent.id;
      child.ekIndex = i + 1;
      // Short label, parent shown separately: "Genel Karar — ek 01 Genel Karar"
      // repeated the parent's name in every attachment row and pushed the useful
      // part off the end of the line.
      child.ekEtiketi = `Ek ${String(i + 1).padStart(width, '0')}`;
      child.anaAd = parent.ad;
      // The child's own label, not its category: an attachment's file name is
      // what tells it apart from its four siblings, while its category is by
      // design the same for all of them.
      const kendiAdi = child.ad && child.ad !== 'isimsiz-evrak' ? child.ad : '';
      child.ad = kendiAdi ? `${child.ekEtiketi} · ${kendiAdi}` : child.ekEtiketi;
      child.ekMi = true;
      child.imza = `${parent.imza}#ek${String(i + 1).padStart(width, '0')}`;
      out.push(child);
    });
  }
  return out;
}

export function normalizeEvrak(raw, fields) {
  const klasorRaw = getByPath(raw, fields.klasor);
  const klasor = Array.isArray(klasorRaw)
    ? klasorRaw.map(String)
    : klasorRaw
      ? String(klasorRaw).split(/[/\\>]/).map((s) => s.trim()).filter(Boolean)
      : [];

  // Only some documents carry a title; the rest are known by their type. Decide
  // per record, not once for the whole list — a title key that is filled on five
  // documents out of eight hundred would otherwise leave the rest nameless.
  // Some records carry a file name where the type should be — "2139383870.pdf",
  // "2135627639.xlsx". Treated as types they explode the Türler list into one
  // entry per document, which is the opposite of what grouping is for. Keep the
  // name as the document's label and group it under a single honest category.
  const hamTur = String(firstNonEmpty(getByPath(raw, fields.tur), kayittanBul(raw, FIELD_GUESS.tur)) ?? '').trim();
  const dosyaAdiTuru = dosyaAdiGibi(hamTur);
  const tur = dosyaAdiTuru ? 'Adsız belge' : hamTur;

  // Date, per record, in order of what it means rather than how often it is filled.
  // onaylandigiTarih is the date on the document; sistemeGonderildigiTarih is when
  // UYAP received it. Choosing one column for the whole list meant that a few
  // unapproved records could push every other document onto the wrong date.
  const tarihAdaylari = [...(FIELD_PREFERENCE.tarih || []), fields.tarih].filter(Boolean);
  let tarihAnahtari = tarihAdaylari.find(
    (k) => raw?.[k] !== null && raw?.[k] !== undefined && String(raw[k]).trim() !== '' && parseDate(raw[k])
  );
  if (!tarihAnahtari) {
    tarihAnahtari = Object.keys(raw || {}).find((k) => FIELD_GUESS.tarih.test(k) && parseDate(raw[k]));
  }
  // What a lawyer scans a case file for is the kind of document — "Tensip
  // Zaptı", "Kapalı Tebligat". The free-text field holds party lists like
  // "[Şüpheli AHMET YILMAZ,Vekil MERT BAYUR …]", which is useful detail but a poor
  // label: every row looked different and none said what the document was.
  const aciklama = temizMetin(firstNonEmpty(getByPath(raw, fields.ad), kayittanBul(raw, FIELD_GUESS.ad)));
  // The label keeps the file name — it is the only thing distinguishing these
  // documents from each other, even though it is useless as a category.
  const ad = hamTur || aciklama || 'isimsiz-evrak';

  // The issuing office — "Burhaniye Hazırlık Bürosu". Often the only thing that
  // distinguishes two documents of the same type, and the sub-line is empty
  // without it on the many records that carry no description at all.
  const birim = temizMetin(kayittanBul(raw, /^(gonderenYerKisi|gonderenYer|birim)$/i));
  const uzanti =
    String(getByPath(raw, fields.uzanti) ?? '')
      .replace(/^\./, '')
      .toLowerCase() || guessExtension(ad);

  // Related case files inside one response do not always use the same id key —
  // a CBS soruşturma record may carry ggEvrakId where a dava record carries
  // evrakId. Fall back per record rather than declaring the document unreachable.
  const id = String(
    firstNonEmpty(
      getByPath(raw, fields.id),
      ...Object.keys(raw || {})
        .filter((k) => ID_FALLBACK.test(k))
        .map((k) => raw[k])
    ) ?? ''
  );

  return {
    id,
    idAnahtari:
      getByPath(raw, fields.id)
        ? fields.id
        : Object.keys(raw || {}).find((k) => ID_FALLBACK.test(k) && raw[k]) || '',
    dosyaId: String(getByPath(raw, fields.dosyaId) ?? ''),
    ad,
    aciklama: aciklama === tur ? '' : aciklama, // saying the type twice is not detail
    birim,
    tur,
    // Fresh on every response — good for the download URL, worthless as a key.
    idGecici: true,
    // The portal states per document whether the lawyer is on record for the
    // file it belongs to. Reading it beats discovering the same thing from an
    // error page after the request has already been sent.
    yetkili: kayittanBul(raw, /^is ?Yetkili$/i) !== false,
    // Linked documents carry a second id. Which one the download endpoint wants
    // is not documented, so keep both and let the caller find out.
    ggId: String(raw?.ggEvrakId ?? ''),
    tarih: tarihAnahtari ? parseDate(raw[tarihAnahtari]) : null,
    tarihAnahtari: tarihAnahtari || '',
    klasor,
    uzanti,
    raw
  };
}

/**
 * A key that survives between listings.
 *
 * UYAP re-encrypts document ids on every response: the same document arrives as
 * a different token each time. Those tokens are correct for fetching the file
 * and useless for anything else — deduplication, ordering and download history
 * all need something the portal does not regenerate. So derive a key from what
 * the document *is*: its date, type, description and evrak number.
 */
export function belgeImzasi(raw, e) {
  return [
    e.tarih ? e.tarih.slice(0, 10) : '',
    e.tur || '',
    e.ad || '',
    raw?.birimEvrakNo ?? '',
    raw?.gonderenSayi ?? '',
    raw?.sira ?? ''
  ].join('|');
}

/**
 * Fingerprint of a raw record, for merging and ordering before normalisation.
 * Mirrors belgeImzasi() but works on the untouched response object.
 */
export function kayitImzasi(raw, fields) {
  const tarih = (FIELD_PREFERENCE.tarih || []).map((k) => raw?.[k]).find((v) => v) ?? '';
  return [
    tarih,
    getByPath(raw, fields.tur) ?? '',
    getByPath(raw, fields.ad) ?? '',
    raw?.birimEvrakNo ?? '',
    raw?.gonderenSayi ?? ''
  ].join('|');
}

/**
 * Merge several list requests for one case file into a single set of groups.
 *
 * The portal answers "Son 20 Evrak", "Tüm Evrak" and each folder with its own
 * request, and the same document comes back under a different id token each
 * time — so the id cannot tell two copies of one document apart. The signature
 * can, mostly. What it cannot do is tell apart two *different* documents that
 * share it: two unnumbered tebligat filed on the same day look identical.
 *
 * The earlier merge kept one record per signature even inside a single
 * response, and such a pair lost a document without a word. So signatures are
 * counted per request variant (all its pages together), and the merge keeps,
 * for each signature, as many records as the fullest variant returned. One
 * variant listing a document twice is two documents; two variants listing it
 * once each is one.
 *
 * @param {Array<Array<Object>>} varyantlar  per request variant, its responses (pages)
 * @returns {Array<{key: string, items: Object[]}>}  sorted deterministically, so
 *   two runs over the same case file number every document the same way
 */
export function varyantlariBirlestir(varyantlar, listPath, fields) {
  const grupHarita = new Map(); // group key → signature → records

  for (const yanitlar of varyantlar) {
    const buVaryant = new Map();
    for (const yanit of yanitlar) {
      for (const g of resolveGroups(yanit, listPath)) {
        const imzalar = buVaryant.get(g.key) || new Map();
        buVaryant.set(g.key, imzalar);
        for (const item of g.items) {
          const imza = kayitImzasi(item, fields);
          if (!imzalar.has(imza)) imzalar.set(imza, []);
          imzalar.get(imza).push(item);
        }
      }
    }

    for (const [key, imzalar] of buVaryant) {
      const mevcut = grupHarita.get(key) || new Map();
      grupHarita.set(key, mevcut);
      for (const [imza, items] of imzalar) {
        if (items.length > (mevcut.get(imza)?.length || 0)) mevcut.set(imza, items);
      }
    }
  }

  return [...grupHarita.entries()]
    .sort((a, b) => a[0].localeCompare(b[0], 'tr'))
    .map(([key, imzalar]) => ({
      key,
      items: [...imzalar.entries()]
        .sort((a, b) => a[0].localeCompare(b[0], 'tr'))
        .flatMap(([, items]) => items)
    }))
    .filter((g) => g.items.length);
}

/** Look for a value in this record under any key matching the pattern. */
function kayittanBul(raw, rx) {
  const key = Object.keys(raw || {}).find(
    (k) => rx.test(k) && raw[k] !== null && raw[k] !== undefined && String(raw[k]).trim() !== ''
  );
  return key ? raw[key] : undefined;
}

/**
 * Trim a portal field down to something worth showing.
 *
 * UYAP fills unused fields with placeholders — a lone ".", a comma, a run of
 * spaces. Printed as-is they turn a document's sub-line into noise, so treat
 * anything without a letter or digit as empty.
 */
/**
 * Does this read as a file name rather than a kind of document?
 * A trailing extension, or nothing but digits — either way it names one file
 * instead of describing a class of them.
 */
function dosyaAdiGibi(s) {
  const t = String(s || '').trim();
  if (!t) return false;
  return /\.[a-z0-9]{2,5}$/i.test(t) || /^\d{6,}$/.test(t);
}

function temizMetin(v) {
  const s = String(v ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  return /[\p{L}\p{N}]/u.test(s) ? s : '';
}

function firstNonEmpty(...values) {
  return values.find((v) => v !== null && v !== undefined && String(v).trim() !== '');
}

function guessExtension(name) {
  const m = String(name).match(/\.([a-z0-9]{2,4})$/i);
  return m ? m[1].toLowerCase() : 'pdf';
}

/** Sort oldest → newest. Documents without a date go last, in their original order. */
export function sortChronologically(list) {
  return [...list]
    .map((e, i) => ({ e, i }))
    .sort((a, b) => {
      if (!a.e.tarih && !b.e.tarih) return a.i - b.i;
      if (!a.e.tarih) return 1;
      if (!b.e.tarih) return -1;
      const d = a.e.tarih.localeCompare(b.e.tarih);
      return d !== 0 ? d : a.i - b.i; // equal dates keep source order: attachments stay with their parent
    })
    .map(({ e }) => e);
}

export const FIELD_GUESS = {
  id: /^(evrak(id)?|id|belgeId|dokumanId|evrakNo)$/i,
  dosyaId: /^(dosyaId|dosyaID|dosya_id)$/i,
  ad: /(evrakAdi|dosyaAdi|\bad\b|isim|baslik|aciklama|name|title)/i,
  tur: /(tur|tip|kategori|type)/i,
  tarih: /(tarih|olusturma|date|zaman)/i,
  klasor: /(klasor|folder|dizin|agac|kategoriAdi)/i,
  uzanti: /(uzanti|extension|format|mimeTur|dosyaTuru)/i,
  ekler: /(ekEvrakListesi|ekler|ekListesi|attachments)/i
};

/**
 * Broader net for a document id, used only when the mapped key is absent on a
 * given record. Matches ggEvrakId, birimEvrakId and friends, but never anything
 * naming the case file — dosyaId identifies the folder, not the document, and
 * using it would fetch the same file for every row.
 */
/**
 * Where several keys fit a field equally well, this decides. Two date columns
 * that score the same must not be chosen by response arrival order: the numeric
 * prefix on every filename depends on this, and a run that renumbers the archive
 * is worse than one that picks the less apt column.
 *
 * onaylandigiTarih is the date on the document; sistemeGonderildigiTarih is when
 * UYAP received it. The former is what a case chronology means.
 */
export const FIELD_PREFERENCE = {
  tarih: ['onaylandigiTarih', 'olusturmaTarihi', 'kayitTarihi', 'evrakTarihi', 'sistemeGonderildigiTarih'],
  ad: ['aciklama', 'evrakAdi', 'baslik'],
  tur: ['tur', 'evrakTuru', 'ekTuru'],
  id: ['evrakId', 'id', 'ggEvrakId'],
  dosyaId: ['dosyaId']
};

export const ID_FALLBACK = /^(?!.*dosya)(\w*evrak\w*id|id|belgeid|dokumanid|evrakno)$/i;

/** Every array of objects in a response, largest first. */
export function findArrays(obj, path = '', out = [], depth = 0) {
  if (!obj || typeof obj !== 'object' || depth > 6) return out;
  if (Array.isArray(obj)) {
    if (obj.length && typeof obj[0] === 'object' && obj[0] !== null) {
      out.push({ path, length: obj.length, sample: obj[0] });
    }
    return out;
  }
  for (const [k, v] of Object.entries(obj)) findArrays(v, path ? `${path}.${k}` : k, out, depth + 1);
  return out.sort((a, b) => b.length - a.length);
}

/** A path segment that is not a plain identifier is data, not structure. */
export function wildcardPath(path) {
  return String(path || '')
    .split('.')
    .map((seg) => (/^[A-Za-z_$][\w$]*$/.test(seg) ? seg : '*'))
    .join('.');
}

/**
 * Choose the key for each field by looking at many records, not one.
 *
 * A single sample lies: attachment records carry a different, smaller key set
 * than parent documents, and optional keys are missing from whichever record
 * happens to be first. So score every candidate key by how often it actually
 * holds a usable value, and for dates prefer the key whose values vary — a
 * column that reads the same on all 833 documents is not the document date.
 */
export function guessFields(records) {
  const rows = (Array.isArray(records) ? records : []).slice(0, 40);
  const keys = [...new Set(rows.flatMap((r) => Object.keys(r || {})))];
  const fields = {};

  for (const [field, rx] of Object.entries(FIELD_GUESS)) {
    const candidates = keys.filter((k) => rx.test(k));
    if (!candidates.length) {
      fields[field] = '';
      continue;
    }

    const tercih = FIELD_PREFERENCE[field] || [];
    const puanla = (k) => {
      const values = rows.map((r) => r?.[k]).filter((v) => v !== null && v !== undefined && v !== '');
      if (field !== 'tarih') return values.length;
      const parsed = values.map(parseDate).filter(Boolean);
      // A date column that never changes is a status flag, not a date.
      return new Set(parsed).size * 100 + parsed.length;
    };

    const siralanmis = candidates
      .map((k) => ({ k, puan: puanla(k) }))
      .filter((c) => c.puan > 0)
      .sort((a, b) => {
        if (b.puan !== a.puan) return b.puan - a.puan;
        const ia = tercih.indexOf(a.k);
        const ib = tercih.indexOf(b.k);
        if (ia !== ib) return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
        return a.k.localeCompare(b.k); // last resort, so the answer never depends on ordering
      });

    fields[field] = siralanmis[0]?.k || '';
  }

  // UYAP has no document-title field — the portal shows the type as the name.
  if (!fields.ad) fields.ad = fields.tur || '';
  return fields;
}

/**
 * Work out where the documents are and what the keys mean, from a real response.
 *
 * "Largest array" is the wrong rule: one document with 222 attachments beats a
 * list of 40 documents. An array reached by walking *through* an element of
 * another array (a numeric path segment) is a child collection by construction,
 * so those are excluded before size is considered.
 */
export function detectShape(json) {
  const all = findArrays(json);
  if (!all.length) return null;

  const isNested = (path) => path.split('.').some((seg) => /^\d+$/.test(seg));
  const topLevel = all.filter((a) => !isNested(a.path));
  const havuz = topLevel.length ? topLevel : all;

  // Compare whole lists, not single arrays. The full list is split into one
  // array per case file (tumEvraklar["2026/1234(…)"], tumEvraklar["2020/999(…)"]),
  // while the portal's "last twenty" list sits beside it as one flat array.
  // Judged array by array, twenty beat a main file of fifteen plus a linked
  // file of five: the listing silently stopped at twenty documents, lost every
  // linked file's label, and warned about "Son 20 Evrak" on files that have
  // no such limit. Arrays reached through the same wildcard path are one list.
  const listeler = new Map();
  for (const a of havuz) {
    const yol = wildcardPath(a.path);
    const l = listeler.get(yol) || { path: yol, length: 0, sample: a.sample };
    l.length += a.length;
    listeler.set(yol, l);
  }

  // On a tie the short list holds everything anyway; prefer the full one, and
  // the grouped one, which keeps each linked file's documents apart.
  const kisaListe = (p) => (/son\s*_?\d+/i.test(p) ? 1 : 0);
  const gruplu = (p) => (p.includes('*') ? 1 : 0);
  const best = [...listeler.values()].sort(
    (a, b) =>
      b.length - a.length ||
      kisaListe(a.path) - kisaListe(b.path) ||
      gruplu(b.path) - gruplu(a.path) ||
      a.path.localeCompare(b.path)
  )[0];

  const { value } = resolvePath(json, best.path);
  const records = Array.isArray(value) ? value : [best.sample];

  return {
    listPath: best.path,
    fields: guessFields(records),
    length: records.length,
    nested: !topLevel.length
  };
}

/**
 * Resolve a wildcard path into named groups instead of one flat list.
 *
 * tumEvraklar holds one entry per related case file — a Ceza Dava Dosyası
 * alongside its CBS Soruşturma dosyaları. Flattening them loses which document
 * belongs to which file, which is exactly the structure the portal shows.
 */
export function resolveGroups(obj, path) {
  if (!path) return [];
  const segs = path.split('.');
  const star = segs.indexOf('*');

  if (star === -1) {
    const v = getByPath(obj, path);
    return Array.isArray(v) && v.length ? [{ key: '', items: v }] : [];
  }

  const head = segs.slice(0, star).join('.');
  const tail = segs.slice(star + 1).join('.');
  const container = head ? getByPath(obj, head) : obj;
  if (!container || typeof container !== 'object') return [];

  const groups = [];
  for (const [key, v] of Object.entries(container)) {
    const items = tail ? getByPath(v, tail) : v;
    if (Array.isArray(items) && items.length) groups.push({ key, items });
  }
  return groups;
}

/** Returns a list of human-readable problems. Empty list means the preset is usable. */
export function validatePreset(p) {
  const problems = [];
  if (!p || typeof p !== 'object') return ['Preset okunamadı.'];

  const liste = p.endpoints?.evrakListesi;
  if (!liste?.path) problems.push('Liste yolu boş — presets dosyasındaki evrakListesi.path eksik.');
  // listPath and the field names are detected from the live response on first
  // listing, so an empty mapping is not a blocker.

  const indir = p.endpoints?.evrakIndir;
  if (!indir?.path) problems.push('İndirme yolu boş — presets dosyasındaki evrakIndir.path eksik.');

  return problems;
}

/** Build a concrete request from a preset endpoint plus variables. */
export function buildRequest(origin, endpoint, vars, authHeaders = {}) {
  const url = new URL(render(stripRedundantQuotes(endpoint.path, vars), vars, 'url'), origin).toString();
  const headers = { ...(endpoint.headers || {}), ...authHeaders };
  let body;

  if (endpoint.bodyTemplate) {
    body = render(endpoint.bodyTemplate, vars, 'json');
    if (!Object.keys(headers).some((h) => h.toLowerCase() === 'content-type')) {
      headers['Content-Type'] = 'application/json';
    }
  }

  return { url, method: (endpoint.method || 'GET').toUpperCase(), headers, body };
}
