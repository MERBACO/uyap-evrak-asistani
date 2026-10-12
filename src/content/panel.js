/**
 * panel.js — the working surface, injected into the portal page.
 *
 * The panel is built around one idea: a case file is a chronology. So the list is
 * a spine — a vertical rail with each document pinned to it in date order, and the
 * sequence number on the rail is the same number that will prefix the file on disk.
 * What you see in the panel is what you get in the folder.
 */

import {
  buildRequest,
  getByPath,
  resolveGroups,
  expandEvraklar,
  sortChronologically,
  validatePreset,
  detectShape,
  guessFields,
  kayitImzasi,
  varyantlariBirlestir
} from '../lib/preset.js';
import { TaskQueue, siraKapisi } from '../lib/queue.js';
import { Nabiz, nabizMetni, sureMetni } from '../lib/nabiz.js';
import { YENILE_MESAJI, eklentiKoptuMu, eklentiBagliMi } from '../lib/baglanti.js';
import { engelMetniMi, ErisimEngeli, engelKalan, engelMesaji, engelBeklemesi, yeniEngel } from '../lib/engel.js';
import { pikselSikistir, gorselSayfasiEkle, fontlariTekle, akislariSikistir } from '../lib/gorsel.js';
import {
  buildPath,
  isoToStamp,
  extensionFrom,
  padWidth,
  normalizeRoot,
  sanitizeSegment,
  basligiSec
} from '../lib/naming.js';
import { ZipYazici } from '../lib/zip.js';
import { udfOku, udfCozumle, zipIcerik } from '../lib/udf.js';
import { htmlParagraflar, htmlMi } from '../lib/html.js';
import { xlsxSayfalar, xlsxDuzen, xlsxMi } from '../lib/xlsx.js';
import {
  docxMi,
  docxParagraflar,
  emlMi,
  emlParagraflar,
  duzMetinParagraflar
} from '../lib/belgeler.js';
import { PdfYazici, fontlariYukle } from '../lib/pdf.js';
import { tarihSaat, gecmiseEkle, gecmisOzeti, islemSatiri } from '../lib/gecmis.js';
import { excelDizini } from '../lib/excel.js';
import { pdfMetni } from '../lib/pdfmetin.js';
import { katla, sorguKelimeleri, alintiBul } from '../lib/arama.js';
import {
  icindekilerSayfaSayisi,
  icindekilerYaz,
  baglantilariEkle,
  yerImleriEkle,
  sayfaNumaralari
} from '../lib/dizin.js';

export function mountPanel(ctx) {
  const el = document.createElement('div');
  el.id = 'ua-panel';
  el.setAttribute('role', 'complementary');
  el.setAttribute('aria-label', 'UYAP Dosyalama ve Evrak Asistanı');
  document.body.appendChild(el);

  const state = {
    evraklar: [],
    secili: new Set(),
    indirilen: new Set(),
    dosya: { birim: '', esasNo: '', id: '' },
    queue: null,
    busy: false,
    iptalEdildi: false,
    listelemeZamani: 0,
    calisanKombinasyon: new Map(),
    // Per source file in this listing: how many documents it refused every way
    // of asking for, and — after two, with none ever given — the refusal itself,
    // so the rest of its documents are not asked for at all.
    kaynakRetleri: new Map(),
    kapaliKaynaklar: new Map(),
    // Documents UYAP refused in this run: a resume does not ask for them again.
    reddedilenler: new Set(),
    // The slowdown a block left behind (see tempoBelirle).
    engelKorumasi: true,
    // UYAP's own words from the last block in this run (see engelYaniti).
    engelMetni: '',
    // The meta line is showing the "wait N minutes" message (see engeliSifirla).
    beklemeMesaji: false,
    yavaslatma: 1,
    // A run that stopped before the end, for this case file: { tur, uids, toplam, ... }.
    yarim: null,
    yarimAnahtari: '',
    // Which case file the byte cache belongs to (see the listing).
    onbellekDosyasi: '',
    // The pace of the run in progress (ISTEK_TEMPOSU, slowed after a block).
    tempo: null,
    elleKonumlandi: false,
    sonIstek: null,
    // Types excluded for this listing. Seeded from the saved list, then edited
    // freely — a permanent rule and a one-off choice should not be the same act.
    kokKlasor: 'UYAP Arsiv',
    zipModu: false,
    elleBoyutlandi: false,
    // Bytes already fetched in this listing. Downloading and then printing the
    // same selection used to fetch everything twice; the second pass is now
    // instant, and the pacing that dominates the wait is paid only once.
    onbellek: new Map(),
    onbellekBayt: 0,
    kapakEkle: true,
    icindekiler: true,
    yazdirmaSirasi: 'eskiden',
    sayfayaSigdir: true,
    kopyaAtla: true,
    // Digest → { ad, sira }: the file that first carried these bytes, and its
    // position in the selection.
    ozetler: new Map(),
    bildirimAcik: true,
    excelDizini: true,
    // uid → the file name it was saved under, across runs: the index links to
    // documents downloaded on an earlier visit too.
    dosyaAdlari: new Map(),
    arama: '',
    baslangic: '',
    bitis: '',
    haricTurler: new Set(),
    dosyaListesi: [],
    haricDosyalar: new Set(),
    kaliciHaric: new Set(),
    turListesi: [],
    ekleriIndir: true,
    // Documents that were not there when this file was last listed.
    yeniler: new Set(),
    sonBakis: 0,
    // Per case file, what counted as "already seen" when this page was opened.
    // Kept for the page's lifetime so listing twice does not wipe the badges.
    tabanlar: new Map(),
    // Per case file, when this visit to it began (first listing on this page).
    ziyaretler: new Map(),
    // uid → { metin, katli, durum }: the words inside each scanned document.
    // Held in this page's memory only — document content is never written to
    // storage, which is what the privacy policy promises.
    icerikler: new Map(),
    gorulenAnahtari: ''
  };

  // The pulse under the status line during a run; see nabizBaslat().
  const nabiz = new Nabiz({ etiket: nabizEtiketi });
  let nabizSayaci = null;
  let sonTik = 0;
  let donma = { sure: 0, zaman: 0 };

  render();
  ayarlariYukle();
  konumla();
  ayarDegisiminiIzle();
  // Declared before the factory returns: everything below this line is hoisted
  // function declarations, and a `let` down there would sit in the temporal dead
  // zone — nefesAl() would throw the first time a merge used it.
  let sonNefes = Date.now(); // paced yielding during the merge; see nefesAl()

  return { el, state };

  /* ------------------------------------------------------------------ views */

  function render() {
    const problems = validatePreset(ctx.preset);
    el.innerHTML = '';
    el.appendChild(header());
    el.appendChild(problems.length ? setupView(problems) : mainView());
  }

  /**
   * Closing hides the panel behind a small handle instead of removing it.
   * Destroying the node left no way back except reloading the page — and a
   * reload also discards the captured requests the listing depends on.
   */
  /**
   * Place the panel and then leave it alone.
   *
   * Until the user takes hold of it, the panel sits where CSS puts it — pinned
   * to the bottom-right by right/bottom. Listing then grows it *upward* from
   * that fixed corner, so the footer and its buttons never move. The panel used
   * to re-anchor itself on every size change, which made it jump toward the top
   * of the screen the moment a listing filled it; it no longer does that.
   *
   * The grip only resizes naturally once the box is anchored by its top-left
   * corner, so the first time the user grabs the grip — or drags the header —
   * the anchoring is converted to left/top *in place*, moving nothing. From
   * then on the panel's size and position are the user's; the extension only
   * clamps it back on screen when its own content, or the window, would push it
   * off.
   *
   * The chosen size is deliberately *not* remembered between page loads: a
   * session's enlarged panel reopening over the portal every time was worse
   * than resizing again when wanted.
   */
  function konumla() {
    // A roomy default so the document list is usable at a glance; the cap is
    // lifted the moment the user resizes by hand.
    if (!state.elleBoyutlandi) el.style.maxHeight = 'min(88vh, 820px)';

    // Freeze the current on-screen position as left/top, so the native resize
    // grip pulls the corner the natural way. Converting in place moves nothing.
    const sabitle = () => {
      const r = el.getBoundingClientRect();
      el.style.left = `${r.left}px`;
      el.style.top = `${r.top}px`;
      el.style.right = 'auto';
      el.style.bottom = 'auto';
    };

    // The user taking the panel's size or position into their own hands: hand it
    // over once, then never reposition it on our own again.
    const devral = () => {
      if (state.elleKonumlandi) return;
      state.elleKonumlandi = true;
      state.elleBoyutlandi = true;
      el.style.maxHeight = '95vh';
      sabitle();
    };
    el._uaDevral = devral; // the header drag (makeDraggable) hands over too

    // Grabbing the resize grip — the bottom-right corner, where the event lands
    // on the panel itself rather than on a button — is a resize starting. Catch
    // it before the browser resizes so the very first drag is not backwards.
    el.addEventListener('pointerdown', (e) => {
      if (state.elleKonumlandi || e.target !== el) return;
      const r = el.getBoundingClientRect();
      if (e.clientX >= r.right - 22 && e.clientY >= r.bottom - 22) devral();
    });

    // The width only ever changes when the user drags the grip — content never
    // alters it — so a width change is the safety net that catches a resize the
    // pointer check missed. A height change alone is the list growing: while the
    // panel is still pinned bottom-right it grows upward on its own and needs
    // nothing; once it is the user's, keep it on screen as it grows.
    let sonGenislik = el.getBoundingClientRect().width;
    new ResizeObserver(() => {
      const g = el.getBoundingClientRect().width;
      if (Math.abs(g - sonGenislik) > 1) {
        sonGenislik = g;
        devral();
      }
      if (state.elleKonumlandi) konumuSinirla(el);
    }).observe(el);

    // A window that shrinks can strand a user-placed panel; pull it back in.
    window.addEventListener('resize', () => {
      if (state.elleKonumlandi) konumuSinirla(el);
    });
  }

  function gizle() {
    el.classList.add('is-collapsed');
    let tutamac = document.getElementById('ua-handle');
    if (!tutamac) {
      tutamac = document.createElement('button');
      tutamac.id = 'ua-handle';
      tutamac.type = 'button';
      tutamac.textContent = 'UYAP Dosyalama ve Evrak Asistanı';
      tutamac.title = 'Paneli geri aç';
      tutamac.onclick = goster;
      document.body.appendChild(tutamac);
    }
    tutamac.hidden = false;
  }

  function goster() {
    el.classList.remove('is-collapsed');
    const tutamac = document.getElementById('ua-handle');
    if (tutamac) tutamac.hidden = true;
  }

  function header() {
    const h = node('header', 'ua-head');
    h.innerHTML = `
      <div class="ua-eyebrow">UYAP DOSYALAMA VE EVRAK ASİSTANI</div>
      <div class="ua-title">Kronolojik evrak indirici</div>
      <button class="ua-close" title="Paneli kapat" aria-label="Paneli kapat">×</button>`;
    h.querySelector('.ua-close').onclick = gizle;
    makeDraggable(el, h);
    return h;
  }

  function setupView(problems) {
    const v = node('div', 'ua-body');
    v.innerHTML = `
      <p class="ua-lead">Bu portal için uç haritası okunamadı. Eklenti bu haliyle
      çalışamaz; büyük ihtimalle UYAP adreslerini değiştirmiştir.</p>
      <ol class="ua-steps">
        <li>Eklentiyi en son sürümüyle değiştirip <b>Ctrl + F5</b> ile sayfayı yenileyin.</li>
        <li>Sorun sürerse depodaki <b>presets/avukatbeta.json</b> dosyasının güncellenmesi
            gerekir; yöntem <b>docs/ENDPOINT-DISCOVERY.md</b> içinde anlatılıyor.</li>
      </ol>
      <ul class="ua-problems">${problems.map((p) => `<li>${escapeHtml(p)}</li>`).join('')}</ul>`;
    return v;
  }

  function mainView() {
    const v = node('div', 'ua-body');

    const bar = node('div', 'ua-bar');
    bar.innerHTML = `
      <button class="ua-btn ua-btn-primary" data-act="list">Evrakları Listele</button>
      <button class="ua-btn ua-btn-link" data-act="ayar-ac">Ayarlar</button>`;
    v.appendChild(bar);

    const ayar = node('div', 'ua-ayar');
    ayar.innerHTML = `
      <div class="ua-ayar-govde" data-role="ayar-govde" hidden>
        <label class="ua-ayar-satir">
          <span>Kayıt Klasörü</span>
          <input type="text" data-act="kok" spellcheck="false" placeholder="UYAP Arsiv">
        </label>
        <p class="ua-ayar-not" data-role="kok-not"></p>
        <label class="ua-check">
          <input type="checkbox" data-act="bildirim"> İndirilemeyen evrak olursa bildirim gönder
        </label>
        <label class="ua-check">
          <input type="checkbox" data-act="kopya"> Aynı içerikli evrağı bir kez indir
        </label>
        <label class="ua-check">
          <input type="checkbox" data-act="kapak"> Yazdırırken kapak sayfası ekle
        </label>
        <label class="ua-check">
          <input type="checkbox" data-act="icindekiler"> Yazdırırken içindekiler, yer imleri ve sayfa numarası ekle
        </label>
        <label class="ua-check">
          <input type="checkbox" data-act="sigdir"> Son sayfada birkaç satır kalıyorsa sığdır
        </label>
        <label class="ua-ayar-satir" style="margin-top:6px">
          <span>Yazdırma sırası</span>
          <select data-act="sira">
            <option value="eskiden">En eskiden en yeniye</option>
            <option value="yeniden">En yeniden en eskiye (fiziki dosya)</option>
          </select>
        </label>
        <p class="ua-ayar-not" data-role="sira-not"></p>
        <label class="ua-check">
          <input type="checkbox" data-act="zip"> Tek zip dosyası olarak indir
        </label>
        <p class="ua-ayar-not">Zip seçildiğinde tarayıcı tek indirme görür, klasör
        yapısı zipin içinde korunur. Çok sayıda evrakta bellek kullanımı yükselir.</p>
        <label class="ua-check">
          <input type="checkbox" data-act="excel"> İndirirken klasöre Excel dizini ekle
        </label>
        <p class="ua-ayar-not">Klasörün başına "000_Evrak Dizini.xlsx" konur: dosyanın
        bütün evrakları, tarihleri, türleri ve durumlarıyla. Dosya adına tıklayınca
        evrak açılır. Her indirmede güncellenir.</p>
        <label class="ua-check">
          <input type="checkbox" data-act="engel-koruma"> UYAP "erişiminiz durduruldu" yanıtı verince bir süre bekle
        </label>
        <p class="ua-ayar-not">UYAP bir isteğe "erişiminiz geçici olarak durduruldu"
        sayfasıyla karşılık verirse eklenti durup bir süre bekler, böylece aynı yanıtın
        üstüne gitmez. Kapatırsanız eklenti kendiliğinden durmaz ve beklemez; UYAP bir
        evrağı vermezse yalnızca o evrak, sunucunun kendi yanıtıyla işaretlenir, işlem
        sürer. Bu seçenek kapatıldığında bekleyen varsa hemen kaldırılır.</p>
      </div>`;
    ayar.querySelector('[data-act="excel"]').onchange = async (e) => {
      state.excelDizini = e.target.checked;
      await chrome.storage.local.set({ excelDizini: state.excelDizini });
    };
    ayar.querySelector('[data-act="engel-koruma"]').onchange = async (e) => {
      state.engelKorumasi = e.target.checked;
      await chrome.storage.local.set({ engelKorumasi: state.engelKorumasi });
      // Turning it off never leaves the user waiting on a past block.
      if (!state.engelKorumasi) await engeliSifirla();
      updateFoot();
    };
    ayar.querySelector('[data-act="kok"]').onchange = async (e) => {
      state.kokKlasor = normalizeRoot(e.target.value);
      e.target.value = state.kokKlasor;
      await chrome.storage.local.set({ kokKlasor: state.kokKlasor });
      kokNotuYaz();
    };
    ayar.querySelector('[data-act="sigdir"]').onchange = async (e) => {
      state.sayfayaSigdir = e.target.checked;
      await chrome.storage.local.set({ sayfayaSigdir: state.sayfayaSigdir });
    };
    ayar.querySelector('[data-act="sira"]').onchange = async (e) => {
      state.yazdirmaSirasi = e.target.value;
      await chrome.storage.local.set({ yazdirmaSirasi: state.yazdirmaSirasi });
      siraNotuYaz();
    };
    ayar.querySelector('[data-act="kapak"]').onchange = async (e) => {
      state.kapakEkle = e.target.checked;
      await chrome.storage.local.set({ kapakEkle: state.kapakEkle });
    };
    ayar.querySelector('[data-act="icindekiler"]').onchange = async (e) => {
      state.icindekiler = e.target.checked;
      await chrome.storage.local.set({ icindekiler: state.icindekiler });
    };
    ayar.querySelector('[data-act="kopya"]').onchange = async (e) => {
      state.kopyaAtla = e.target.checked;
      await chrome.storage.local.set({ kopyaAtla: state.kopyaAtla });
    };
    ayar.querySelector('[data-act="zip"]').onchange = async (e) => {
      state.zipModu = e.target.checked;
      await chrome.storage.local.set({ zipModu: state.zipModu });
      updateFoot();
    };
    ayar.querySelector('[data-act="bildirim"]').onchange = async (e) => {
      state.bildirimAcik = e.target.checked;
      await chrome.storage.local.set({ bildirimAcik: state.bildirimAcik });
    };
    v.appendChild(ayar);

    const suzgec = node('div', 'ua-suzgec');
    suzgec.hidden = true;
    suzgec.dataset.role = 'suzgec';
    suzgec.innerHTML = `
      <input type="search" class="ua-ara" data-act="ara" placeholder="Evrak adı, taraf, tür ara…" spellcheck="false">
      <div class="ua-tarih-araligi">
        <label>Başlangıç <input type="date" data-act="tarih-bas"></label>
        <label>Bitiş <input type="date" data-act="tarih-son"></label>
        <button class="ua-btn ua-btn-link" data-act="suzgec-sifirla">Sıfırla</button>
      </div>
      <div class="ua-icerik">
        <button class="ua-btn ua-btn-link" data-act="icerik-tara"
                title="Evrakları portaldan alıp içlerindeki metni okur; arama kutusu sonra evrakların içinde de arar. İndirdiğiniz ya da yazdırdığınız evraklar yeniden alınmaz.">İçerikleri Tara</button>
        <span class="ua-icerik-durum" data-role="icerik-durum"></span>
      </div>`;

    const gecikmeli = (fn) => {
      let z = null;
      return (...a) => {
        clearTimeout(z);
        z = setTimeout(() => fn(...a), 200);
      };
    };
    const uygula = gecikmeli(() => filtreyiUygula());

    suzgec.querySelector('[data-act="ara"]').oninput = (e) => {
      state.arama = e.target.value.trim();
      uygula();
    };
    suzgec.querySelector('[data-act="tarih-bas"]').onchange = (e) => {
      state.baslangic = e.target.value;
      filtreyiUygula();
    };
    suzgec.querySelector('[data-act="tarih-son"]').onchange = (e) => {
      state.bitis = e.target.value;
      filtreyiUygula();
    };
    v.appendChild(suzgec);

    const turler = node('div', 'ua-tur');
    turler.dataset.role = 'turler';
    turler.hidden = true;
    turler.innerHTML = `
      <div class="ua-tur-bas">
        <button class="ua-btn ua-btn-link" data-act="tur-ac">Türler</button>
        <label class="ua-check"><input type="checkbox" data-act="ekler" checked> Ekleri İndir</label>
      </div>
      <ul class="ua-tur-liste" data-role="tur-liste" hidden></ul>`;
    v.appendChild(turler);

    // A case file pulls in linked soruşturma and talimat files, and a lawyer
    // often wants one of them on its own — or everything except one. Filtering
    // by type cannot express that; the source file is its own dimension.
    const dosyalar = node('div', 'ua-tur');
    dosyalar.dataset.role = 'dosyalar';
    dosyalar.hidden = true;
    dosyalar.innerHTML = `
      <div class="ua-tur-bas">
        <button class="ua-btn ua-btn-link" data-act="dosya-ac">Dosyalar</button>
      </div>
      <ul class="ua-tur-liste" data-role="dosya-liste" hidden></ul>`;
    v.appendChild(dosyalar);

    // When this case file was listed before, and what it held then. Known only
    // after a listing: until then the panel cannot tell which file is open.
    const gecmis = node('div', 'ua-tur ua-gecmis');
    gecmis.dataset.role = 'gecmis';
    gecmis.hidden = true;
    gecmis.innerHTML = `
      <div class="ua-tur-bas">
        <button class="ua-btn ua-btn-link" data-act="gecmis-ac">İşlem Geçmişi</button>
      </div>
      <p class="ua-gecmis-ozet" data-role="gecmis-ozet"></p>
      <ul class="ua-tur-liste" data-role="gecmis-liste" hidden></ul>`;
    v.appendChild(gecmis);

    const meta = node('div', 'ua-meta');
    meta.dataset.role = 'meta';
    meta.textContent = '';
    setTimeout(tanıYaz, 0);
    v.appendChild(meta);

    const list = node('ol', 'ua-list');
    list.dataset.role = 'list';
    v.appendChild(list);

    const foot = node('div', 'ua-foot');
    foot.dataset.role = 'foot';
    foot.hidden = true;
    foot.innerHTML = `
      <div class="ua-progress"><div class="ua-progress-fill" data-role="fill"></div></div>
      <div class="ua-status" data-role="status"></div>
      <div class="ua-nabiz" data-role="nabiz" hidden>
        <span class="ua-nabiz-nokta" aria-hidden="true"></span><span data-role="nabiz-metin"></span>
      </div>
      <div class="ua-select">
        <button class="ua-btn ua-btn-link" data-act="sel-all">Tümünü Seç</button>
        <button class="ua-btn ua-btn-link" data-act="sel-none">Seçimi Temizle</button>
        <button class="ua-btn ua-btn-link" data-act="sel-new">Sadece İndirilmemişler</button>
        <button class="ua-btn ua-btn-link" data-act="sel-yeni" hidden>Sadece Yeniler</button>
      </div>
      <div class="ua-yarim" data-role="yarim" hidden>
        <p class="ua-yarim-metin" data-role="yarim-metin"></p>
        <p class="ua-yarim-bekleme" data-role="yarim-bekleme" hidden></p>
        <div class="ua-bar">
          <button class="ua-btn ua-btn-primary" data-act="devam">Kaldığı Yerden Devam Et</button>
          <button class="ua-btn ua-btn-link" data-act="yarim-kapat">Vazgeç</button>
        </div>
      </div>
      <div class="ua-hiz">
        <span class="ua-hiz-aciklama" data-role="hiz-aciklama"></span>
      </div>
      <div class="ua-actions">
        <button class="ua-btn ua-btn-primary" data-act="download">Seçilenleri İndir</button>
        <button class="ua-btn" data-act="print" title="Seçili evrakları kronolojik sırayla tek belgede birleştirir; yazdırabilir veya PDF olarak kaydedebilirsiniz">Yazdır / PDF İndir</button>
        <button class="ua-btn" data-act="pause" hidden>Duraklat</button>
        <button class="ua-btn ua-btn-quiet" data-act="stop" hidden>İptal Et</button>
        <button class="ua-btn ua-btn-quiet" data-act="engel-kaldir" hidden>Beklemeyi Kaldır</button>
      </div>`;
    v.appendChild(foot);

    v.addEventListener('click', onClick);
    return v;
  }

  /* ---------------------------------------------------------------- actions */

  async function onClick(e) {
    const act = e.target?.dataset?.act;
    if (!act) return;
    // The extension was reloaded under this tab: every action would fail in its
    // own confusing way, so say the one thing that fixes it instead.
    if (!eklentiBagliMi()) return setMeta(YENILE_MESAJI, true);
    try {
      if (act === 'list') return await listeleyi(e.target);
      if (act === 'suzgec-sifirla') {
        state.arama = '';
        state.baslangic = '';
        state.bitis = '';
        el.querySelector('[data-act="ara"]').value = '';
        el.querySelector('[data-act="tarih-bas"]').value = '';
        el.querySelector('[data-act="tarih-son"]').value = '';
        return filtreyiUygula();
      }
      // A section that opens into a plain white area gives no sign that anything
      // happened. The button holds the state as well: pressed while open, with a
      // caret that turns.
      if (act === 'ayar-ac' || act === 'tur-ac' || act === 'dosya-ac' || act === 'gecmis-ac') {
        const rol = {
          'ayar-ac': 'ayar-govde',
          'tur-ac': 'tur-liste',
          'dosya-ac': 'dosya-liste',
          'gecmis-ac': 'gecmis-liste'
        }[act];
        const govde = el.querySelector(`[data-role="${rol}"]`);
        govde.hidden = !govde.hidden;
        e.target.classList.toggle('is-acik', !govde.hidden);
        e.target.setAttribute('aria-expanded', String(!govde.hidden));
        govde.classList.toggle('is-acik', !govde.hidden);
        return;
      }
      if (act === 'tur-varsayilan') {
        // Back to the standing rule: everything selected except the types marked
        // "her dosyada ele". Ticking those back one by one was the only way out
        // of a cleared list, which made the master checkbox risky to use.
        state.haricTurler = new Set(
          state.turListesi.filter((t) => state.kaliciHaric.has(t.tur)).map((t) => t.tur)
        );
        return filtreyiUygula();
      }
      if (act === 'tur-kalici') return await kaliciDegistir(Number(e.target.dataset.i));
      if (act === 'ekler') {
        state.ekleriIndir = e.target.checked;
        return filtreyiUygula();
      }
      if (act === 'sel-all') return secimUygula(() => true);
      if (act === 'sel-none') return secimUygula(() => false);
      if (act === 'sel-new') return secimUygula((ev) => !state.indirilen.has(ev.uid));
      if (act === 'sel-yeni') return secimUygula((ev) => state.yeniler.has(ev.uid));
      if (act === 'icerik-tara') return await icerikTara();
      if (act === 'download') return await indir();
      if (act === 'engel-kaldir') {
        if (state.busy) return;
        await engeliSifirla();
        return setMeta('Bekleme kaldırıldı. Şimdi yeniden İndir ya da Yazdır diyebilirsiniz.', false);
      }
      if (act === 'devam') return await devamEt();
      if (act === 'yarim-kapat') return await yarimKaydet(null);
      if (act === 'print') return await yazdir();
      if (act === 'pause') return togglePause(e.target);
      if (act === 'stop') {
        state.iptalEdildi = true;
        state.queue?.abort();
        return setStatus('İptal ediliyor, süren istekler bitince duracak…');
      }
    } catch (err) {
      console.error('[UYAP Arşiv]', err);
      setMeta(mesaj(err), true);
    }
  }

  /**
   * The heading of the open case file — "2026/321 Örnekşehir 22. Asliye Ceza
   * Mahkemesi - Talimat Dosyası".
   *
   * The API never sends it: responses key documents by "2026/321(Talimat
   * Dosyası)" with no court name. So read the heading the portal itself
   * displays, and fall back to the API's own key if the markup changes.
   *
   * Every heading-shaped text on the page is a candidate, and the one chosen
   * must carry the listed file's own number (see basligiSec). Taking the first
   * match named the folder after whatever case number appeared first — a row
   * of the file list behind the overlay, say — and the documents of one file
   * were saved under another's name.
   */
  function dosyaBasliginiBul(anaAnahtar) {
    const desen = /^\s*\d{4}\/\d+\s+\S.{5,110}$/;
    const adaylar = [];
    for (const el2 of document.querySelectorAll('h1, h2, h3, h4, div, span, p')) {
      if (el2.childElementCount) continue; // leaf nodes only: skip wrappers
      const metin = (el2.textContent || '').replace(/\s+/g, ' ').trim();
      if (metin.length > 120 || !desen.test(metin)) continue;
      if (el2.closest('#ua-panel')) continue; // our own UI
      adaylar.push(metin);
    }
    return basligiSec(adaylar, anaAnahtar);
  }

  function currentDosyaId() {
    // Preferred: the id the portal itself just sent. The overlay never puts it
    // in the address bar, so the URL pattern is only a fallback for older portals.
    const live = ctx.getDosyaId?.();
    if (live) return live;

    const rx = ctx.preset.dosya?.idFromUrl;
    if (!rx) return null;
    const m = location.href.match(new RegExp(rx));
    return m ? m[1] || m[0] : null;
  }

  /**
   * Prefer the request the portal itself just made for this case file: same URL,
   * same body, same encoding. Templating is only a fallback for portals where
   * nothing was observed.
   */
  async function listRequests(ep, dosyaId) {
    const pathname = new URL(ep.path, location.origin).pathname;
    const live = ((await ctx.getRequests?.(pathname)) || []).filter((r) => r.body);

    // Requests accumulate as you move between case files. Replaying all of them
    // would fold the previous file's documents into the current listing, so keep
    // only those belonging to the file whose list was requested most recently.
    const guncel = dosyaOneki(govdedekiDosyaId(live[0]?.body));

    // The open file's own id, taken from the request the portal itself issued.
    // It was read in four places and never written, so two of the four id
    // combinations were filtered out before anything was tried — including the
    // one a linked file's documents need. Those documents were then refused with
    // "vekil kaydınız bulunmamaktadır" and looked like an authorisation limit.
    const acikId = govdedekiDosyaId(live[0]?.body) || currentDosyaId() || '';
    if (acikId) state.acikDosyaId = acikId;
    const ayniDosya = guncel
      ? live.filter((r) => dosyaOneki(govdedekiDosyaId(r.body)) === guncel)
      : live.slice(0, 1);

    const out = ayniDosya.map((r) => ({
      url: r.url,
      method: r.method || 'POST',
      headers: r.contentType ? { 'Content-Type': r.contentType } : {},
      body: r.body
    }));

    if (!out.length) out.push(buildRequest(location.origin, ep, { dosyaId }));
    return out;
  }

  async function listeleyi(btn) {
    const dosyaId = currentDosyaId();
    const pathname = new URL(ctx.preset.endpoints.evrakListesi.path, location.origin).pathname;
    if (!dosyaId && !((await ctx.getRequests?.(pathname)) || []).length) {
      return setMeta('Portalda henüz bir dosyanın Evrak sekmesine girilmedi — tekrarlanacak bir istek yok.', true);
    }

    btn.disabled = true;
    setMeta('Evrak listesi alınıyor…');

    try {
      const ep = ctx.preset.endpoints.evrakListesi;
      const adaylar = await listRequests(ep, dosyaId);

      // Starting a fresh listing: drop anything left from the previous case file.
      state.evraklar = [];
      state.secili = new Set();
      el.querySelector('[data-role="list"]').innerHTML = '';

      // The portal sends a narrower request for "Son 20 Evrak" than for "Tüm
      // Evrak". Trying each and keeping the fullest makes the result depend on
      // the case file rather than on which tree node happened to be clicked.
      // Each variant keeps its own responses: page one now, further pages below.
      // Merging needs to know which responses came from the same request.
      const varyantlar = [];
      for (const req of adaylar) {
        state.sonIstek = req;
        try {
          varyantlar.push({ istek: req, yanitlar: [await ctx.portalFetch(req)] });
        } catch (err) {
          // A block answers every variant the same way: asking the others is only
          // more requests into it, and swallowing it hid the block behind "none
          // of the requests answered".
          if (err?.status === 401 || err?.status === 403 || engelMetniMi(err?.govde)) throw err;
          continue; // a narrower variant may have expired; the others still count
        }
        setMeta(`İstekler deneniyor… (${varyantlar.length}/${adaylar.length})`);
      }
      if (!varyantlar.length) throw new Error('Liste isteklerinin hiçbiri yanıt vermedi.');
      const yanitlar = varyantlar.map((v) => v.yanitlar[0]);

      // Detect on every run unless the mapping was locked by hand. A stale
      // mapping is worse than none: it fails quietly, with plausible output.
      let shape = null;
      if (!ctx.preset.fieldsLocked) {
        shape = yanitlar.map(detectShape).filter(Boolean).sort((a, b) => b.length - a.length)[0];
        if (!shape) throw new Error('Yanıtta evrak dizisi bulunamadı.');
        ep.listPath = shape.listPath;
        ep.fields = { ...ep.fields, ...shape.fields };
        await ctx.savePreset(ctx.preset);
      }

      // The list request carries a pageNumber. Replaying it verbatim always asks
      // for page one, which is fine until a case file exceeds the page size and
      // the rest goes missing without a word. There is no total-count field to
      // trust, so ask for the next page until one comes back empty or repeats a
      // page already seen — the latter is a server ignoring pageNumber entirely.
      const sayfaIzi = (yanit) =>
        resolveGroups(yanit, ep.listPath)
          .flatMap((g) => g.items.map((item) => `${g.key}#${kayitImzasi(item, ep.fields)}`))
          .join('\n');

      for (const varyant of varyantlar) {
        let govde;
        try {
          govde = JSON.parse(varyant.istek.body || '');
        } catch {
          continue; // not a JSON body — some other request on the same path
        }
        if (typeof govde?.pageNumber !== 'number') continue;

        const gorulenSayfalar = new Set([sayfaIzi(varyant.yanitlar[0])]);
        for (let sayfa = govde.pageNumber + 1; sayfa <= govde.pageNumber + 50; sayfa++) {
          setMeta(`Sayfa ${sayfa} alınıyor…`);
          let yanit;
          try {
            yanit = await ctx.portalFetch({
              ...varyant.istek,
              body: JSON.stringify({ ...govde, pageNumber: sayfa })
            });
          } catch (err) {
            // A block here used to end the paging quietly, leaving a short list
            // that looked complete.
            if (err?.status === 401 || err?.status === 403 || engelMetniMi(err?.govde)) throw err;
            break;
          }
          const iz = sayfaIzi(yanit);
          if (!iz || gorulenSayfalar.has(iz)) break;
          gorulenSayfalar.add(iz);
          varyant.yanitlar.push(yanit);
        }
      }

      // Merge every variant instead of picking one. "Son 20 Evrak" is a subset of
      // "Tüm Evrak", so the merge cannot be narrower than any single response —
      // which is what made the count wander before. Two documents that merely
      // share a signature stay two; see varyantlariBirlestir().
      const gruplarHam = varyantlariBirlestir(
        varyantlar.map((v) => v.yanitlar),
        ep.listPath,
        ep.fields
      );
      if (!gruplarHam.length) throw new Error(`listPath "${ep.listPath}" hiç evrak dizisi döndürmedi.`);

      // Re-derive the field mapping from the merged, ordered list. Deriving it
      // from a single response made the choice depend on which variant answered
      // first — and the date column decides every filename's number.
      const gruplar = gruplarHam;
      if (!ctx.preset.fieldsLocked) {
        ep.fields = { ...ep.fields, ...guessFields(gruplar.flatMap((g) => g.items)) };
        await ctx.savePreset(ctx.preset);
      }

      // Mirror the portal's own tree: related case file → document type → documents.
      // Attachments stay in their parent's folder.
      const anaAnahtar = gruplar.reduce((a, b) => (b.items.length > a.items.length ? b : a)).key;

      const hepsi = [];
      for (const grup of gruplar) {
        // Documents from a linked file are marked by name; everything from the
        // open file needs no marking, which keeps the common case short.
        const kaynak = grup.key === anaAnahtar ? '' : grup.key;
        for (const ev of expandEvraklar(grup.items, ep.fields)) {
          ev.klasor = []; // a single flat folder per case file
          ev.kaynak = kaynak;

          // Identity for the UI and for the download history. The portal's own id
          // repeats across related case files and is often absent on attachments,
          // so it cannot serve as a key. This one is stable between runs because
          // groups and items are sorted deterministically above.
          ev.uid = `${grup.key}#${ev.imza}`;

          // A document with no id cannot be requested at all. Say so instead of
          // sending an empty parameter and saving whatever comes back.
          // Two separate reasons a document cannot be fetched, kept apart so the
          // summary can say which: no id at all, or no vekil registration.
          ev.indirilebilir = Boolean(ev.id) && ev.yetkili !== false;
          hepsi.push(ev);
        }
      }

      // Two documents can share a signature — the same type, on the same day,
      // with no evrak number. They are still two documents, and everything keyed
      // by uid (selection, the byte cache, the history, the duplicate verdicts)
      // would otherwise treat them as one: the cache could even hand the second
      // one the first one's bytes. Number the repeats; the order above is
      // deterministic, so the suffix is stable between runs.
      const uidSayaci = new Map();
      let ayniImzali = 0;
      for (const ev of hepsi) {
        const n = (uidSayaci.get(ev.uid) || 0) + 1;
        uidSayaci.set(ev.uid, n);
        if (n > 1) {
          ev.uid = `${ev.uid}~${n}`;
          ayniImzali++;
        }
      }

      const anaGrup = gruplar.reduce((a, b) => (b.items.length > a.items.length ? b : a));
      const baslik = dosyaBasliginiBul(anaGrup.key) || anaGrup.key;
      state.dosya = { id: dosyaId, birim: '', esasNo: baslik, kok: baslik };
      state.gruplar = gruplar;
      // Another case file: nothing from the previous one may be reused. The same
      // file listed again keeps what is in memory — uids carry the file's key and
      // a document's bytes do not change — so a print stopped by a block and
      // listed again after the pause asks only for what it had not got.
      if (state.onbellekDosyasi !== anaGrup.key) {
        state.onbellek = new Map();
        state.onbellekBayt = 0;
        state.onbellekDosyasi = anaGrup.key;
      }

      // Ids are re-encrypted on every listing; if they expire, failures will
      // cluster at the far end of a long run and this is how we would see it.
      state.listelemeZamani = Date.now();
      state.kaynakRetleri = new Map();
      state.kapaliKaynaklar = new Map();
      state.evraklar = sortChronologically(hepsi);

      const kayitli = (await chrome.storage.local.get('turFiltresi')).turFiltresi || [];
      state.kaliciHaric = new Set(kayitli);
      // A permanent exclusion applies to every file; a one-off one does not
      // survive the listing, so start each file from the saved rules alone.
      state.haricTurler = new Set(kayitli);
      turleriHesapla();
      state.secili = new Set(state.evraklar.filter(filtreliMi).map((x) => x.uid));

      // Keyed by the case file itself: the sniffed id may be missing, and
      // "gecmis:null" would pile every file's history into one bucket.
      state.gecmisAnahtari = `gecmis:${anaGrup.key}`;
      const seen = await chrome.storage.local.get(state.gecmisAnahtari);
      state.indirilen = new Set(seen[state.gecmisAnahtari] || []);
      state.adlarAnahtari = `adlar:${anaGrup.key}`;
      try {
        const adlar = (await chrome.storage.local.get(state.adlarAnahtari))[state.adlarAnahtari];
        state.dosyaAdlari = new Map(Object.entries(adlar || {}));
      } catch {
        state.dosyaAdlari = new Map(); // the index then links this run's files only
      }
      state.yarimAnahtari = `yarim:${anaGrup.key}`;
      try {
        const kayit = (await chrome.storage.local.get(state.yarimAnahtari))[state.yarimAnahtari];
        const mevcut = new Set(state.evraklar.map((x) => x.uid));
        const uids = (kayit?.uids || []).filter((u) => mevcut.has(u));
        state.yarim = uids.length ? { ...kayit, uids } : null;
      } catch {
        state.yarim = null;
      }
      yarimCiz();
      const { ilkKez, gecmis } = await dosyaKaydiniIsle(`gorulen:${anaGrup.key}`);
      renderGecmis(gecmis);

      el.querySelector('[data-role="suzgec"]').hidden = false;
      state.haricDosyalar = new Set();
      dosyalariHesapla();
      renderDosyalar();
      renderTurler();
      renderList();
      const ekSayisi = state.evraklar.filter((x) => x.ekMi).length;
      const anaSayisi = state.evraklar.length - ekSayisi;
      const yetkisiz = state.evraklar.filter((x) => x.yetkili === false).length;
      const kimliksiz = state.evraklar.filter((x) => !x.indirilebilir && x.yetkili !== false).length;

      // Counts only — with one exception. A listing built from the portal's
      // "last N" list must announce itself: archiving twenty documents while
      // believing you archived the case file is precisely the failure this tool
      // exists to prevent. The portal's answer carries the full list alongside
      // it, and detectShape() prefers that one, so this fires only when the full
      // list is genuinely missing from the response — never as routine advice.
      // It used to fire on small files with linked ones, because the short list
      // was being picked by mistake; there was nothing for the user to click.
      const kismi = /son\s*_?\d+/i.test(ep.listPath || '') && anaSayisi >= 20;

      const yeniSayisi = state.yeniler.size;
      setMeta(
        `${state.evraklar.length} evrak — ${anaSayisi} ana, ${ekSayisi} ek.` +
          (yeniSayisi
            ? `\n${yeniSayisi} yeni evrak var (son bakışınız: ${tarihSaat(state.sonBakis)}).`
            : ilkKez
              ? '\nBu dosyada daha önce listeleme yapılmadı; bundan sonra gelen evraklar "yeni" diye işaretlenecek.'
              : '') +
          (kismi
            ? '\nDikkat: portalın yanıtında dosyanın tam evrak listesi bulunamadı, yalnızca son evraklar listesi alındı. ' +
              'Evrak sayısını portaldakiyle karşılaştırın; eksikse sayfayı yenileyip yeniden listeleyin.'
            : '') +
          (yetkisiz
            ? `\n${yetkisiz} evrak için bu dosyada vekil kaydınız yok; portal da vermiyor, seçilmediler.`
            : '') +
          (kimliksiz ? `\n${kimliksiz} evrakın kimliği yok, indirilemez.` : '') +
          (ayniImzali
            ? `\n${ayniImzali} evrak, başka bir evrakla aynı tarih, tür ve numarayı taşıyor; ayrı evrak olarak listelendi.`
            : ''),
        kismi
      );
    } catch (err) {
      console.error('[UYAP Arşiv] liste hatası', err, state.sonIstek);
      if (engelMetniMi(err?.govde)) {
        if (!state.engelKorumasi) {
          return setMeta('UYAP evrak listesi isteğine "erişiminiz durduruldu" yanıtı verdi.' + engelYaniti(err.govde), true);
        }
        state.alinanBuIs = 0; // a listing fetches no documents
        const { kalan, sayi, ilerledi } = await engelKaydet();
        return setMeta(engelMesaji(kalan, sayi, ilerledi) + engelYaniti(err.govde), true);
      }
      const eskiSurum = eklentiKoptuMu(err);
      setMeta(
        eskiSurum
          ? mesaj(err)
          : `${mesaj(err)}\n\nİstek: ${state.sonIstek?.method || ''} ${state.sonIstek?.url || ''}` +
              (state.sonIstek?.body ? `\nGövde: ${String(state.sonIstek.body).slice(0, 200)}` : ''),
        true
      );
    } finally {
      btn.disabled = false;
    }
  }

  /**
   * Which documents arrived since this case file was last listed.
   *
   * The record of what has been seen only ever grows: a listing that came back
   * short — "Son 20 Evrak" — must not make the next full listing look new from
   * end to end. The baseline is read once per page, so listing again a minute
   * later keeps the badges instead of clearing them.
   *
   * A file listed for the first time has nothing new: everything would be, and
   * a badge on every row says nothing.
   *
   * The same record keeps the file's history — listings, downloads and
   * printouts — so the panel can say when this file was last looked at, or
   * that it never was (see gecmis.js).
   *
   * @returns {Promise<{ilkKez: boolean, gecmis: Object[]}>}  history, newest first,
   *          this listing included
   */
  async function dosyaKaydiniIsle(anahtar) {
    let kayit = null;
    try {
      kayit = (await chrome.storage.local.get(anahtar))[anahtar] || null;
    } catch (err) {
      console.warn('[UYAP Arşiv] görülen evrak kaydı okunamadı', err);
    }

    state.gorulenAnahtari = anahtar;
    if (!state.tabanlar.has(anahtar)) {
      state.tabanlar.set(anahtar, kayit ? { uidler: new Set(kayit.uidler), zaman: kayit.zaman } : null);
      // Everything recorded from now until the page is closed is "this visit".
      state.ziyaretler.set(anahtar, Date.now());
    }
    const taban = state.tabanlar.get(anahtar);
    state.yeniler = new Set(taban ? state.evraklar.filter((e) => !taban.uidler.has(e.uid)).map((e) => e.uid) : []);
    state.sonBakis = taban?.zaman || 0;

    // Records written before the history existed carry only the last time.
    const eski = kayit?.gecmis || (kayit?.zaman ? [{ tur: 'listeleme', zaman: kayit.zaman, toplam: null, yeni: null }] : []);
    const simdi = { tur: 'listeleme', zaman: Date.now(), toplam: state.evraklar.length, yeni: state.yeniler.size };
    const gecmis = gecmiseEkle(eski, simdi, state.ziyaretler.get(anahtar), GECMIS_SINIRI);

    try {
      const uidler = new Set([...(kayit?.uidler || []), ...state.evraklar.map((e) => e.uid)]);
      await chrome.storage.local.set({ [anahtar]: { uidler: [...uidler], zaman: simdi.zaman, gecmis } });
    } catch (err) {
      // Only the next visit's badges and history depend on this; the listing is fine.
      console.warn('[UYAP Arşiv] görülen evrak kaydı yazılamadı', err);
    }
    return { ilkKez: !taban, gecmis };
  }

  /**
   * Record a download or a printout in the open file's history.
   * A history that cannot be written must never fail the operation it records.
   */
  async function islemKaydet(giris) {
    const anahtar = state.gorulenAnahtari;
    if (!anahtar) return;
    try {
      const kayit = (await chrome.storage.local.get(anahtar))[anahtar] || { uidler: [], zaman: giris.zaman };
      kayit.gecmis = gecmiseEkle(kayit.gecmis, giris, state.ziyaretler.get(anahtar), GECMIS_SINIRI);
      await chrome.storage.local.set({ [anahtar]: kayit });
      renderGecmis(kayit.gecmis);
    } catch (err) {
      console.warn('[UYAP Arşiv] işlem geçmişi yazılamadı', err);
    }
  }

  /** The "İşlem Geçmişi" section: a summary always in view, the full list on demand. */
  function renderGecmis(gecmis) {
    const kutu = el.querySelector('[data-role="gecmis"]');
    if (!kutu) return;
    const ozet = kutu.querySelector('[data-role="gecmis-ozet"]');
    const dugme = kutu.querySelector('[data-act="gecmis-ac"]');
    const liste = kutu.querySelector('[data-role="gecmis-liste"]');
    const ziyaret = state.ziyaretler.get(state.gorulenAnahtari) ?? Infinity;

    kutu.hidden = false;
    ozet.textContent = gecmisOzeti(gecmis, ziyaret).join('\n');
    liste.innerHTML = '';

    // Empty only when the record could not be written at all.
    dugme.disabled = !gecmis.length;
    dugme.textContent = gecmis.length ? `İşlem Geçmişi (${gecmis.length})` : 'İşlem Geçmişi';
    if (!gecmis.length) {
      liste.hidden = true;
      dugme.classList.remove('is-acik');
      return;
    }
    for (const g of gecmis) {
      const li = node('li', 'ua-tur-satir ua-gecmis-satir' + (g.zaman >= ziyaret ? ' is-simdi' : ''));
      li.textContent = islemSatiri(g, ziyaret);
      liste.appendChild(li);
    }
  }

  function renderList() {
    const list = el.querySelector('[data-role="list"]');
    list.innerHTML = '';
    const genislik = padWidth(state.evraklar.length); // same width as the filenames

    for (const [i, ev] of state.evraklar.entries()) {
      const li = node('li', 'ua-row');
      if (state.indirilen.has(ev.uid)) li.classList.add('is-archived');
      const gecti = filtreliMi(ev);
      if (!gecti) li.classList.add('is-elenen');
      // Where inside the document the search hit — the reason this row is here
      // when nothing on the row itself mentions the word.
      const alinti = gecti ? icerikAlintisi(ev) : null;
      li.dataset.id = ev.uid;
      li.innerHTML = `
        <span class="ua-no">${String(i + 1).padStart(genislik, '0')}</span>
        <label class="ua-row-main">
          <input type="checkbox" ${state.secili.has(ev.uid) ? 'checked' : ''}${ev.indirilebilir ? '' : ' disabled'}>
          <span class="ua-row-text">
            <span class="ua-row-ad" title="${escapeHtml(ev.ad)}">${
              state.yeniler.has(ev.uid) ? '<span class="ua-yeni" title="Son bakışınızdan sonra gelmiş">YENİ</span>' : ''
            }${escapeHtml(ev.ad)}</span>
            <span class="ua-row-sub">${[
              isoToStamp(ev.tarih),
              ev.ekMi && ev.anaAd ? `→ ${escapeHtml(ev.anaAd)}` : '',
              ev.aciklama ? escapeHtml(ev.aciklama) : '',
              // The office only earns a place when there is no description to show.
              !ev.aciklama && ev.birim ? escapeHtml(ev.birim) : '',
              ev.kaynak ? escapeHtml(ev.kaynak) : ''
            ]
              .filter(Boolean)
              .join(' · ')}</span>
            ${
              alinti
                ? `<span class="ua-row-icerik">${escapeHtml(alinti.once)}<mark>${escapeHtml(alinti.eslesen)}</mark>${escapeHtml(alinti.sonra)}</span>`
                : ''
            }
          </span>
        </label>
        <span class="ua-row-state" data-role="state"></span>`;

      li.querySelector('input').onchange = (e) => {
        e.target.checked ? state.secili.add(ev.uid) : state.secili.delete(ev.uid);
        updateFoot();
      };
      list.appendChild(li);
    }

    el.querySelector('[data-role="foot"]').hidden = false;
    icerikDurumuYaz();
    // Only worth a button when there is something new to pick.
    const yeniDugmesi = el.querySelector('[data-act="sel-yeni"]');
    if (yeniDugmesi) {
      yeniDugmesi.hidden = state.yeniler.size === 0;
      yeniDugmesi.textContent = `Sadece Yeniler (${state.yeniler.size})`;
    }
    updateFoot();
  }

  /**
   * Does this document survive the filter?
   *
   * Three independent reasons to skip one: it has no id and cannot be fetched,
   * its type is excluded, or it is an attachment while attachments are off.
   * Everything that selects documents goes through here, so the buttons and the
   * type list can never disagree about what is included.
   */
  function filtreliMi(ev) {
    return elemeyiGecer(ev) && aramayaUyar(ev);
  }

  /** Every filter but the text search — what a content scan covers. */
  function elemeyiGecer(ev) {
    if (!ev.indirilebilir) return false;
    if (state.haricTurler.has(ev.tur)) return false;
    if (state.haricDosyalar.has(ev.kaynak || '(ana dosya)')) return false;
    if (ev.ekMi && !state.ekleriIndir) return false;

    // Date range, on the document's own date. An attachment inherits its
    // parent's date, so a range never splits a document from its annexes.
    const gun = ev.tarih ? ev.tarih.slice(0, 10) : '';
    if (state.baslangic && (!gun || gun < state.baslangic)) return false;
    if (state.bitis && (!gun || gun > state.bitis)) return false;
    return true;
  }

  /**
   * The text search: every word of it, in what the row shows or — once the
   * contents have been scanned — inside the document itself. Turkish letters
   * and case do not matter ("bilirkisi" finds "Bilirkişi"); see arama.js.
   */
  function aramayaUyar(ev) {
    const kelimeler = sorguKelimeleri(state.arama);
    if (!kelimeler.length) return true;
    const kunye = katla(`${ev.ad} ${ev.aciklama} ${ev.tur} ${ev.birim} ${ev.kaynak}`);
    const icerik = state.icerikler.get(ev.uid)?.katli || '';
    return kelimeler.every((k) => kunye.includes(k) || icerik.includes(k));
  }

  /** The passage of the document where the search hit, if it hit inside it. */
  function icerikAlintisi(ev) {
    const kelimeler = sorguKelimeleri(state.arama);
    const icerik = state.icerikler.get(ev.uid);
    if (!kelimeler.length || !icerik?.metin) return null;
    const icinde = kelimeler.filter((k) => icerik.katli.includes(k));
    return icinde.length ? alintiBul(icerik.metin, icerik.katli, icinde) : null;
  }

  /** Types present in this case file, most numerous first — the junk floats up. */
  function turleriHesapla() {
    const sayac = new Map();
    for (const ev of state.evraklar) {
      const t = ev.tur || '(türsüz)';
      sayac.set(t, (sayac.get(t) || 0) + 1);
    }
    // Alphabetical, in Turkish collation: the list is something you scan for a
    // known type, not a ranking. Sorting by count put the noisiest types on top
    // but made a specific one hard to find.
    state.turListesi = [...sayac.entries()]
      .map(([tur, adet]) => ({ tur, adet }))
      .sort((a, b) => a.tur.localeCompare(b.tur, 'tr'));
  }

  /** The source files the listing drew from, with how many documents each gave. */
  function dosyalariHesapla() {
    const sayac = new Map();
    for (const ev of state.evraklar) {
      const ad = ev.kaynak || '(ana dosya)';
      sayac.set(ad, (sayac.get(ad) || 0) + 1);
    }
    state.dosyaListesi = [...sayac.entries()]
      .map(([ad, adet]) => ({ ad, adet }))
      .sort((a, b) => (a.ad === '(ana dosya)' ? -1 : b.ad === '(ana dosya)' ? 1 : a.ad.localeCompare(b.ad, 'tr')));
  }

  function renderDosyalar() {
    const kutu = el.querySelector('[data-role="dosyalar"]');
    const liste = el.querySelector('[data-role="dosya-liste"]');
    if (!kutu || !liste) return;

    // Pointless when everything came from one file, which is the common case.
    kutu.hidden = state.dosyaListesi.length < 2;
    const secili = state.dosyaListesi.filter((d) => !state.haricDosyalar.has(d.ad)).length;
    kutu.querySelector('[data-act="dosya-ac"]').textContent =
      `Dosyalar (${secili}/${state.dosyaListesi.length})`;

    liste.innerHTML = '';

    const tumu = node('li', 'ua-tur-satir ua-tur-tumu');
    tumu.innerHTML = `
      <label class="ua-tur-etiket">
        <input type="checkbox" data-role="dosya-tumu">
        <span class="ua-tur-ad">Tüm dosyalar</span>
        <span class="ua-tur-say">${secili}/${state.dosyaListesi.length}</span>
      </label>`;
    const anaKutu = tumu.querySelector('input');
    anaKutu.checked = secili === state.dosyaListesi.length;
    anaKutu.indeterminate = secili > 0 && secili < state.dosyaListesi.length;
    anaKutu.onchange = (e) => {
      if (e.target.checked) state.haricDosyalar.clear();
      else for (const d of state.dosyaListesi) state.haricDosyalar.add(d.ad);
      filtreyiUygula();
    };
    liste.appendChild(tumu);

    for (const d of state.dosyaListesi) {
      const haric = state.haricDosyalar.has(d.ad);
      const li = node('li', 'ua-tur-satir' + (haric ? ' is-haric' : ''));
      li.innerHTML = `
        <label class="ua-tur-etiket">
          <input type="checkbox" ${haric ? '' : 'checked'}>
          <span class="ua-tur-ad" title="${escapeHtml(d.ad)}">${escapeHtml(d.ad)}</span>
          <span class="ua-tur-say">${d.adet}</span>
        </label>`;
      li.querySelector('input').onchange = (e) => {
        if (e.target.checked) state.haricDosyalar.delete(d.ad);
        else state.haricDosyalar.add(d.ad);
        filtreyiUygula();
      };
      liste.appendChild(li);
    }
  }

  function renderTurler() {
    const kutu = el.querySelector('[data-role="turler"]');
    const liste = el.querySelector('[data-role="tur-liste"]');
    if (!kutu || !liste) return;

    kutu.hidden = state.turListesi.length === 0;
    const secili = state.turListesi.filter((t) => !state.haricTurler.has(t.tur)).length;
    kutu.querySelector('[data-act="tur-ac"]').textContent =
      `Türler (${secili}/${state.turListesi.length})`;

    liste.innerHTML = '';

    // Files with fifty document types make one-by-one unticking pointless; the
    // usual move is "none of them except these three".
    const tumu = node('li', 'ua-tur-satir ua-tur-tumu');
    tumu.innerHTML = `
      <label class="ua-tur-etiket">
        <input type="checkbox" data-role="tur-tumu">
        <span class="ua-tur-ad">Tüm türler</span>
        <span class="ua-tur-say">${secili}/${state.turListesi.length}</span>
      </label>
      <button class="ua-btn ua-btn-link" data-act="tur-varsayilan"
              title="Her dosyada elenmesini seçtiğiniz türler dışındakileri geri getirir">Varsayılana dön</button>`;
    const anaKutu = tumu.querySelector('input');
    anaKutu.checked = secili === state.turListesi.length;
    anaKutu.indeterminate = secili > 0 && secili < state.turListesi.length;
    anaKutu.onchange = (e) => {
      if (e.target.checked) state.haricTurler.clear();
      else for (const t of state.turListesi) state.haricTurler.add(t.tur);
      filtreyiUygula();
    };
    liste.appendChild(tumu);

    for (const [i, t] of state.turListesi.entries()) {
      const haric = state.haricTurler.has(t.tur);
      const kalici = state.kaliciHaric.has(t.tur);

      const li = node('li', 'ua-tur-satir' + (haric ? ' is-haric' : ''));
      li.innerHTML = `
        <label class="ua-tur-etiket">
          <input type="checkbox" data-i="${i}" ${haric ? '' : 'checked'}>
          <span class="ua-tur-ad">${escapeHtml(t.tur)}</span>
          <span class="ua-tur-say">${t.adet}</span>
        </label>
        <button class="ua-btn ua-btn-link ua-tur-kalici${kalici ? ' is-on' : ''}"
                data-i="${i}" data-act="tur-kalici"
                title="${
                  kalici
                    ? 'Bu tür şu an açtığınız her dosyada otomatik işaretsiz geliyor. Kaldırmak için tıklayın.'
                    : 'Bu tür bundan sonra açtığınız her dosyada otomatik işaretsiz gelsin.'
                }">${kalici ? '✓ Her Dosyada Eleniyor' : '+ Her Dosyada Ele'}</button>`;

      li.querySelector('input').onchange = (e) => {
        if (e.target.checked) state.haricTurler.delete(t.tur);
        else state.haricTurler.add(t.tur);
        filtreyiUygula();
      };
      liste.appendChild(li);
    }
  }

  /** Re-apply the filter to the current selection and repaint both lists. */
  function filtreyiUygula() {
    renderDosyalar();
    state.secili = new Set(state.evraklar.filter(filtreliMi).map((e) => e.uid));
    renderTurler();
    renderList();
  }

  async function kaliciDegistir(i) {
    const t = state.turListesi[i];
    if (!t) return;

    if (state.kaliciHaric.has(t.tur)) {
      state.kaliciHaric.delete(t.tur);
      state.haricTurler.delete(t.tur);
    } else {
      state.kaliciHaric.add(t.tur);
      state.haricTurler.add(t.tur);
    }
    await chrome.storage.local.set({ turFiltresi: [...state.kaliciHaric] });
    filtreyiUygula();
  }

  /** Says what the chosen print order means in the hand, not in the abstract. */
  function siraNotuYaz() {
    const not = el.querySelector('[data-role="sira-not"]');
    if (!not) return;
    not.textContent =
      state.yazdirmaSirasi === 'yeniden'
        ? 'Çıktı en yeni evrakla başlar. Kâğıtları olduğu gibi klasöre koyduğunuzda en eski evrak altta kalır.'
        : 'Çıktı en eski evrakla başlar. Ekrandan okumak ve PDF olarak saklamak için uygundur.';
  }

  /** Show the path that will actually be used, since the input is normalised. */
  function kokNotuYaz() {
    const not = el.querySelector('[data-role="kok-not"]');
    if (not) not.textContent = `İndirilenler / ${state.kokKlasor} / <dosya adı> /`;
  }

  /**
   * Read the stored settings into the controls. Kept out of render() so that a
   * repaint never silently reverts a preference the user just set.
   */
  async function ayarlariYukle() {
    const k = await chrome.storage.local.get([
      'kokKlasor',
      'bildirimAcik',
      'zipModu',
      'kopyaAtla',
      'kapakEkle',
      'icindekiler',
      'excelDizini',
      'yazdirmaSirasi',
      'sayfayaSigdir',
      'istekYavaslatma',
      'engelKorumasi'
    ]);
    state.yavaslatma = k.istekYavaslatma || 1;
    state.engelKorumasi = k.engelKorumasi !== false;
    state.kokKlasor = normalizeRoot(k.kokKlasor || 'UYAP Arsiv');
    state.bildirimAcik = k.bildirimAcik !== false;
    state.zipModu = k.zipModu === true;
    state.kopyaAtla = k.kopyaAtla !== false;
    state.kapakEkle = k.kapakEkle !== false;
    state.icindekiler = k.icindekiler !== false;
    state.yazdirmaSirasi = k.yazdirmaSirasi === 'yeniden' ? 'yeniden' : 'eskiden';
    state.sayfayaSigdir = k.sayfayaSigdir !== false;
    state.excelDizini = k.excelDizini !== false;

    const kokAlan = el.querySelector('[data-act="kok"]');
    if (kokAlan) kokAlan.value = state.kokKlasor;
    const bAlan = el.querySelector('[data-act="bildirim"]');
    if (bAlan) bAlan.checked = state.bildirimAcik;
    const zAlan = el.querySelector('[data-act="zip"]');
    if (zAlan) zAlan.checked = state.zipModu;
    const kAlan = el.querySelector('[data-act="kopya"]');
    if (kAlan) kAlan.checked = state.kopyaAtla;
    const kpAlan = el.querySelector('[data-act="kapak"]');
    if (kpAlan) kpAlan.checked = state.kapakEkle;
    const icAlan = el.querySelector('[data-act="icindekiler"]');
    if (icAlan) icAlan.checked = state.icindekiler;
    const sAlan = el.querySelector('[data-act="sira"]');
    if (sAlan) sAlan.value = state.yazdirmaSirasi;
    const sgAlan = el.querySelector('[data-act="sigdir"]');
    if (sgAlan) sgAlan.checked = state.sayfayaSigdir;
    const exAlan = el.querySelector('[data-act="excel"]');
    if (exAlan) exAlan.checked = state.excelDizini;
    const ekAlan = el.querySelector('[data-act="engel-koruma"]');
    if (ekAlan) ekAlan.checked = state.engelKorumasi;
    siraNotuYaz();
    updateFoot();
    kokNotuYaz();
  }

  function secimUygula(kural) {
    state.secili = new Set(state.evraklar.filter((e) => filtreliMi(e) && kural(e)).map((e) => e.uid));
    for (const row of el.querySelectorAll('.ua-row')) {
      const box = row.querySelector('input');
      if (box) box.checked = state.secili.has(row.dataset.id);
    }
    updateFoot();
  }

  function updateFoot() {
    const btn = el.querySelector('[data-act="download"]');
    const n = state.secili.size;
    btn.disabled = n === 0 || state.busy;
    btn.textContent = n ? `${n} Evrağı İndir${state.zipModu ? ' (zip)' : ''}` : 'Evrak Seçin';
    hizAciklamasiYaz();
  }

  /** The one pace there is, and how long the current selection will take at it. */
  function hizAciklamasiYaz() {
    const yer = el.querySelector('[data-role="hiz-aciklama"]');
    if (!yer) return;
    const m = state.yavaslatma || 1;
    const n = state.secili.size;
    const evrakBasina = (ISTEK_TEMPOSU.minDelayMs + ISTEK_TEMPOSU.jitterMs / 2) * m;
    yer.textContent =
      "Evraklar UYAP'ı yormamak için tek tek, birkaç saniye arayla istenir (dakikada yaklaşık 16 evrak)." +
      (n ? ` Seçili ${n} evrak için yaklaşık ${sureMetni(n * evrakBasina)}.` : '') +
      (m > 1
        ? ` Son UYAP engeli nedeniyle şu an ${m} kat yavaş çalışıyor; engelsiz biten büyük işlerden sonra toparlanır.`
        : '');
  }

  /**
   * One index row. Deliberately not a copy of the document object: the raw
   * response and the encrypted ids are megabytes of noise that expire the same
   * day, and the index is meant to still make sense years from now.
   */
  /** The one explanation shared by every failure, or nothing if they differ. */
  function ortakHata(failures) {
    const benzersiz = new Set(failures.map((f) => String(f.error || '')));
    return benzersiz.size === 1 ? [...benzersiz][0] : '';
  }

  /**
   * SHA-256 of the bytes.
   *
   * Documents repeat inside a case file — the same fezleke attached to five
   * müzekkere, the same tebligat filed twice. Names and ids differ, so only the
   * content can tell them apart. It costs one hash per document, and it can only
   * be done after the fetch: identity is in the bytes, not in the listing.
   */
  async function ozetle(bytes) {
    const buf = await crypto.subtle.digest('SHA-256', bytes);
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  function satir(ev, sira, dosyaAdi, durum) {
    return {
      sira,
      uid: ev.uid,
      imza: ev.imza,
      tarih: ev.tarih,
      tur: ev.tur,
      ad: ev.ad,
      klasor: ev.klasor,
      uzanti: ev.uzanti,
      ekMi: Boolean(ev.ekMi),
      kimlikYontemi: ev.kimlikYontemi || '',
      dosyaAdi,
      durum
    };
  }

  /**
   * Fetch one document's bytes, or throw with the portal's own explanation.
   *
   * Shared by downloading and printing: both need the same refusal detection and
   * the same id-combination search, and keeping two copies of that would mean
   * fixing UYAP's next surprise twice.
   */
  /**
   * Download URLs the portal itself issued, with this document's ids put in.
   *
   * Only the parameters are replaced; everything else the portal sent is kept.
   */
  async function portalSablonlari(ev) {
    const ep = ctx.preset.endpoints.evrakIndir;
    const yol = new URL(ep.path, location.origin).pathname;
    const kayitli = (await ctx.getRequests?.(yol)) || [];
    const out = [];

    for (const istek of kayitli.slice(0, 2)) {
      for (const [etiket, dosyaId] of [
        ['portal+kendi', ev.dosyaId],
        ['portal+açık', state.acikDosyaId]
      ]) {
        if (!dosyaId || !ev.id) continue;
        try {
          const u = new URL(istek.url, location.origin);
          u.searchParams.set('dosyaId', dosyaId);
          u.searchParams.set('evrakId', ev.id);
          out.push({ ad: etiket, url: u.toString(), method: istek.method || 'GET' });
        } catch {
          /* the recorded url is unusable — the built combinations still apply */
        }
      }
    }
    return out;
  }

  async function evraginBaytlari(ev) {
    const onbellekli = state.onbellek.get(ev.uid);
    if (onbellekli) {
      ev.uzanti = onbellekli.uzanti || ev.uzanti;
      return new Blob([onbellekli.bytes]);
    }

    const ep = ctx.preset.endpoints.evrakIndir;
    let sunucuMesaji = '';

    // What each id combination was answered with, kept for the failure report.
    // A refusal alone does not say whether the request was wrong or the document
    // genuinely out of reach, and those need opposite fixes.
    const denemeler = [];

    // UYAP reports refusals with HTTP 200 and a sentence of HTML: "Evrak
    // bulunamadı veya yetkiniz yoktur", "İlgili dosyada vekil kaydınız
    // bulunmamaktadır", and presumably others not yet seen. It sends those with a
    // Content-Disposition filename too, so headers cannot be trusted. Judge by
    // kind: a court document arrives as PDF, UDF or a scan, so a short HTML body
    // is a message, whatever it says.
    const gecerliMi = async (res) => {
      if (!/text\/html|text\/plain/i.test(res.contentType || '')) return true;
      // Strip style and script *contents*, not just their tags. Removing tags
      // alone left the page's CSS in the text, so the panel reported
      // ".msgbaslik { background:#eb9c04 … }" as the server's answer and the
      // actual sentence — the one that says what is wrong — never showed.
      const metin = (await res.blob.text())
        .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
        .replace(/<!--[\s\S]*?-->/g, ' ')
        .replace(/<[^>]*>/g, ' ')
        .replace(/&nbsp;/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      // Judged by what the page says, not by how big it is. The old rule treated
      // any HTML under 8 KB as a refusal, which threw away real documents: KEP
      // delivery receipts and vekalet pulu makbuzu are genuine documents served
      // as small HTML pages. One of them arrived at 3.6 KB, was discarded on
      // size, and the run reported "vekil kaydınız bulunmamaktadır" — the answer
      // to a *different* attempt — as though the portal had refused it.
      // Length is what separates a refusal from a document, together with the
      // wording. A refusal page is a sentence: "İlgili dosyada vekil kaydınız
      // bulunmamaktadır." A document is paragraphs. Two earlier rules failed
      // here — a byte threshold discarded a 3.6 KB KEP receipt, and matching
      // UYAP's msgbaslik styling discarded it again, because the portal uses
      // that same styling for real documents as well.
      // UYAP's security block arrives as an ordinary page full of text, which
      // made it pass for a document: it was saved and printed as one, and the run
      // went on into the block.
      if (engelMetniMi(metin)) {
        if (state.engelKorumasi) engelle(metin);
        // Protection off: this one document fails at once, in UYAP's own words,
        // and the run goes on. No other way of asking is tried — each attempt
        // would be one more request into the block — and it is not counted as a
        // refusal: the block is temporary, so a resume asks for it again and the
        // source file is not closed over it.
        throw kaliciHata(metin.slice(0, 300));
      }
      const kisaMesaj = metin.length < 400;
      const reddediyor = kisaMesaj && /bulunamad|bulunmamakta|yetkiniz|yetkisiz|vekil kayd/i.test(metin);

      if (reddediyor) {
        if (metin) sunucuMesaji = metin.slice(0, 200);
        return false;
      }

      // Text and no refusal: a document. Empty and tiny: nothing worth keeping.
      if (metin) return true;
      if (res.blob.size < 512) {
        sunucuMesaji = 'Sunucu boş yanıt döndürdü.';
        return false;
      }
      return true;
    };

    // Tokens come from the listing that produced them. If the session expires
    // mid-run every remaining request fails the same way — stop the queue
    // instead of burning through it.
    const yetkiKontrol = (err) => {
      if (engelMetniMi(err?.govde)) {
        if (state.engelKorumasi) engelle(err.govde);
        throw kaliciHata(String(err.govde).replace(/\s+/g, ' ').trim().slice(0, 300));
      }
      // Not found is an answer too: a resume does not ask for it again.
      if (err?.status === 404) state.reddedilenler.add(ev.uid);
      if (err?.status === 401 || err?.status === 403) {
        state.queue?.abort();
        state.yetkiDustu = true;
      }
      throw err;
    };

    // Which id pair the endpoint wants is undocumented and differs between the
    // open file and its linked files. Try the plausible combinations once, then
    // reuse whichever worked.
    const kombinasyonlar = [
      { ad: 'kendi', evrakId: ev.id, dosyaId: ev.dosyaId },
      { ad: 'açık-dosya', evrakId: ev.id, dosyaId: state.acikDosyaId },
      { ad: 'gg+açık', evrakId: ev.ggId, dosyaId: state.acikDosyaId },
      { ad: 'gg+kendi', evrakId: ev.ggId, dosyaId: ev.dosyaId }
    ].filter((k) => k.evrakId && k.dosyaId);

    // Attachments carry their parent's id, and it has never been sent. Some of
    // them — bank replies filed under one covering document, for instance — are
    // refused with only the two ids the record supplies, which suggests the
    // endpoint wants to know which document they hang off. Unknown parameters
    // are ignored by servers that do not want them, so this costs one request.
    if (ev.ekMi && ev.parentId && ev.id && ev.dosyaId) {
      kombinasyonlar.push({
        ad: 'ek+ana',
        evrakId: ev.id,
        dosyaId: ev.dosyaId,
        ekstra: { anaEvrakId: ev.parentId }
      });
    }

    // Last resort: the portal's own download request, reused as a template with
    // our ids swapped in. Documents from some linked files were refused with all
    // four id pairs while opening fine in the portal, which means the request
    // differs in something other than the ids — a parameter this extension does
    // not know about. Replaying the portal's own URL carries it across without
    // anyone having to work out what it is.
    const sablonlar = await portalSablonlari(ev);

    // Learned per source file, not once for the whole run: the open file and each
    // linked file can want different id pairs, so a single remembered answer made
    // every document of every other file pay for a refused request first.
    const kaynakAnahtari = ev.kaynak || '(ana)';
    const ogrenilen = state.calisanKombinasyon.get(kaynakAnahtari);

    // A file that refused two documents every way of asking, and never gave
    // one: the rest of its documents are not asked for. A linked soruşturma file
    // without a vekalet refuses all of them, and asking for each one five to
    // nine ways was exactly the burst UYAP's security layer suspends access for.
    const kapali = state.kapaliKaynaklar.get(kaynakAnahtari);
    if (kapali && !ogrenilen) {
      state.reddedilenler.add(ev.uid);
      throw kaliciHata(`${kapali} — bu dosyanın evrakları portaldan verilmediği için kalanları istenmedi.`);
    }

    // Once a way of asking is known for this file, it is the only one used, and
    // a refusal is taken as the answer. Trying the others is for the first
    // documents of a file only, while there is something to learn.
    const denenecek = ogrenilen
      ? [...kombinasyonlar.filter((k) => k.ad === ogrenilen), ...sablonlar]
      : [...kombinasyonlar, ...sablonlar];

    let blob = null;
    let kullanilan = null;

    for (const [deneme, kombin] of denenecek.entries()) {
      // Paced within a document as well as between documents: the attempts
      // for one document used to go out back to back, a burst of several
      // requests in under a second.
      if (deneme > 0) {
        await new Promise((r) => setTimeout(r, (state.tempo || ISTEK_TEMPOSU).minDelayMs));
        if (state.queue?.aborted) throw new Error('iptal edildi');
      }
      let istek = kombin.url
        ? { url: kombin.url, method: kombin.method, headers: {} }
        : buildRequest(location.origin, ep, kombin);

      if (kombin.ekstra) {
        const u = new URL(istek.url, location.origin);
        for (const [ad, deger] of Object.entries(kombin.ekstra)) u.searchParams.set(ad, deger);
        istek = { ...istek, url: u.toString() };
      }

      if (ep.responseKind === 'base64-json') {
        const json = await ctx.portalFetch(istek).catch(yetkiKontrol);
        const b64 = getByPath(json, ep.base64Path);
        if (!b64) continue;
        blob = base64ToBlob(b64);
        kullanilan = kombin.ad;
        break;
      }

      const res = await ctx.portalFetch(istek, true).catch(yetkiKontrol);
      if (!(await gecerliMi(res))) {
        denemeler.push({
          kombinasyon: kombin.ad,
          tur: res.contentType || '?',
          boyut: res.blob.size,
          yanit: sunucuMesaji.slice(0, 90)
        });
        continue;
      }

      blob = res.blob;
      ev.uzanti = extensionFrom(res.contentDisposition, res.contentType, ev.uzanti || 'pdf');
      kullanilan = kombin.ad;
      break;
    }

    // A rejected attempt that actually carried the document is the failure mode
    // that cost three rounds here, so record what was thrown away, not only the
    // fact that it was.
    if (!kullanilan) {
      // Everything known about this one refusal, in one line the user can copy.
      // Which combinations existed at all matters as much as what they returned:
      // a document whose own dosyaId is missing was never asked for correctly.
      console.warn('[UYAP Arşiv] alınamadı', {
        evrak: ev.ad,
        kaynak: ev.kaynak || '(ana dosya)',
        uzanti: ev.uzanti || '?',
        kimlikler: {
          evrakId: ev.id ? 'var' : 'YOK',
          dosyaId: ev.dosyaId ? 'var' : 'YOK',
          ggId: ev.ggId ? 'var' : 'YOK',
          acikDosyaId: state.acikDosyaId ? 'var' : 'YOK'
        },
        listelemedenBuYana: state.listelemeZamani
          ? `${Math.round((Date.now() - state.listelemeZamani) / 1000)} sn`
          : '?',
        // Whether the portal's own request was available to copy from. Zero means
        // no document had been opened by hand in this page session, so the
        // template fallback had nothing to learn from.
        portalSablonu: sablonlar.length,
        denemeler
      });

      // The portal's own wording is more useful than ours: "vekil kaydınız
      // bulunmamaktadır" tells the lawyer what is missing and who can fix it.
      if (!ogrenilen && sunucuMesaji) {
        const n = (state.kaynakRetleri.get(kaynakAnahtari) || 0) + 1;
        state.kaynakRetleri.set(kaynakAnahtari, n);
        if (n >= 2) state.kapaliKaynaklar.set(kaynakAnahtari, sunucuMesaji);
      }
      // A refusal is an answer, not a hiccup. It used to be retried twice, every
      // way of asking each time: up to 27 requests for one document UYAP had
      // already said no to.
      state.reddedilenler.add(ev.uid);
      throw kaliciHata(sunucuMesaji || 'Sunucu evrağı vermedi (denenen tüm kimlik birleşimleri reddedildi).');
    }

    state.calisanKombinasyon.set(kaynakAnahtari, kullanilan);
    ev.kimlikYontemi = kullanilan;

    state.alinanBuIs = (state.alinanBuIs || 0) + 1;
    if (state.onbellekBayt + blob.size <= ONBELLEK_SINIRI) {
      const bytes = new Uint8Array(await blob.arrayBuffer());
      state.onbellek.set(ev.uid, { bytes, uzanti: ev.uzanti });
      state.onbellekBayt += bytes.length;
      return new Blob([bytes]);
    }
    return blob;
  }

  /**
   * Print the selected documents, in list order, whatever format they arrive in.
   *
   * Everything is converted to PDF and merged into one document, which is then
   * printed. The earlier approach built an HTML page instead, and it could never
   * be complete: browsers refuse to print a PDF embedded in an HTML page, so
   * every PDF in the case file was silently left out of the printout. Merging
   * costs a vendored library (vendor/pdf-lib) but it is the only route to "one
   * print job, every document, right order".
   */
  async function yazdir() {
    if (state.busy) return;
    const secilen = state.evraklar.filter((e) => state.secili.has(e.uid) && e.indirilebilir);
    if (!secilen.length) return setMeta('Önce evrak seçin.', true);
    if (await engelBekleniyor()) return;
    state.engellendi = false;
    state.engelMetni = '';
    state.reddedilenler = new Set();
    state.yetkiDustu = false;

    state.busy = true;
    state.iptalEdildi = false;
    toggleRunButtons(true);
    setStatus('Hazırlanıyor…');

    let pdfLib;
    let PDFDocument;
    let fontlar;
    try {
      pdfLib = await import(chrome.runtime.getURL('vendor/pdf-lib.esm.min.js'));
      ({ PDFDocument } = pdfLib);
      fontlar = await fontlariYukle((yol) => chrome.runtime.getURL(yol));
    } catch (err) {
      state.busy = false;
      toggleRunButtons(false);
      return setMeta(`Yazdırma bileşenleri yüklenemedi: ${err?.message || err}`, true);
    }

    // Fetched in parallel but kept in list order: the slot is reserved up front,
    // so whichever document answers first cannot jump the chronology.
    const parcalar = new Array(secilen.length).fill(null);
    // Kept as {ad, sebep} rather than one formatted string: the reason has to be
    // comparable across documents, so an explanation shared by all of them can be
    // stated once instead of forty times.
    const sorunlu = [];

    // Everything is held in memory until the archive can be closed, so a large
    // enough selection takes the tab down with it. Stop at a size the browser
    // can still finish rather than crashing halfway through.
    const BELLEK_SINIRI = 350_000_000;
    let toplamBayt = 0;

    // How many attachments each document has, and how many of them made it into
    // this selection. Printed without its annexes, a document should say so:
    // otherwise the bundle looks complete when three exhibits are missing.
    const ekSayaci = new Map();
    const seciliEkler = new Map();
    for (const ev of state.evraklar) {
      if (!ev.ekMi || !ev.parentId) continue;
      ekSayaci.set(ev.parentId, (ekSayaci.get(ev.parentId) || 0) + 1);
      if (state.secili.has(ev.uid)) seciliEkler.set(ev.parentId, (seciliEkler.get(ev.parentId) || 0) + 1);
    }

    // Work starts on each document the moment it arrives. Fetching is paced for
    // UYAP's sake — under a second per document, most of it spent waiting — so
    // the processor sat idle through the whole download and only then decoded
    // every scan and hashed every document, one after another. Done in that idle
    // time instead, one document at a time, the merge that follows is mostly
    // putting finished pages in order. Text documents are not prepared ahead:
    // they take milliseconds, and their PDFs would only sit in memory.
    const baslangic = Date.now();
    let hazirlik = Promise.resolve();
    const hazirla = (parca) => {
      hazirlik = hazirlik.then(async () => {
        if (state.iptalEdildi || !parca.bytes) return;
        try {
          if (state.kopyaAtla) parca.ozet = await icerikOzeti(parca.bytes, parca);
          if (parca.tur === 'tif' || parca.tur === 'png') await gorselKareleri(parca.bytes, parca.tur, parca);
        } catch {
          /* the merge tries again and reports what went wrong */
        }
        await nefesAl();
      });
    };

    const tahminci = sureTahminci(secilen.length);
    const queue = new TaskQueue({
      ...(await tempoBelirle()),
      izleyici: nabiz,
      onProgress: ({ done, total: t }) => {
        cubuk(done, t);
        const kalan = tahminci(done);
        setStatus(`Evraklar alınıyor: ${done}/${t}${kalan ? ` · ${kalan}` : ''}`);
      }
    });
    state.queue = queue;

    for (const [i, ev] of secilen.entries()) {
      const sira = state.evraklar.indexOf(ev) + 1;
      const baslik = evrakEtiketi(ev, sira, ekSayaci, seciliEkler);

      queue.add(ev.uid, async () => {
        markRow(ev.uid, 'running');
        // Marked here as well as in the merge: a run that stops before the merge
        // — cancelled, or blocked by UYAP — would otherwise leave the row spinning.
        const blob = await evraginBaytlari(ev).catch((err) => {
          markRow(ev.uid, 'failed', String(err?.message || err));
          throw err;
        });
        const bytes = new Uint8Array(await blob.arrayBuffer());
        const tur = await evrakBicimi(bytes, ev, blob.type);

        toplamBayt += bytes.length;
        if (toplamBayt > BELLEK_SINIRI * 0.7 && state.onbellek.size) {
          // The cache is a convenience; the run in progress is not. Give its
          // memory back before the guard below has to stop anything.
          state.onbellek = new Map();
          state.onbellekBayt = 0;
        }
        if (toplamBayt > BELLEK_SINIRI) {
          state.queue?.abort();
          throw new Error('Seçim belleğe sığmayacak kadar büyük. Daha az evrak seçip yazdırın.');
        }

        parcalar[i] = { tur, bytes, baslik, ev };
        hazirla(parcalar[i]);
        markRow(ev.uid, 'done');
        return true;
      });
    }

    const { failures } = await queue.run();
    tempoyuToparla();
    const almaSuresi = Date.now() - baslangic;
    const hatalar = new Map(failures.map((f) => [f.label, f.error]));
    const alinan = parcalar.filter(Boolean).length;

    // An aborted run — an expired session, or the size guard above — leaves most
    // documents unfetched. Building the archive anyway would produce hundreds of
    // pages that say only "iptal edildi", which is worse than producing nothing.
    // Nothing worth building from: cancelled, or the session went. Merging the
    // little that arrived would hand over a document that looks like the whole
    // case file.
    // Blocked: nothing is built from a part of the file. What did arrive stays
    // in memory, so the retry after the pause asks only for the rest.
    // Stopped before the end: remember the selection, so "Kaldığı Yerden Devam
    // Et" prints the same documents and asks only for the ones not yet in memory.
    if (state.engellendi || state.iptalEdildi || (state.yetkiDustu && alinan < secilen.length / 2)) {
      state.yarim = {
        tur: 'yazdirma',
        uids: secilen.map((e) => e.uid),
        toplam: secilen.length,
        zaman: Date.now()
      };
      await yarimKaydet(state.yarim);
    }
    if (state.engellendi) {
      state.busy = false;
      state.queue = null;
      toggleRunButtons(false);
      setStatus(
        `Yazdırma durduruldu: ${alinan}/${secilen.length} evrak alınmıştı; bu sayfada bekliyorlar. ` +
          "Bekleme bitince Kaldığı Yerden Devam Et'e basın."
      );
      const { kalan, sayi, ilerledi } = await (state.engelKaydi || engelKaydet());
      return setMeta(engelMesaji(kalan, sayi, ilerledi) + engelYaniti(), true);
    }
    if (state.iptalEdildi || !alinan || (state.yetkiDustu && alinan < secilen.length / 2)) {
      state.busy = false;
      state.queue = null;
      toggleRunButtons(false);
      return setMeta(
        state.iptalEdildi
          ? `Yazdırma iptal edildi. ${alinan} evrak alınmıştı, belge oluşturulmadı.`
          : state.yetkiDustu
            ? 'Oturum düştüğü için yazdırma durduruldu. Portala girip yeniden listeleyin, sonra tekrar deneyin.'
            : `Hiçbir evrak alınamadı.${failures.length ? '\n' + failures[0].error : ''}`,
        !state.iptalEdildi
      );
    }

    // The last few documents may still be in preparation.
    nabiz.asama();
    setStatus('Son gelen evraklar hazırlanıyor…');
    await hazirlik;

    nabiz.asama();
    setStatus('Belgeler birleştiriliyor…');
    const birlesik = await PDFDocument.create();
    const damgalar = new Map();

    // The same content, attached to twenty documents, is twenty printed copies of
    // one page. Skipped by content hash, exactly as downloading does, and under
    // the same setting — a printed bundle should not differ from the folder.
    //
    // Decided in chronological order, before any reversal for printing. Deciding
    // it in print order kept whichever copy happened to be processed first, so
    // with a reversed bundle the document's *first* appearance was the one
    // dropped — the opposite of what a case file needs: an exhibit belongs where
    // it was first used, and the later repeats are the ones to leave out.
    const atlanacak = new Set();
    // Skipped copy → the document that carries its content, so the contents
    // page can still send a reader looking for the copy to the right place.
    const kopyaKaynagi = new Map();
    let kopyaAtlanan = 0;

    if (state.kopyaAtla) {
      const gorulen = new Map();
      for (const [i, parca] of parcalar.entries()) {
        if (!parca?.bytes) continue;
        // Images are decoded to be compared, which on a few hundred scans is
        // slow enough to look like a hang without a count.
        setStatus(`Aynı içerikli evraklar ayıklanıyor: ${i + 1}/${parcalar.length}`);
        cubuk(i + 1, parcalar.length);
        await nefesAl();
        nabiz.isBasladi(secilen[i].uid);
        const ozet = parca.ozet ?? (await icerikOzeti(parca.bytes, parca));
        nabiz.isBitti(secilen[i].uid);

        if (gorulen.has(ozet)) {
          const ilkSira = String(state.evraklar.indexOf(secilen[gorulen.get(ozet)]) + 1).padStart(3, '0');
          atlanacak.add(i);
          kopyaKaynagi.set(i, gorulen.get(ozet));
          kopyaAtlanan++;
          markRow(secilen[i].uid, 'kopya', `Aynı içerik ${ilkSira} numaralı evrakta`);
          parca.bytes = null;
        } else {
          gorulen.set(ozet, i);
        }
      }
    }

    // Every selected document must appear. Before, a fetch failure skipped the
    // slot and a conversion failure was swallowed by the catch, so documents
    // vanished from the printout while the list still showed them ticked — the
    // one outcome this tool exists to prevent.
    // Reversed for a physical file: papers stack oldest at the bottom, so the
    // newest document has to come off the printer first. The sequence numbers do
    // NOT follow — 001 stays the oldest document in every mode, because the
    // downloaded file names and the marker pages refer to those numbers.
    const sira = parcalar.map((p, i) => [i, p]);
    if (state.yazdirmaSirasi === 'yeniden') sira.reverse();

    // Every marker in one document, parsed once. Written per document it meant a
    // whole PDF produced and re-parsed for each of a few hundred entries, which
    // cost more than the merge it was labelling.
    const damgaBasliklari = sira
      .filter(([i]) => !atlanacak.has(i))
      .map(([i, parca]) => parca?.baslik)
      .filter(Boolean);

    if (damgaBasliklari.length) {
      nabiz.asama();
      setStatus(`Sayfa üst bilgileri hazırlanıyor (${damgaBasliklari.length} evrak)…`);
      await nefesAl(true);
      try {
        const toplu = new PdfYazici(fontlar);
        for (const [i, baslik] of damgaBasliklari.entries()) {
          if (i > 0) toplu.yeniSayfa();
          toplu.ustBilgi(baslik);
        }
        const kaynak = await PDFDocument.load(new Uint8Array(await toplu.bitir().arrayBuffer()));
        const gomulu = await birlesik.embedPdf(kaynak, kaynak.getPageIndices());
        damgaBasliklari.forEach((baslik, i) => damgalar.set(baslik, gomulu[i]));
      } catch (err) {
        // Falling back to one marker per document is slower, not broken.
        console.warn('[UYAP Arşiv] etiketler toplu hazırlanamadı', err);
      }
    }

    let birlestirilen = 0;
    const birlestirilecek = sira.length - atlanacak.size;
    // Where each document starts in the bundle, before cover and contents are
    // put in front: selection index → { bas, hatali }.
    const konumlar = new Map();

    for (const [i, parca] of sira) {
      const ev = secilen[i];

      if (atlanacak.has(i)) continue;
      const bas = birlesik.getPageCount();
      let hatali = false;

      // Merging a few hundred documents takes visibly longer than fetching them,
      // and a panel that says only "birleştiriliyor…" for a minute looks stuck.
      birlestirilen++;
      setStatus(
        `Belgeler birleştiriliyor: ${birlestirilen}/${birlestirilecek}` +
          ' · bu işlem sürerken sayfayı kapatmayın'
      );
      cubuk(birlestirilen, birlestirilecek);
      nabiz.isBasladi(ev.uid);
      await nefesAl();

      const baslik = parca?.baslik ?? `${String(state.evraklar.indexOf(ev) + 1).padStart(3, '0')} · ${isoToStamp(ev.tarih)} · ${ev.ad}`;

      try {
        if (!parca) throw new Error(hatalar.get(ev.uid) || 'Evrak sunucudan alınamadı.');

        if (parca.tur === 'udf') {
          const { xml } = await udfOku(parca.bytes.buffer);
          await sayfalariAktar(birlesik, PDFDocument, await udfPdf(fontlar, udfCozumle(xml), parca.baslik));
        } else if (parca.tur === 'pdf') {
          const eklenen = await sayfalariAktar(birlesik, PDFDocument, parca.bytes);
          await etiketBas(birlesik, PDFDocument, fontlar, eklenen, parca.baslik, damgalar);
        } else if (parca.tur === 'html') {
          const metin = new TextDecoder('utf-8', { fatal: false }).decode(parca.bytes);
          const paragraflar = htmlParagraflar(metin);
          if (!paragraflar.length) throw new Error('HTML evrakta metin bulunamadı.');

          const yazici = new PdfYazici(fontlar);
          yazici.ustBilgi(parca.baslik);
          for (const par of paragraflar) yazici.paragraf(par);
          await sayfalariAktar(birlesik, PDFDocument, new Uint8Array(await yazici.bitir().arrayBuffer()));
        } else if (parca.tur === 'docx' || parca.tur === 'eml' || parca.tur === 'metin') {
          const paragraflar =
            parca.tur === 'docx'
              ? await docxParagraflar(
                  await zipIcerik(
                    parca.bytes.buffer.slice(parca.bytes.byteOffset, parca.bytes.byteOffset + parca.bytes.length)
                  )
                )
              : parca.tur === 'eml'
                ? emlParagraflar(parca.bytes)
                : duzMetinParagraflar(parca.bytes);

          if (!paragraflar.length) throw new Error('Evrakta metin bulunamadı.');

          const yazici = new PdfYazici(fontlar);
          yazici.ustBilgi(parca.baslik);
          for (const par of paragraflar) yazici.paragraf(par);
          await sayfalariAktar(birlesik, PDFDocument, new Uint8Array(await yazici.bitir().arrayBuffer()));
        } else if (parca.tur === 'xlsx') {
          await sayfalariAktar(birlesik, PDFDocument, await xlsxPdf(fontlar, parca));
        } else if (parca.tur === 'paket') {
          await paketiAc(birlesik, PDFDocument, fontlar, parca, damgalar);
        } else if (parca.tur === 'tif' || parca.tur === 'png') {
          // Browsers cannot decode TIFF, and scanned court documents arrive as
          // TIFF constantly. Decoded here, page for page — usually already done
          // while the download was still running.
          const eklenen = (await gorselKareleri(parca.bytes, parca.tur, parca)).map((kare) =>
            gorselSayfasiEkle(birlesik, pdfLib, kare)
          );
          await etiketBas(birlesik, PDFDocument, fontlar, eklenen, parca.baslik, damgalar);
        } else if (parca.tur === 'jpg') {
          // A JPEG goes in as it is: the PDF can carry its compressed data directly.
          const gorsel = await birlesik.embedJpg(parca.bytes);
          const olcek = Math.min(535 / gorsel.width, 760 / gorsel.height, 1);
          const sayfa = birlesik.addPage([595.28, 841.89]);
          sayfa.drawImage(gorsel, {
            x: 30,
            y: 841.89 - 40 - gorsel.height * olcek,
            width: gorsel.width * olcek,
            height: gorsel.height * olcek
          });
          await etiketBas(birlesik, PDFDocument, fontlar, [sayfa], parca.baslik, damgalar);
        } else {
          // Nothing renderable — a TIFF scan, say.
          throw new Error(`Bu biçim yazdırılamadı (${(ev.uzanti || 'bilinmiyor').toUpperCase()}).`);
        }
        markRow(ev.uid, 'done');
      } catch (err) {
        // A marker page keeps the document's place in the sequence, so the
        // printout still has an entry where the document belongs and says why.
        const sebep = String(err?.message || err);
        hatali = true;
        sorunlu.push({ ad: ev.ad, sebep });
        markRow(ev.uid, 'failed', sebep);
        try {
          const sira = state.evraklar.indexOf(ev) + 1;
          await sayfalariAktar(birlesik, PDFDocument, await yerTutucuSayfa(fontlar, ev, sira, baslik, sebep));
        } catch (ikinci) {
          // The marker itself failing must be visible: a silently swallowed error
          // here is how the missing pages went unnoticed in the first place.
          console.error('[UYAP Arşiv] yer tutucu sayfa oluşturulamadı', ikinci);
          sorunlu.push({ ad: ev.ad, sebep: `yer tutucu sayfa da oluşturulamadı (${ikinci?.message || ikinci})` });
        }
      } finally {
        nabiz.isBitti(ev.uid);
        // The bytes are in the archive now; holding them doubles peak memory.
        if (parca) parca.bytes = null;
        if (birlesik.getPageCount() > bas) konumlar.set(i, { bas, hatali });
      }
    }

    // Built last so its counts describe what is actually in the bundle, then put
    // at the front where a cover belongs.
    let kapakEklendi = false;
    if (state.kapakEkle && birlesik.getPageCount()) {
      try {
        const dahilEdilen = secilen.filter((_, i) => !atlanacak.has(i));
        const kapak = await PDFDocument.load(await kapakSayfasi(fontlar, dahilEdilen, kopyaAtlanan));
        const [sayfa] = await birlesik.copyPages(kapak, [0]);
        birlesik.insertPage(0, sayfa);
        kapakEklendi = true;
      } catch (err) {
        sorunlu.push({ ad: 'Kapak sayfası', sebep: String(err?.message || err) });
      }
    }

    // After the cover, because every page number it prints depends on how many
    // pages stand in front of the documents.
    if (state.icindekiler && konumlar.size) {
      nabiz.asama();
      setStatus('İçindekiler ve yer imleri hazırlanıyor…');
      try {
        await dizinEkle(birlesik, pdfLib, fontlar, { sira, secilen, konumlar, kopyaKaynagi, kapakEklendi });
      } catch (err) {
        // The bundle is complete without it; say so rather than lose the run.
        console.error('[UYAP Arşiv] içindekiler eklenemedi', err);
        sorunlu.push({ ad: 'İçindekiler', sebep: String(err?.message || err) });
      }
    }

    // The run stays in progress through writing the file and opening it: for a
    // large bundle the save alone takes the better part of a minute, and ending
    // the run before it left the panel silent, still showing the previous step,
    // for exactly the stretch that looked like a hang.
    const bitir = () => {
      state.busy = false;
      state.queue = null;
      toggleRunButtons(false);
    };

    if (birlesik.getPageCount() === 0) {
      bitir();
      return setMeta(
        `Yazdırılacak evrak hazırlanamadı.${sorunlu.length ? `\n${sorunlu[0].ad}: ${sorunlu[0].sebep}` : ''}`,
        true
      );
    }

    // Object streams compress the file structure; skipping that is four times
    // faster to write and about 6% larger, which is the right trade for a
    // document that is about to be printed or saved once.
    let cikti;
    try {
      nabiz.asama();
      setStatus(`PDF dosyası yazılıyor: ${birlesik.getPageCount()} sayfa · büyük seçimlerde bir dakikayı bulabilir`);
      cubuk(1, 1);
      await nefesAl(true);
      // One copy of each font, and the plain text streams compressed: a third of
      // the size for the viewer and the printer to read (see src/lib/gorsel.js).
      try {
        fontlariTekle(birlesik, pdfLib);
        await akislariSikistir(birlesik, pdfLib);
      } catch (err) {
        // A larger file, not a broken one.
        console.warn('[UYAP Arşiv] çıktı küçültülemedi', err);
      }
      cikti = new Blob([await birlesik.save({ useObjectStreams: false })], { type: 'application/pdf' });
    } catch (err) {
      bitir();
      return setMeta(`PDF dosyası yazılamadı: ${err?.message || err}`, true);
    }
    // A cancelled print produced nothing and is not recorded; a finished one is,
    // whichever way it reaches the user.
    const yazdirmaKaydi = {
      tur: 'yazdirma',
      zaman: Date.now(),
      evrak: secilen.length - kopyaAtlanan,
      sayfa: birlesik.getPageCount(),
      eklenemeyen: sorunlu.length,
      kaydedildi: false
    };
    try {
      setStatus('Yazdırma sekmesi açılıyor…');
      await ctx.yazdirmayaGonder?.(cikti, `${state.dosya.kok || 'UYAP Arsiv'}`);
      await islemKaydet(yazdirmaKaydi);
      if (state.yarim?.tur === 'yazdirma') await yarimKaydet(null);
    } catch (err) {
      // The archive is built; losing it to a blocked popup would waste the whole
      // run, so fall back to saving it and say where it went.
      const ad = `${(state.dosya.kok || 'UYAP Arsiv').replace(/[/\\]/g, '-')} yazdirma.pdf`;
      await ctx.saveBlob(cikti, `${state.kokKlasor}/${ad}`);
      await islemKaydet({ ...yazdirmaKaydi, kaydedildi: true });
      return setMeta(
        `${err?.message || err}\nBirleştirilmiş belge indirildi: ${ad} — açıp yazdırabilirsiniz.`,
        true
      );
    } finally {
      bitir();
    }

    setStatus(
      `${secilen.length - kopyaAtlanan} evrak, ${birlesik.getPageCount()} sayfa yazdırmaya hazır` +
        (kopyaAtlanan ? ` · ${kopyaAtlanan} evrak aynı içerikte olduğu için çıkarıldı` : '') +
        (sorunlu.length
          ? ` · ${sorunlu.length} evrak içeriğiyle eklenemedi, yerine açıklama sayfası kondu.` +
            // When every failure carries the same explanation, repeating it per
            // document buries it in a wall of identical text. Say it once.
            (ortakHata(sorunlu.map((x) => ({ error: x.sebep })))
              ? `\nSunucunun yanıtı: ${ortakHata(sorunlu.map((x) => ({ error: x.sebep })))}`
              : `\n${sorunlu.slice(0, 3).map((x) => `${x.ad}: ${x.sebep}`).join('\n')}` +
                (sorunlu.length > 3 ? `\n… ve ${sorunlu.length - 3} tane daha` : '')) +
            toplucaBasarisizUyarisi(sorunlu.length, secilen.length, sorunlu.map((x) => x.sebep))
          : '.') +
        `\nSüre: ${sureMetni(Date.now() - baslangic)}, bunun ${sureMetni(almaSuresi)} kadarı evrakların UYAP'tan alınması.`
    );
    if (sorunlu.length) console.warn('[UYAP Arşiv] yazdırmada sorunlu evraklar:', sorunlu);
  }

  /**
   * What a document is, from its bytes.
   *
   * Sniffed rather than trusted from the extension: UYAP does not always send
   * one, and a wrong guess means a blank page in the printout or a document the
   * search cannot read. Shared by printing and by the content search.
   */
  async function evrakBicimi(bytes, ev, icerikTuru = '') {
    // A zip is a UDF only if it holds one. UYAP also serves EYP packages —
    // "elektronik yargı paketi" — which are zips wrapping the real documents.
    // Treating every zip as a UDF made those fail with "content.xml yok" and
    // vanish from the printout, with the documents sitting inside untouched.
    if (bytes[0] === 0x50 && bytes[1] === 0x4b) {
      const girdiler = await zipIcerik(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length));
      if (girdiler.some((g) => g.ad === 'content.xml')) return 'udf';
      if (docxMi(girdiler)) return 'docx';
      // Office files are zips too. Searched for PDFs like a document package,
      // a bank statement reported as "içinde yazdırılabilir evrak bulunamadı"
      // while its table sat inside untouched.
      if (xlsxMi(girdiler)) return 'xlsx';
      return 'paket';
    }
    if (bytes[0] === 0x25 && bytes[1] === 0x50) return 'pdf';
    if (bytes[0] === 0x89 && bytes[1] === 0x50) return 'png';
    if (bytes[0] === 0xff && bytes[1] === 0xd8) return 'jpg';
    // TIFF: "II*\0" (little-endian) or "MM\0*" (big-endian).
    if ((bytes[0] === 0x49 && bytes[1] === 0x49) || (bytes[0] === 0x4d && bytes[1] === 0x4d)) return 'tif';
    // Receipts and cover slips — vekalet pulu makbuzu and the like — are
    // served as HTML by the portal itself. They are documents, not error
    // pages: the refusal check upstream has already let these through.
    if (htmlMi(bytes, icerikTuru)) return 'html';
    // KEP correspondence arrives as .eml; some documents are plain text.
    if (emlMi(bytes)) return 'eml';
    if (/^(txt|csv|log)$/i.test(ev?.uzanti || '') || duzMetinMi(bytes)) return 'metin';
    return 'bilinmiyor';
  }

  /**
   * The words of one document, for the content search.
   *
   * @returns {Promise<{metin: string, durum: 'metin'|'gorsel'|'bos'}>}
   *   'gorsel' for scans — pictures of text, which only OCR could read
   */
  async function evrakMetni(bytes, tur, pdfLib, derinlik = 0) {
    const ab = () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length);
    const paragrafMetni = (paragraflar) =>
      paragraflar.map((p) => (p.parcalar || []).map((x) => x.metin).join('')).join('\n');

    let metin = '';
    if (tur === 'udf') {
      const { xml } = await udfOku(ab());
      metin = paragrafMetni(udfCozumle(xml).paragraflar);
    } else if (tur === 'pdf') {
      metin = await pdfMetni(bytes, pdfLib);
    } else if (tur === 'html') {
      metin = paragrafMetni(htmlParagraflar(new TextDecoder('utf-8', { fatal: false }).decode(bytes)));
    } else if (tur === 'docx') {
      metin = paragrafMetni(await docxParagraflar(await zipIcerik(ab())));
    } else if (tur === 'eml') {
      metin = paragrafMetni(emlParagraflar(bytes));
    } else if (tur === 'metin') {
      metin = paragrafMetni(duzMetinParagraflar(bytes));
    } else if (tur === 'xlsx') {
      const sayfalar = await xlsxSayfalar(await zipIcerik(ab()));
      metin = sayfalar.map((s) => s.satirlar.map((r) => r.join(' ')).join('\n')).join('\n');
    } else if (tur === 'paket' && derinlik === 0) {
      // The documents inside a package, one level deep, as printing does.
      const parcalar = [];
      for (const girdi of (await zipIcerik(ab())).filter((g) => /\.(pdf|udf)$/i.test(g.ad))) {
        const ic = await girdi.oku();
        if (!ic) continue;
        const icTur = /\.udf$/i.test(girdi.ad) ? 'udf' : 'pdf';
        parcalar.push((await evrakMetni(ic, icTur, pdfLib, 1)).metin);
      }
      metin = parcalar.join('\n');
    } else if (['tif', 'png', 'jpg'].includes(tur)) {
      return { metin: '', durum: 'gorsel' };
    }

    metin = metin.slice(0, 2_000_000); // a runaway document must not take the tab with it
    // A PDF that yields nothing is almost always a scan saved as PDF.
    if (!metin.trim()) return { metin: '', durum: tur === 'pdf' ? 'gorsel' : 'bos' };
    return { metin, durum: 'metin' };
  }

  /**
   * Every page of a scan, decoded once: a TIFF may hold many sheets, a PNG one.
   *
   * One pass yields both things the run needs — the page compressed for the
   * printout (see src/lib/gorsel.js) and the key duplicate detection compares —
   * so the raw pixels, 35 MB for an A4 page at 300 dpi, can be dropped at once.
   * Decoding a scan is the most expensive thing here; it used to happen twice
   * for every TIFF, and then pdf-lib decoded the PNG we made from it a third
   * time.
   *
   * @param {boolean} [sikistir]  false when only the comparison key is wanted
   */
  async function gorselKareleri(bytes, tur, onbellek = null, sikistir = Boolean(onbellek)) {
    if (onbellek?.kareler) return onbellek.kareler;
    const kareler = [];
    const isle = async (rgba, genislik, yukseklik) => {
      const kare = sikistir ? await pikselSikistir(rgba, genislik, yukseklik) : { genislik, yukseklik };
      const piksel = new ImageData(new Uint8ClampedArray(rgba.buffer, rgba.byteOffset, rgba.length), genislik, yukseklik);
      kare.anahtar = await kucukResimAnahtari(piksel);
      kareler.push(kare);
    };

    if (tur === 'tif') {
      const { default: UTIF } = await import(chrome.runtime.getURL('vendor/utif.js'));
      const sayfalar = UTIF.decode(bytes.buffer ?? bytes);
      for (const sayfa of sayfalar) {
        await nefesAl();
        UTIF.decodeImage(bytes.buffer ?? bytes, sayfa, sayfalar);
        if (!sayfa.width || !sayfa.height) continue;
        await isle(UTIF.toRGBA8(sayfa), sayfa.width, sayfa.height);
      }
    } else {
      const bitmap = await createImageBitmap(new Blob([bytes]));
      const tuval = new OffscreenCanvas(bitmap.width, bitmap.height);
      const c = tuval.getContext('2d');
      c.drawImage(bitmap, 0, 0);
      const { data } = c.getImageData(0, 0, bitmap.width, bitmap.height);
      await isle(data, bitmap.width, bitmap.height);
      bitmap.close();
    }

    if (!kareler.length) throw new Error(tur === 'tif' ? 'TIFF çözümlenemedi.' : 'Görsel çözümlenemedi.');
    if (onbellek) onbellek.kareler = kareler;
    return kareler;
  }

  /**
   * Render one UDF, and don't spend a sheet of paper on two lines.
   *
   * Documents routinely spill their signature block — "Katip 123456 /
   * e-imzalıdır" — onto a page of its own. Nothing can be dropped: those lines
   * are part of the document. But the spacing around them is ours to set, so
   * when the last page is nearly empty the document is laid out again, slightly
   * tighter, and the tighter version is kept only if it actually saves a page.
   *
   * The text is never touched, only the leading and the top margin, and the
   * lightest setting that works is the one used.
   */
  async function udfPdf(fontlar, belge, baslik) {
    // Page geometry and footer come from the document, so the printed page
    // breaks land where UYAP's own do.
    const uret = (ayar) => {
      const y = new PdfYazici(fontlar, { altbilgi: belge.altbilgi, bicim: belge.sayfaBicimi, ...ayar });
      y.ustBilgi(baslik);
      for (const par of belge.paragraflar) y.paragraf(par);
      return y;
    };

    const normal = uret({});
    const kullanilabilir = normal.yukseklik - normal.ustKenar - normal.altKenar;
    const sonSayfaBos = normal.sonSayfaDoluluk < kullanilabilir * 0.25;

    if (state.sayfayaSigdir && normal.sayfalar.length > 1 && sonSayfaBos) {
      for (const sikilik of [0.04, 0.08, 0.12]) {
        const sikisik = uret({ sikilik, ustuKullan: true });
        if (sikisik.sayfalar.length < normal.sayfalar.length) {
          return new Uint8Array(await sikisik.bitir().arrayBuffer());
        }
      }
    }
    return new Uint8Array(await normal.bitir().arrayBuffer());
  }

  /**
   * Merge the documents inside a container (EYP and the like).
   *
   * One level deep, in the container's own order, and only the parts that are
   * documents — the manifests and signature files that travel with them are not
   * something anyone wants printed.
   */
  async function paketiAc(birlesik, PDFDocument, fontlar, parca, damgalar) {
    const ab = parca.bytes.buffer.slice(parca.bytes.byteOffset, parca.bytes.byteOffset + parca.bytes.length);
    const girdiler = (await zipIcerik(ab)).filter((g) => /\.(pdf|udf|tif|tiff|png|jpe?g)$/i.test(g.ad));

    if (!girdiler.length) {
      throw new Error('Paketin içinde yazdırılabilir evrak bulunamadı.');
    }

    let eklendi = 0;
    for (const girdi of girdiler) {
      const icerik = await girdi.oku();
      if (!icerik) continue;

      const altBaslik = `${parca.baslik} › ${girdi.ad}`;
      const uzanti = girdi.ad.split('.').pop().toLowerCase();

      if (uzanti === 'pdf') {
        const eklenen = await sayfalariAktar(birlesik, PDFDocument, icerik);
        await etiketBas(birlesik, PDFDocument, fontlar, eklenen, altBaslik, damgalar);
      } else if (uzanti === 'udf') {
        const { xml } = await udfOku(icerik.buffer.slice(icerik.byteOffset, icerik.byteOffset + icerik.length));
        await sayfalariAktar(birlesik, PDFDocument, await udfPdf(fontlar, udfCozumle(xml), altBaslik));
      } else {
        await gorseliEkle(birlesik, PDFDocument, fontlar, icerik, uzanti, altBaslik, damgalar);
      }
      eklendi++;
    }

    if (!eklendi) throw new Error('Paketin içindeki evraklar okunamadı.');
  }

  /** Place an image — or every page of a scan — on its own page. */
  async function gorseliEkle(birlesik, PDFDocument, fontlar, bytes, uzanti, baslik, damgalar) {
    const eklenen = [];
    if (uzanti === 'jpg' || uzanti === 'jpeg') {
      const gorsel = await birlesik.embedJpg(bytes);
      const olcek = Math.min(535 / gorsel.width, 760 / gorsel.height, 1);
      const sayfa = birlesik.addPage([595.28, 841.89]);
      sayfa.drawImage(gorsel, {
        x: 30,
        y: 841.89 - 40 - gorsel.height * olcek,
        width: gorsel.width * olcek,
        height: gorsel.height * olcek
      });
      eklenen.push(sayfa);
    } else {
      const pdfLib = await import(chrome.runtime.getURL('vendor/pdf-lib.esm.min.js'));
      const tur = uzanti === 'png' ? 'png' : 'tif';
      for (const kare of await gorselKareleri(bytes, tur)) eklenen.push(gorselSayfasiEkle(birlesik, pdfLib, kare));
    }
    await etiketBas(birlesik, PDFDocument, fontlar, eklenen, baslik, damgalar);
  }

  /**
   * What makes two documents "the same".
   *
   * Bytes, for anything textual: identical files hash identically. Images are
   * different. The same screenshot of a suspect, attached to four documents,
   * arrives four times with different container metadata — a TIFF header here, a
   * re-encode there — so the bytes differ while the picture does not, and byte
   * hashing let every copy through.
   *
   * So images are compared as pictures: decoded, scaled to a fixed width, and
   * hashed. The original dimensions go into the key as well, so two different
   * images cannot collide merely by reducing to a similar thumbnail.
   */
  async function icerikOzeti(bytes, onbellek = null) {
    const tur = gorselTuru(bytes);
    if (tur) {
      try {
        return await gorselOzeti(bytes, tur, onbellek);
      } catch {
        /* undecodable — fall back to the bytes, which is still better than nothing */
      }
    }
    return ozetle(bytes);
  }

  /**
   * Readable text rather than binary. Checked by sampling: a document with no
   * control characters and mostly printable bytes is text, whatever it is called.
   */
  function duzMetinMi(bytes) {
    const ornek = bytes.subarray(0, 1024);
    if (!ornek.length) return false;
    let kontrol = 0;
    for (const b of ornek) {
      if (b === 0) return false;
      if (b < 9 || (b > 13 && b < 32)) kontrol++;
    }
    return kontrol / ornek.length < 0.02;
  }

  /** png / jpg / tif, or empty when the bytes are not an image. */
  function gorselTuru(bytes) {
    if (bytes[0] === 0x89 && bytes[1] === 0x50) return 'png';
    if (bytes[0] === 0xff && bytes[1] === 0xd8) return 'jpg';
    if ((bytes[0] === 0x49 && bytes[1] === 0x49) || (bytes[0] === 0x4d && bytes[1] === 0x4d)) return 'tif';
    return '';
  }

  async function gorselOzeti(bytes, tur, onbellek = null) {
    const anahtarlar =
      tur === 'jpg'
        ? [await kucukResimAnahtari(new Blob([bytes]))]
        : (await gorselKareleri(bytes, tur, onbellek)).map((k) => k.anahtar);
    return `gorsel:${anahtarlar.join('|')}`;
  }

  /** A picture's comparison key: its size, and a hash of a 256-px-wide thumbnail. */
  async function kucukResimAnahtari(kaynak) {
    const bitmap = await createImageBitmap(kaynak);
    const en = 256;
    const boy = Math.max(1, Math.round((bitmap.height / bitmap.width) * en));

    const tuval = new OffscreenCanvas(en, boy);
    const ctx = tuval.getContext('2d');
    ctx.drawImage(bitmap, 0, 0, en, boy);
    const pikseller = new Uint8Array(ctx.getImageData(0, 0, en, boy).data.buffer);

    const anahtar = `${bitmap.width}x${bitmap.height}:${await ozetle(pikseller)}`;
    bitmap.close();
    return anahtar;
  }

  /**
   * A spreadsheet, on a page it actually fits.
   *
   * Portrait first; a wider table gets a landscape page; a table too wide even
   * for that is written out row by row as labelled lines. A bank statement has
   * twenty columns, and forcing those into A4 pushed the tab stops off the page
   * and ran the rows together.
   */
  async function xlsxPdf(fontlar, parca) {
    const girdiler = await zipIcerik(
      parca.bytes.buffer.slice(parca.bytes.byteOffset, parca.bytes.byteOffset + parca.bytes.length)
    );
    const sayfalar = await xlsxSayfalar(girdiler);
    if (!sayfalar.length) throw new Error('Elektronik tabloda veri bulunamadı.');

    const olc = (metin, boyut) => olcumYazicisi.olc(metin, false, boyut);
    const olcumYazicisi = new PdfYazici(fontlar);

    const dikey = olcumYazicisi.yaziGenisligi;
    const yatay = 841.89 - 2 * olcumYazicisi.solKenar;

    // Ask the layout what it needs before choosing the paper. Anything wider than
    // the portrait text column goes on landscape: whether it ends up as one wide
    // table or as column groups, the extra 250pt is the difference between two
    // groups and three, and every group repeats every row.
    const deneme = xlsxDuzen(sayfalar, olc, dikey);
    const yatayGerekli = deneme.gerekenGenislik > dikey;

    const yazici = yatayGerekli
      ? new PdfYazici(fontlar, { genislik: 841.89, yukseklik: 595.28 })
      : new PdfYazici(fontlar);

    const duzen = yatayGerekli ? xlsxDuzen(sayfalar, olc, yatay) : deneme;

    yazici.ustBilgi(parca.baslik);
    for (const par of duzen.paragraflar) yazici.paragraf(par);
    return new Uint8Array(await yazici.bitir().arrayBuffer());
  }

  /**
   * The line printed at the top of every page of a document.
   *
   * Number, date and name, then the file it came from — a bundle mixes the main
   * case with its linked soruşturma and talimat files, and on paper there is
   * nothing else to tell them apart. Annexes are stated too, including when they
   * were left out, so a document is never silently short of its exhibits.
   */
  function evrakEtiketi(ev, sira, ekSayaci, seciliEkler) {
    const parcalar = [String(sira).padStart(3, '0'), isoToStamp(ev.tarih), ev.ad];

    if (ev.ekMi && ev.anaAd) parcalar.push(`→ ${ev.anaAd}`);
    if (ev.kaynak) parcalar.push(ev.kaynak);

    const ekAdet = ekSayaci.get(ev.id) || 0;
    if (ekAdet) {
      const alinan = seciliEkler.get(ev.id) || 0;
      parcalar.push(
        alinan === ekAdet
          ? `${ekAdet} ek`
          : `${ekAdet} ek (${alinan ? `${ekAdet - alinan} tanesi ` : ''}çıktıya eklenmedi)`
      );
    }
    return parcalar.join(' · ');
  }

  /**
   * Give the browser a turn.
   *
   * Merging is unbroken CPU work: parsing PDFs, decoding scans, laying out text.
   * `await` alone does not help — it drains the microtask queue without ever
   * letting the page paint, so the panel froze at whatever it last said, Chrome
   * offered to kill the tab, and the fan ran flat out with nothing on screen to
   * show for it. Yielding to the task queue every 40ms costs almost nothing and
   * keeps the window answering.
   */
  async function nefesAl(zorla = false) {
    if (!zorla && Date.now() - sonNefes < 40) return;
    await new Promise((r) => setTimeout(r, 0));
    sonNefes = Date.now();
  }

  /** Copy every page of a PDF into the merged document, keeping order. */
  async function sayfalariAktar(hedef, PDFDocument, bytes) {
    const kaynak = await PDFDocument.load(bytes, { ignoreEncryption: true });
    const sayfalar = await hedef.copyPages(kaynak, kaynak.getPageIndices());
    for (const s of sayfalar) hedef.addPage(s);
    return sayfalar;
  }

  /**
   * Stamp the document marker onto pages this extension did not lay out.
   *
   * Only UDF pages are drawn by our own writer, so a copied PDF, a scan or an
   * image arrived in the bundle with no number on it — exactly the pages where a
   * number matters most, because they cannot be identified from their content.
   *
   * The marker is drawn by the same writer, into a one-page PDF, and that page is
   * embedded onto each target page. It reuses the Turkish font already in hand
   * instead of embedding a second one through fontkit.
   */
  async function etiketBas(birlesik, PDFDocument, fontlar, sayfalar, baslik, damgalar = null) {
    if (!sayfalar.length) return;

    // Prepared in bulk when the caller supplies the pool: one marker per document
    // used to mean one whole PDF written and parsed per document, which on a
    // large case file cost more than the merge itself.
    let damga = damgalar?.get(baslik);
    if (!damga) {
      const yazici = new PdfYazici(fontlar);
      yazici.ustBilgi(baslik);
      const kaynak = await PDFDocument.load(new Uint8Array(await yazici.bitir().arrayBuffer()));
      [damga] = await birlesik.embedPdf(kaynak, [0]);
      damgalar?.set(baslik, damga);
    }

    for (const sayfa of sayfalar) {
      // Aligned to the top-left of the target page, whatever its size: scans are
      // often not A4, and anchoring to the bottom would drift the marker down.
      // The marker sheet is always the writer's default A4; the target page may
      // be any size, so align by the top edge rather than a shared origin.
      sayfa.drawPage(damga, { x: 0, y: sayfa.getHeight() - 841.89 });
    }
  }

  /**
   * Contents page, bookmarks and page numbers, put into a finished bundle.
   *
   * The contents follow the print order, so their page numbers only ever go up.
   * Skipped copies are listed too, pointing at the document that carries their
   * content: a reader looking for "the fezleke attached to 012" should find it
   * in the contents even though it was printed only once. Bookmarks leave them
   * out — the side panel is for moving around, not for accounting.
   */
  async function dizinEkle(birlesik, pdfLib, fontlar, { sira, secilen, konumlar, kopyaKaynagi, kapakEklendi }) {
    const { PDFDocument } = pdfLib;
    const once = kapakEklendi ? 1 : 0;
    const numara = (ev) => String(state.evraklar.indexOf(ev) + 1).padStart(3, '0');

    const girdiler = [];
    for (const [i] of sira) {
      const kopya = !konumlar.has(i);
      const k = konumlar.get(kopya ? kopyaKaynagi.get(i) : i);
      if (!k) continue; // neither printed nor a copy of something printed
      const ev = secilen[i];
      girdiler.push({
        ev,
        kopya,
        hatali: !kopya && k.hatali,
        bas: k.bas,
        no: numara(ev),
        tarih: isoToStamp(ev.tarih),
        ad: ev.ad,
        kaynak: ev.kaynak,
        ekMi: ev.ekMi,
        not: kopya ? `aynı içerik: ${numara(secilen[kopyaKaynagi.get(i)])}` : k.hatali ? 'eklenemedi' : ''
      });
    }

    // Final page numbers: everything in front of the documents shifts them.
    const kaydirma = once + icindekilerSayfaSayisi(girdiler.length);
    for (const g of girdiler) g.sayfa = g.bas + kaydirma;

    const { bytes, baglantilar } = await icindekilerYaz(fontlar, girdiler, {
      baslik: state.dosya.kok || '',
      sira:
        (state.yazdirmaSirasi === 'yeniden'
          ? 'Evraklar en yeniden en eskiye dizilidir.'
          : 'Evraklar en eskiden en yeniye dizilidir.') + ' Sayfa numaraları her sayfanın sağ alt köşesindedir.'
    });
    const kaynak = await PDFDocument.load(bytes);
    // The page numbers written above assumed this count. If the two ever
    // disagreed every number would be off by the difference — refuse instead.
    if (kaynak.getPageCount() !== kaydirma - once) {
      throw new Error('İçindekiler sayfa sayısı hesaplanandan farklı çıktı.');
    }
    const sayfalar = await birlesik.copyPages(kaynak, kaynak.getPageIndices());
    sayfalar.forEach((s, j) => birlesik.insertPage(once + j, s));
    baglantilariEkle(birlesik, baglantilar, once);

    // Attachments fold under their parent when the parent is in the bundle.
    const etiket = (g) =>
      [g.no, g.tarih, g.ad, g.kaynak].filter(Boolean).join(' · ') + (g.hatali ? ' (eklenemedi)' : '');
    const anaDugumler = new Map();
    const dugumler = [];
    for (const g of girdiler) {
      if (g.kopya || g.ekMi) continue;
      g.dugum = { baslik: etiket(g), sayfa: g.sayfa, cocuklar: [] };
      const anahtar = `${g.ev.kaynak}|${g.ev.id}`;
      if (!anaDugumler.has(anahtar)) anaDugumler.set(anahtar, g.dugum);
    }
    for (const g of girdiler) {
      if (g.kopya) continue;
      if (!g.ekMi) {
        dugumler.push(g.dugum);
        continue;
      }
      const ana = anaDugumler.get(`${g.ev.kaynak}|${g.ev.parentId}`);
      const d = { baslik: etiket(g), sayfa: g.sayfa };
      if (ana) ana.cocuklar.push(d);
      else dugumler.push(d);
    }

    yerImleriEkle(birlesik, pdfLib, [
      ...(once ? [{ baslik: 'Kapak', sayfa: 0 }] : []),
      { baslik: 'İçindekiler', sayfa: once },
      ...dugumler
    ]);
    await sayfaNumaralari(birlesik, pdfLib, once);
  }

  /**
   * The bundle's front page.
   *
   * A cover, not an index: it identifies the file and then leaves ruled space
   * for what a printed dosya actually needs written on it — parties, hearing
   * dates, notes. Those are filled in by hand after printing, so the boxes are
   * empty by design; listing the documents here would only repeat what the
   * numbered pages behind it already say.
   */
  async function kapakSayfasi(fontlar, dahilEdilen, kopyaAtlanan = 0) {
    const y = new PdfYazici(fontlar);
    const sol = y.solKenar;
    const genislik = y.genislik - y.solKenar - y.sagKenar;

    // "2026-1234 Örnekköy 3. Asliye Ceza Mahkemesi - Ceza Dava Dosyası"
    const kok = state.dosya.kok || 'UYAP Dosyalama ve Evrak Asistanı';
    // "2026-1234 Örnekköy 3. Asliye Ceza Mahkemesi - Ceza Dava Dosyası" splits into
    // three facts a cover should state separately, not repeat as one string.
    // Two shapes reach here. The portal's own heading —
    // "2026-1234 Örnekköy 3. Asliye Ceza Mahkemesi - Ceza Dava Dosyası" — and the
    // API's fallback when that heading cannot be read: "2020-999(CBS Soruşturma
    // Dosyası)", which has no court in it at all.
    const apiBicimi = kok.match(/^(\S+?)\((.+)\)\s*$/);
    let dosyaNo;
    let mahkeme = '';
    let dosyaTuru = '';

    if (apiBicimi) {
      dosyaNo = apiBicimi[1].replace(/-/, '/');
      dosyaTuru = apiBicimi[2].trim();
    } else {
      const ayrisim = kok.match(/^(\S+)\s+(.*)$/);
      dosyaNo = (ayrisim ? ayrisim[1] : kok).replace(/-/, '/');
      const kalan = ayrisim ? ayrisim[2] : '';
      const bol = kalan.lastIndexOf(' - ');
      [mahkeme, dosyaTuru] =
        bol > 0 ? [kalan.slice(0, bol).trim(), kalan.slice(bol + 3).trim()] : [kalan, ''];
    }

    const ekAdet = dahilEdilen.filter((e) => e.ekMi).length;
    const tarihler = dahilEdilen.map((e) => e.tarih).filter(Boolean).sort();
    const ortala = (metin, boyut, kalin) => sol + genislik / 2 - y.olc(metin, kalin, boyut) / 2;

    let imlec = y.yukseklik - y.ustKenar;

    /* ------------------------------------------------------------- başlık */

    y.dolgu(sol, imlec - 74, genislik, 74, 0.97);
    y.dikdortgen(sol, imlec - 74, genislik, 74, { kalinlik: 1.1, gri: 0.25 });

    y.yaziKoy('T.C.', ortala('T.C.', 11, true), imlec - 20, { boyut: 11, kalin: true });

    // The court's name is the line someone reads first; give it the room, and
    // step the size down rather than let a long name run past the frame.
    const mahkemeMetni = mahkeme || dosyaNo;
    const mahkemeBoyut = y.olc(mahkemeMetni, true, 15) > genislik - 24 ? 12 : 15;
    y.yaziKoy(mahkemeMetni, ortala(mahkemeMetni, mahkemeBoyut, true), imlec - 42, {
      boyut: mahkemeBoyut,
      kalin: true
    });

    const altBaslik = [dosyaNo, dosyaTuru].filter(Boolean).join(' · ');
    y.yaziKoy(altBaslik, ortala(altBaslik, 10.5, false), imlec - 61, { boyut: 10.5 });

    imlec -= 74 + 22;

    /* -------------------------------------------------------------- künye */

    const satirlar = [
      ['Dosya No', dosyaNo],
      ['Mahkeme', mahkeme || '—'],
      ...(dosyaTuru ? [['Dosya türü', dosyaTuru]] : []),
      [
        'Evrak sayısı',
        `${dahilEdilen.length} (${dahilEdilen.length - ekAdet} ana, ${ekAdet} ek)` +
          (kopyaAtlanan ? ` · ${kopyaAtlanan} kopya çıkarıldı` : '')
      ],
      [
        'Tarih aralığı',
        tarihler.length ? `${isoToStamp(tarihler[0])} – ${isoToStamp(tarihler[tarihler.length - 1])}` : '—'
      ],
      ['Çıktı tarihi', new Date().toLocaleDateString('tr-TR')],
      // Left blank on purpose: the office's own file number is written by hand
      // when the bundle is filed, and the extension has no way to know it.
      ['Ofis dosya no', '']
    ];

    const kunyeYuksekligi = satirlar.length * 17 + 10;
    y.dikdortgen(sol, imlec - kunyeYuksekligi, genislik, kunyeYuksekligi, { kalinlik: 0.7, gri: 0.55 });

    let ky = imlec - 18;
    for (const [i, [etiket, deger]] of satirlar.entries()) {
      // A faint band behind alternate rows keeps each label with its value.
      if (i % 2 === 1) y.dolgu(sol + 1, ky - 5, genislik - 2, 17, 0.965);
      y.yaziKoy(etiket, sol + 10, ky, { boyut: 10, kalin: true });
      if (String(deger)) {
        y.yaziKoy(String(deger), sol + 118, ky, { boyut: 10 });
      } else {
        // A rule to write on, rather than an empty space that reads as an error.
        y.dikdortgen(sol + 118, ky - 3, genislik - 128 - 10, 0, { kalinlik: 0.5, gri: 0.6 });
      }
      ky -= 17;
    }

    imlec -= kunyeYuksekligi + 22;

    /* ------------------------------------------------- elle doldurulacaklar */

    const bolum = (baslik, satirAdet, satirYuksekligi = 19) => {
      const basYuksekligi = 19;
      const govde = satirAdet * satirYuksekligi;
      const ust = imlec;
      const alt = ust - basYuksekligi - govde;

      y.dolgu(sol, ust - basYuksekligi, genislik, basYuksekligi, 0.9);
      y.dikdortgen(sol, alt, genislik, basYuksekligi + govde, { kalinlik: 0.7, gri: 0.45 });
      y.dikdortgen(sol, ust - basYuksekligi, genislik, 0, { kalinlik: 0.7, gri: 0.45 });
      y.yaziKoy(baslik, sol + 10, ust - 13.5, { boyut: 10.5, kalin: true });

      for (let i = 1; i < satirAdet; i++) {
        y.dikdortgen(sol, ust - basYuksekligi - i * satirYuksekligi, genislik, 0, { kalinlik: 0.35, gri: 0.78 });
      }
      imlec = alt - 16;
    };

    // Parties are a handful of names; hearing dates accumulate over years, which
    // is the line a lawyer actually keeps adding to.
    bolum('Taraflar', 4);
    bolum('Duruşma / Keşif Tarihleri', 9);
    bolum('Notlar', 6);

    /* --------------------------------------------------------------- altlık */

    y.dikdortgen(sol, y.altKenar + 34, genislik, 0, { kalinlik: 0.5, gri: 0.75 });
    const notlar = [
      state.yazdirmaSirasi === 'yeniden'
        ? 'Evraklar en yeniden en eskiye dizilidir; kâğıtlar klasöre olduğu gibi konulunca en eski evrak altta kalır.'
        : 'Evraklar en eskiden en yeniye dizilidir.',
      'Her sayfa evrağın sıra numarasını taşır; 001 daima en eski evraktır.',
      'Eklenemeyen evrak varsa yerinde kırmızı bir uyarı sayfası bulunur.'
    ];
    let ny = y.altKenar + 24;
    for (const not of notlar) {
      y.yaziKoy(not, sol, ny, { boyut: 8 });
      ny -= 10;
    }

    return new Uint8Array(await y.bitir().arrayBuffer());
  }

  /**
   * The page that stands in for a document that could not be rendered.
   *
   * Printed in red, and it says the document's sequence number twice over: the
   * number is what lets the missing document be fetched by hand and slid back
   * into the right place in the bundle. A quiet grey note would be leafed past.
   */
  async function yerTutucuSayfa(fontlar, ev, sira, baslik, sebep) {
    const yazici = new PdfYazici(fontlar);
    yazici.ustBilgi(baslik);
    const no = String(sira).padStart(3, '0');

    const par = (metin, o = {}) => ({
      hiza: 'left',
      boyut: o.boyut || 12,
      ustBosluk: o.ust || 0,
      altBosluk: o.alt || 0,
      sekmeler: [],
      renk: o.renk,
      parcalar: [{ metin, kalin: Boolean(o.kalin), boyut: o.boyut || 12, renk: o.renk }]
    });

    yazici.paragraf(par(`${no} — BU EVRAK ÇIKTIYA EKLENEMEDİ`, { boyut: 14, kalin: true, ust: 30, alt: 14, renk: [0.72, 0.1, 0.1] }));
    yazici.paragraf(par(`Evrak: ${ev.ad}`, { alt: 2 }));
    yazici.paragraf(par(`Sıra no: ${no}   ·   Tarih: ${isoToStamp(ev.tarih)}   ·   Biçim: ${(ev.uzanti || 'bilinmiyor').toUpperCase()}`, { boyut: 11, alt: 2 }));
    yazici.paragraf(par(`Sebep: ${sebep}`, { boyut: 11, alt: 18, renk: [0.72, 0.1, 0.1] }));

    yazici.paragraf(
      par(
        'Bu evrak dosya için gerekliyse portaldan tek tek indirip çıktısını alın ve ' +
          `bu sayfanın yerine, ${no} numaralı sıraya yerleştirin. Diğer evraklar ` +
          'baştaki numaralarına göre sıralıdır; bu sayfayı çıkarıp yerine gerçek ' +
          'evrağı koyduğunuzda dosyanın kronolojisi bozulmaz.',
        { boyut: 11, renk: [0.72, 0.1, 0.1] }
      )
    );
    return new Uint8Array(await yazici.bitir().arrayBuffer());
  }

  /** Documents the scan would cover: everything the non-search filters keep. */
  function taranacaklar() {
    return state.evraklar.filter((ev) => elemeyiGecer(ev) && !state.icerikler.has(ev.uid));
  }

  /** The line beside the scan button: what has been read, what cannot be. */
  function icerikDurumuYaz() {
    const dugme = el.querySelector('[data-act="icerik-tara"]');
    const durum = el.querySelector('[data-role="icerik-durum"]');
    const kutu = el.querySelector('[data-act="ara"]');
    if (!dugme || !durum) return;

    const kalan = taranacaklar().length;
    const sayac = { metin: 0, gorsel: 0, bos: 0, hata: 0 };
    for (const ev of state.evraklar) {
      const i = state.icerikler.get(ev.uid);
      if (i) sayac[i.durum] = (sayac[i.durum] || 0) + 1;
    }
    const taranan = sayac.metin + sayac.gorsel + sayac.bos + sayac.hata;

    dugme.hidden = kalan === 0;
    dugme.textContent = taranan ? `Kalan ${kalan} Evrağı Tara` : `İçerikleri Tara (${kalan} evrak)`;
    durum.textContent = taranan
      ? `${sayac.metin} evrağın içinde aranıyor` +
        (sayac.gorsel ? ` · ${sayac.gorsel} taranmış görüntü, metin yok` : '') +
        (sayac.hata ? ` · ${sayac.hata} okunamadı` : '')
      : '';
    if (kutu) kutu.placeholder = sayac.metin ? 'Evrak adı, tür veya evrağın içinde ara…' : 'Evrak adı, taraf, tür ara…';
  }

  /**
   * Fetch the documents and read the words inside them.
   *
   * It costs what a download costs — one request per document, paced the same
   * way — which is why it waits for the button rather than running on every
   * listing. Documents already downloaded or printed in this listing come from
   * memory; a scanned document's bytes stay there too, so downloading or
   * printing it afterwards needs no second request.
   *
   * The text is kept in this page's memory and nowhere else.
   */
  async function icerikTara() {
    if (state.busy) return;
    const hedef = taranacaklar();
    if (!hedef.length) return icerikDurumuYaz();
    if (await engelBekleniyor()) return;
    state.engellendi = false;
    state.engelMetni = '';

    let pdfLib;
    try {
      pdfLib = await import(chrome.runtime.getURL('vendor/pdf-lib.esm.min.js'));
    } catch (err) {
      return setMeta(`Tarama bileşenleri yüklenemedi: ${err?.message || err}`, true);
    }

    state.busy = true;
    state.iptalEdildi = false;
    state.yetkiDustu = false;
    toggleRunButtons(true);

    const tahminci = sureTahminci(hedef.length);
    const queue = new TaskQueue({
      ...(await tempoBelirle()),
      izleyici: nabiz,
      onProgress: ({ done, total: t }) => {
        const fill = el.querySelector('[data-role="fill"]');
        if (fill) fill.style.width = t ? `${Math.round((done / t) * 100)}%` : '0%';
        const kalan = tahminci(done);
        setStatus(`Evrak içerikleri taranıyor: ${done}/${t}${kalan ? ` · ${kalan}` : ''}`);
      }
    });
    state.queue = queue;

    for (const ev of hedef) {
      queue.add(ev.uid, async () => {
        const blob = await evraginBaytlari(ev);
        const bytes = new Uint8Array(await blob.arrayBuffer());
        let sonuc;
        try {
          sonuc = await evrakMetni(bytes, await evrakBicimi(bytes, ev, blob.type), pdfLib);
        } catch (err) {
          // The document arrived but could not be read — an AES-256 PDF, a
          // damaged UDF. Recorded, so the summary can say so and a rescan does
          // not fetch it again for the same answer.
          sonuc = { metin: '', durum: 'hata', sebep: String(err?.message || err) };
        }
        state.icerikler.set(ev.uid, { ...sonuc, katli: katla(sonuc.metin) });
        await nefesAl();
        return true;
      });
    }

    const { failures } = await queue.run();
    tempoyuToparla();
    state.busy = false;
    state.queue = null;
    toggleRunButtons(false);

    let metinli = 0;
    let gorsel = 0;
    let okunamayan = 0;
    for (const ev of hedef) {
      const d = state.icerikler.get(ev.uid)?.durum;
      if (d === 'metin') metinli++;
      else if (d === 'gorsel') gorsel++;
      else if (d === 'hata') okunamayan++;
    }

    // The search may already be typed in; apply it to what was just read.
    filtreyiUygula();
    setStatus(
      (state.engellendi
        ? "UYAP erişimi durdurduğu için tarama kesildi. "
        : state.iptalEdildi
        ? 'Tarama iptal edildi. '
        : state.yetkiDustu
          ? 'Oturum düştüğü için tarama durdu; portala girip yeniden listeleyin. '
          : '') +
        `${metinli + gorsel + okunamayan} evrak tarandı: ${metinli} tanesinin içinde aranabiliyor` +
        (gorsel ? `, ${gorsel} tanesi taranmış görüntü (metin yok, aranamaz)` : '') +
        (okunamayan ? `, ${okunamayan} tanesi okunamadı` : '') +
        (failures.length ? `, ${failures.length} tanesi portaldan alınamadı (yeniden tarayabilirsiniz)` : '') +
        '.' +
        (state.engellendi ? engelYaniti() : '')
    );
  }

  /**
   * The spreadsheet index, put at the head of the case file's folder.
   *
   * It lists the whole case file, not only this run: a resumed download should
   * leave one complete index, not one per sitting. So every document of the
   * listing gets a row and a status — downloaded now or on an earlier visit, a
   * copy of another, refused (with the portal's reason), or not selected — and
   * every file that is in the folder gets a link. The file is replaced each
   * time; it describes the folder, and a stale second copy would contradict it.
   */
  async function dizinYaz(rows, zip) {
    const buSefer = new Map(rows.map((r) => [r.uid, r]));
    const total = state.evraklar.length;

    const satirlar = state.evraklar.map((ev, i) => {
      const r = buSefer.get(ev.uid);
      const kayitli = state.dosyaAdlari.get(ev.uid);
      let durum;
      let ad = '';

      if (r?.durum === 'indirildi') {
        durum = 'İndirildi';
        ad = r.dosyaAdi;
      } else if (r?.asil) {
        durum = 'Aynı içerik, ayrıca indirilmedi';
        ad = r.asil;
      } else if (r?.durum?.startsWith('hata: ')) {
        durum = `Alınamadı: ${r.durum.slice(6)}`;
      } else if (state.indirilen.has(ev.uid)) {
        durum = kayitli?.kopya ? 'Aynı içerik (önceki indirmede)' : 'Önceki indirmede alındı';
        ad = kayitli?.ad || '';
      } else if (!ev.indirilebilir) {
        durum = ev.yetkili === false ? 'Vekil kaydı yok, portal vermiyor' : 'Kimliği yok, indirilemez';
      } else {
        durum = 'Seçilmedi';
      }

      return {
        sira: i + 1,
        tarih: ev.tarih,
        tur: ev.tur,
        ad: ev.ad,
        aciklama: ev.aciklama || ev.birim || '',
        anaEvrak: ev.ekMi ? ev.anaAd || '' : '',
        kaynak: ev.kaynak || '(ana dosya)',
        dosyaAdi: ad,
        baglanti: ad,
        durum
      };
    });

    const ekSayisi = state.evraklar.filter((e) => e.ekMi).length;
    const klasordeki = satirlar.filter((s) => s.baglanti).length;
    const blob = excelDizini({
      baslik: state.dosya.kok || 'UYAP Dosyalama ve Evrak Asistanı',
      altBaslik:
        `Oluşturma: ${tarihSaat(Date.now())} · ${total} evrak (${total - ekSayisi} ana, ${ekSayisi} ek)` +
        ` · ${klasordeki} tanesi bu klasörde · UYAP Dosyalama ve Evrak Asistanı`,
      satirlar
    });

    // Same folder as the documents; 000 sorts it ahead of 001.
    const ornek = buildPath({ root: state.kokKlasor, dosya: state.dosya, evrak: state.evraklar[0], index: 1, total });
    const yol = `${ornek.slice(0, ornek.lastIndexOf('/'))}/000_Evrak Dizini.xlsx`;

    if (zip) zip.ekle(yol, new Uint8Array(await blob.arrayBuffer()));
    else await ctx.saveBlob(blob, yol, { uzerineYaz: true });
  }

  async function indir() {
    if (state.busy) return;
    if (await engelBekleniyor()) return;
    state.engellendi = false;
    state.engelMetni = '';
    state.reddedilenler = new Set();
    state.busy = true;
    toggleRunButtons(true);

    const secilen = state.evraklar.filter((e) => state.secili.has(e.uid) && e.indirilebilir);
    const total = state.evraklar.length;
    const rows = [];
    state.yetkiDustu = false;
    state.iptalEdildi = false;
    const zip = state.zipModu ? new ZipYazici() : null;
    // In zip mode a document is on disk only once the zip is delivered; until
    // then it must not count as downloaded, or a stopped run loses it for good.
    const zipdekiler = new Set();
    state.ozetler = new Map();
    let kopya = 0;

    // Duplicate verdicts are taken in selection order (see siraKapisi). The
    // position is the document's place in this selection, not in the listing:
    // unselected documents never arrive, and waiting for them hung the run.
    const kapi = siraKapisi();
    const konum = new Map(secilen.map((ev, i) => [ev.uid, i]));

    const tahminci = sureTahminci(secilen.length);
    const queue = new TaskQueue({
      // See ISTEK_TEMPOSU: UYAP is shared public infrastructure, and it
      // suspends access that comes faster than this.
      ...(await tempoBelirle()),
      izleyici: nabiz,
      onProgress: ({ done, total: t, failed }) => setProgress(done, t, failed, tahminci(done)),
      // A document that failed for good will never take its verdict; release
      // the ones queued behind it.
      onSettled: ({ label }) => kapi.tamamla(konum.get(label))
    });
    state.queue = queue;

    for (const [sira, ev] of secilen.entries()) {
      const index = state.evraklar.indexOf(ev) + 1;

      queue.add(ev.uid, async () => {
        markRow(ev.uid, 'running');
        const blob = await evraginBaytlari(ev);

        // Path is built after the fetch, so the extension matches what UYAP actually sent.
        const path = buildPath({ root: state.kokKlasor, dosya: state.dosya, evrak: ev, index, total });
        const bytes = new Uint8Array(await blob.arrayBuffer());

        // Compare the bytes, not the name or the size: the same document arrives
        // under different names across a case file, and unrelated documents share
        // a size often enough to make size a bad test.
        //
        // The decision waits its turn in list order. Three workers run at once, so
        // whichever request finished first used to claim the content and the
        // document that finished later was called the copy — meaning an exhibit
        // could be dropped from where it was first used and kept where it was
        // merely repeated. Downloads stay parallel; only the verdict is ordered.
        if (state.kopyaAtla) {
          // Images are compared as pictures, not as bytes: the same screenshot
          // attached to four documents arrives with different container metadata
          // each time, so byte hashing let every copy through.
          const ozet = await icerikOzeti(bytes);
          await kapi.bekle(sira);
          const onceki = state.ozetler.get(ozet);
          // A retry after a failed save comes back here and finds its own entry;
          // that is not a copy of anything.
          if (onceki && onceki.sira !== sira) {
            kopya++;
            // Handled: a resume must not fetch it again.
            if (zip) zipdekiler.add(ev.uid);
            else {
              state.indirilen.add(ev.uid);
              indirilenKaydetPlanla();
            }
            markRow(ev.uid, 'kopya', `Aynı içerik: ${onceki.ad}`);
            rows.push({ ...satir(ev, index, '', `kopya (${onceki.ad})`), asil: onceki.ad });
            state.dosyaAdlari.set(ev.uid, { ad: onceki.ad, kopya: true });
            kapi.tamamla(sira);
            return null;
          }
          state.ozetler.set(ozet, { ad: path.split('/').pop(), sira });
          // Decided: the documents behind this one need not wait for the save.
          kapi.tamamla(sira);
        }

        if (zip) {
          // Held in memory until the run ends: the ZIP central directory can only
          // be written once every entry's offset is known.
          zip.ekle(path, bytes);
        } else {
          await ctx.saveBlob(blob, path);
        }

        if (zip) zipdekiler.add(ev.uid);
        else {
          state.indirilen.add(ev.uid);
          indirilenKaydetPlanla();
        }
        state.dosyaAdlari.set(ev.uid, { ad: path.split('/').pop() });
        markRow(ev.uid, 'done');
        rows.push(satir(ev, index, path.split('/').pop(), 'indirildi'));
        return path;
      });
    }

    const { failures } = await queue.run();
    tempoyuToparla();

    for (const f of failures) {
      // Matched by uid: document names repeat by the dozen in a case file.
      const ev = secilen.find((e) => e.uid === f.label);
      if (ev) {
        markRow(ev.uid, 'failed', f.error);
        rows.push(satir(ev, state.evraklar.indexOf(ev) + 1, '', `hata: ${f.error}`));
      }
    }

    // Resuming does not depend on the index: the record of what has already been
    // downloaded lives in the browser's own storage, not in a file beside the
    // documents. The index is for the reader.
    rows.sort((a, b) => a.sira - b.sira);

    // The documents are on disk whatever happens here. A failed write used to
    // throw past the lines that end the run, and the panel stayed busy with
    // every button disabled until the page was reloaded.
    // Before the zip is closed, so the index travels inside it.
    let dizinHatasi = '';
    if (state.excelDizini && rows.length) {
      setStatus('Excel dizini hazırlanıyor…');
      try {
        await dizinYaz(rows, zip);
      } catch (err) {
        console.error('[UYAP Arşiv] Excel dizini yazılamadı', err);
        dizinHatasi = `\nExcel dizini yazılamadı: ${err?.message || err}`;
      }
    }

    // A stopped run still delivers what it fetched, named as a part: those
    // documents existed only in memory, and a resume skips what counts as
    // downloaded. Holding the zip back used to lose them for good.
    const kesildi = state.engellendi || state.iptalEdildi || state.yetkiDustu;
    if (zip && rows.some((r) => r.durum === 'indirildi')) {
      setStatus('Zip dosyası hazırlanıyor…');
      try {
        const arsiv = zip.bitir();
        const ad = sanitizeSegment(state.dosya.kok || 'UYAP Arsiv', 100) + (kesildi ? ' (yarım).zip' : '.zip');
        await ctx.zipIndir?.(arsiv, ad);
        for (const uid of zipdekiler) state.indirilen.add(uid);
        setStatus(`Zip hazır: ${ad} (${(arsiv.size / 1048576).toFixed(1)} MB)`);
      } catch (err) {
        console.error('[UYAP Arşiv] zip hatası', err);
        setMeta(`Zip oluşturulamadı: ${err?.message || err}`, true);
      }
    }

    clearTimeout(state.indirilenZamanlayici);
    state.indirilenZamanlayici = null;
    let gecmisHatasi = '';
    try {
      await chrome.storage.local.set({ [state.gecmisAnahtari]: [...state.indirilen] });
    } catch (err) {
      console.error('[UYAP Arşiv] indirme kaydı yazılamadı', err);
      gecmisHatasi =
        '\nİndirilen evrakların kaydı tutulamadı; bu dosyada "Sadece İndirilmemişler" ' +
        `eksik çalışabilir. (${err?.message || err})`;
    }
    try {
      await chrome.storage.local.set({ [state.adlarAnahtari]: Object.fromEntries(state.dosyaAdlari) });
    } catch (err) {
      console.warn('[UYAP Arşiv] dosya adları kaydedilemedi', err); // only later indexes lose links
    }

    // What is left of this selection, minus what UYAP refused outright: that is
    // what "Kaldığı Yerden Devam Et" will ask for.
    const kalanlar = secilen.filter((e) => !state.indirilen.has(e.uid) && !state.reddedilenler.has(e.uid));
    if (kalanlar.length) {
      await yarimKaydet({ tur: 'indirme', uids: kalanlar.map((e) => e.uid), toplam: secilen.length, zaman: Date.now() });
    } else if (state.yarim?.tur === 'indirme') {
      await yarimKaydet(null);
    }

    state.busy = false;
    state.queue = null;
    toggleRunButtons(false);

    if (state.bildirimAcik && failures.length) {
      await ctx.bildir?.({ basarisiz: failures.length, toplam: rows.length, sebep: ortakHata(failures) });
    }
    // Recorded even when cancelled: what did arrive is on disk, and the history
    // should say so.
    await islemKaydet({
      tur: 'indirme',
      zaman: Date.now(),
      indirilen: rows.filter((r) => r.durum === 'indirildi').length,
      kopya,
      hata: failures.length,
      zip: Boolean(zip),
      iptal: state.iptalEdildi,
      oturumDustu: Boolean(state.yetkiDustu)
    });
    setStatus(
      (state.engellendi
        ? `UYAP erişimi durdurduğu için indirme kesildi. ${rows.filter((r) => r.durum === 'indirildi').length} evrak indi ve korunuyor; ` +
          "bekleme bitince Kaldığı Yerden Devam Et'e basın." + engelYaniti()
        : state.iptalEdildi
        ? `İndirme iptal edildi. ${rows.filter((r) => r.durum === 'indirildi').length} evrak indi; ` +
          "devam etmek için Kaldığı Yerden Devam Et'e basın."
        : state.yetkiDustu
        ? `Oturum düştü, indirme durduruldu. ${rows.filter((r) => r.durum === 'indirildi').length} evrak indi. ` +
          "Portala yeniden girip dosyayı listeleyin, sonra Kaldığı Yerden Devam Et'e basın."
        : failures.length
          ? `Bitti. ${rows.length - failures.length - kopya} evrak indirildi` +
            (kopya ? `, ${kopya} tanesi aynı içerikte olduğu için atlandı` : '') +
            `, ${failures.length} tanesi alınamadı.` +
            // When every failure carries the same explanation, it is a fact about
            // the case file, not about the documents — say it once, plainly,
            // instead of hiding it in a tooltip on each of four hundred rows.
            (ortakHata(failures) ? `\nSunucunun yanıtı: ${ortakHata(failures)}` : ' Listede işaretlendi.') +
            toplucaBasarisizUyarisi(failures.length, rows.length, failures.map((f) => f.error))
          : `Bitti. ${rows.length - kopya} evrak indirildi` +
            (kopya ? `, ${kopya} tanesi aynı içerikte olduğu için atlandı.` : '.')) + gecmisHatasi + dizinHatasi
    );
    updateFoot();
  }

  function togglePause(btn) {
    if (!state.queue) return;
    if (state.queue.paused) {
      state.queue.resume();
      btn.textContent = 'Duraklat';
    } else {
      state.queue.pause();
      btn.textContent = 'Sürdür';
    }
  }

  /* -------------------------------------------------------------- utilities */

  function toggleRunButtons(running) {
    // A run has started, so no wait is in force: the button would only undo
    // a block this run might still hit.
    if (running) engelDugmesiniGoster(false);
    if (running) nabizBaslat();
    else nabizDurdur();
    el.querySelector('[data-act="pause"]').hidden = !running;
    el.querySelector('[data-act="stop"]').hidden = !running;
    // Both long-running actions are blocked while either is in flight, and both
    // can be cancelled: closing the tab was the only way out of a print run.
    el.querySelector('[data-act="download"]').disabled = running;
    const p = el.querySelector('[data-act="print"]');
    if (p) p.disabled = running;
    if (running) {
      const y = el.querySelector('[data-role="yarim"]');
      if (y) y.hidden = true;
    } else {
      yarimCiz();
      hizAciklamasiYaz();
    }
  }

  /* --------------------------------------------------------- resuming */

  /**
   * Remember (or forget) a run that stopped before the end — a UYAP block, a
   * cancel, an expired session — under this case file, so that one button picks
   * it up again, after the pause or after a reload. Downloads resume from what
   * is on disk. A print resumes from what is still in this page's memory.
   */
  async function yarimKaydet(kayit) {
    state.yarim = kayit;
    if (state.yarimAnahtari) {
      try {
        if (kayit) await chrome.storage.local.set({ [state.yarimAnahtari]: kayit });
        else await chrome.storage.local.remove(state.yarimAnahtari);
      } catch {
        /* still offered for as long as this page is open */
      }
    }
    yarimCiz();
  }

  function yarimCiz() {
    const kutu = el.querySelector('[data-role="yarim"]');
    if (!kutu) return;
    const y = state.yarim;
    kutu.hidden = !y || state.busy;
    if (!y) return;
    let metin;
    if (y.tur === 'indirme') {
      const kalan = y.uids.filter((u) => !state.indirilen.has(u)).length;
      metin =
        `Yarım kalan indirme: ${kalan} evrak kaldı (${y.toplam} evraktan ${y.toplam - kalan} tanesi indi). ` +
        'İnmiş evraklar yeniden istenmez.';
    } else {
      const bellekte = y.uids.filter((u) => state.onbellek.has(u)).length;
      metin =
        `Yarım kalan yazdırma: ${y.uids.length} evrak. ` +
        (bellekte
          ? `${bellekte} tanesi alındı ve bu sayfada bekliyor; devam edince yalnızca kalanlar istenir. ` +
            'Sayfayı kapatmayın ya da yenilemeyin.'
          : 'Sayfa yenilendiği için alınmış evraklar bellekte değil; devam edince yeniden istenecek.');
    }
    kutu.querySelector('[data-role="yarim-metin"]').textContent = metin;
    yarimBeklemesiniYaz(kutu);
  }

  /**
   * While UYAP's pause lasts the resume button is closed and says when it
   * opens, then opens by itself. Pressed during the pause it used to repeat the
   * same warning and look as if it did nothing.
   */
  async function yarimBeklemesiniYaz(kutu) {
    clearTimeout(state.yarimSayaci);
    const { kalan } = await engelDurumu();
    const dugme = kutu.querySelector('[data-act="devam"]');
    const not = kutu.querySelector('[data-role="yarim-bekleme"]');
    if (!dugme || !not) return;
    const dk = Math.max(1, Math.ceil(kalan / 60_000));
    dugme.disabled = kalan > 0;
    dugme.textContent = kalan > 0 ? `Kaldığı Yerden Devam Et (${dk} dk sonra)` : 'Kaldığı Yerden Devam Et';
    not.hidden = !kalan;
    not.textContent = kalan
      ? `UYAP'ın beklemesi sürüyor; düğme ${dk} dakika sonra kendiliğinden açılır.`
      : '';
    if (kalan > 0) state.yarimSayaci = setTimeout(yarimCiz, Math.min(kalan + 500, 30_000));
  }

  /** Pick the stopped run up again: the same documents, minus what is already done. */
  async function devamEt() {
    const y = state.yarim;
    if (!y || state.busy) return;
    const mevcut = new Set(state.evraklar.map((e) => e.uid));
    const uids = y.uids.filter((u) => mevcut.has(u) && (y.tur !== 'indirme' || !state.indirilen.has(u)));
    if (!uids.length) return yarimKaydet(null);
    // Directly, not through the filters: a document the search box happens to
    // hide is still part of the run being resumed.
    state.secili = new Set(uids);
    for (const row of el.querySelectorAll('.ua-row')) {
      const box = row.querySelector('input');
      if (box) box.checked = state.secili.has(row.dataset.id);
    }
    updateFoot();
    return y.tur === 'indirme' ? indir() : yazdir();
  }

  /**
   * The record of what is on disk, written as the run goes rather than only at
   * its end: a tab closed halfway used to forget everything downloaded so far,
   * and the resume fetched it all again.
   */
  function indirilenKaydetPlanla() {
    if (state.indirilenZamanlayici) return;
    state.indirilenZamanlayici = setTimeout(async () => {
      state.indirilenZamanlayici = null;
      try {
        await chrome.storage.local.set({ [state.gecmisAnahtari]: [...state.indirilen] });
      } catch {
        /* written again at the end of the run */
      }
    }, 3000);
  }

  function markRow(id, s, title = '') {
    const row = el.querySelector(`.ua-row[data-id="${CSS.escape(id)}"]`);
    if (!row) return;
    row.classList.remove('is-running', 'is-done', 'is-failed', 'is-kopya');
    row.classList.add(`is-${s}`);
    const cell = row.querySelector('[data-role="state"]');
    cell.textContent = s === 'done' ? '✓' : s === 'failed' ? '!' : s === 'kopya' ? '=' : '·';
    cell.title = title;
    if (s === 'running') row.scrollIntoView({ block: 'nearest' });
  }

  function setProgress(done, total, failed, kalan = '') {
    const fill = el.querySelector('[data-role="fill"]');
    if (fill) fill.style.width = total ? `${Math.round((done / total) * 100)}%` : '0%';
    setStatus(
      `${done}/${total} indirildi${failed ? ` · ${failed} hata` : ''}${kalan ? ` · ${kalan}` : ''}`
    );
  }

  function setStatus(text) {
    const s = el.querySelector('[data-role="status"]');
    if (!s || s.textContent === text) return;
    s.textContent = text;
    nabiz.ilerledi();
  }

  /**
   * UYAP has suspended access: stop everything now, remember when, and fail
   * this document with an error the queue will not retry.
   */
  function engelle(metin) {
    if (metin) state.engelMetni = String(metin);
    if (!state.engelKorumasi) throw new ErisimEngeli();
    if (!state.engellendi) {
      state.engellendi = true;
      state.queue?.abort();
      state.engelKaydi = engelKaydet();
    }
    throw new ErisimEngeli();
  }

  /**
   * UYAP's own words from the block, quoted under the panel's message, so the
   * user sees exactly what the server answered rather than only our summary.
   */
  function engelYaniti(metin = state.engelMetni) {
    const t = String(metin || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 300);
    return t ? `\nUYAP'ın yanıtı: "${t}"` : '';
  }

  /**
   * Record a block: when, how many in a row (each one waits longer, see
   * src/lib/engel.js), and a slower pace for the runs after it.
   * @returns {Promise<{kalan: number, sayi: number}>}
   */
  async function engelKaydet() {
    const simdi = Date.now();
    const ilerledi = (state.alinanBuIs || 0) > 0;
    let kayit = yeniEngel(null, 0, simdi);
    try {
      const o = await chrome.storage.local.get(['uyapEngeli', 'uyapEngelSayisi', 'istekYavaslatma']);
      kayit = yeniEngel(o.uyapEngeli, o.uyapEngelSayisi, simdi);
      await chrome.storage.local.set({
        ...kayit,
        uyapEngelIlerledi: ilerledi,
        istekYavaslatma: Math.min(YAVASLATMA_SINIRI, (o.istekYavaslatma || 1) * 2)
      });
    } catch {
      /* storage unavailable: the message still says to wait */
    }
    return { kalan: engelBeklemesi(kayit.uyapEngelSayisi), sayi: kayit.uyapEngelSayisi, ilerledi };
  }

  /** How long UYAP's pause still has to run, and how it came about. */
  async function engelDurumu() {
    if (!state.engelKorumasi) return { kalan: 0, sayi: 1, ilerledi: false };
    try {
      const o = await chrome.storage.local.get(['uyapEngeli', 'uyapEngelSayisi', 'uyapEngelIlerledi']);
      const sayi = o.uyapEngelSayisi || 1;
      return { kalan: engelKalan(o.uyapEngeli, Date.now(), sayi), sayi, ilerledi: o.uyapEngelIlerledi === true };
    } catch {
      return { kalan: 0, sayi: 1, ilerledi: false }; // storage unavailable: do not block on it
    }
  }

  /**
   * The pace for the run about to start: ISTEK_TEMPOSU, slowed by whatever the
   * last block left behind. One request at a time while slowed.
   */
  async function tempoBelirle() {
    let m = 1;
    if (state.engelKorumasi) {
      try {
        m = (await chrome.storage.local.get('istekYavaslatma')).istekYavaslatma || 1;
      } catch {
        /* storage unavailable: the base pace */
      }
    }
    state.yavaslatma = m;
    state.alinanBuIs = 0; // a new run: nothing has arrived from UYAP yet
    state.tempo = {
      concurrency: ISTEK_TEMPOSU.concurrency,
      minDelayMs: Math.round(ISTEK_TEMPOSU.minDelayMs * m),
      jitterMs: Math.round(ISTEK_TEMPOSU.jitterMs * m),
      maxRetries: ISTEK_TEMPOSU.maxRetries
    };
    return state.tempo;
  }

  /** A run of some size finished without a block: give back a little speed. */
  async function tempoyuToparla() {
    // Only documents that actually came from UYAP in this run count. Ones served
    // from this page's memory sent no request, so they say nothing about
    // whether a block has lifted.
    const alinan = state.alinanBuIs || 0;
    if (state.engellendi || !alinan) return;
    try {
      // Documents arrived: whatever block there was has lifted, and the next one
      // starts the count again.
      const { uyapEngelSayisi } = await chrome.storage.local.get('uyapEngelSayisi');
      if (uyapEngelSayisi) await chrome.storage.local.set({ uyapEngelSayisi: 0 });
    } catch {
      /* not worth failing a finished run over */
    }
    if (alinan < 20) return;
    try {
      const { istekYavaslatma: m } = await chrome.storage.local.get('istekYavaslatma');
      if (m > 1) await chrome.storage.local.set({ istekYavaslatma: Math.max(1, Math.round(m * 0.85 * 100) / 100) });
    } catch {
      /* not worth failing a finished run over */
    }
  }

  /**
   * After a block, no new bulk run for a while: walking straight back in only
   * extends it. Says how long is left and returns true while that lasts.
   */
  async function engelBekleniyor() {
    if (!state.engelKorumasi) return false;
    const { kalan, sayi, ilerledi } = await engelDurumu();
    if (!kalan) return false;
    setMeta(engelMesaji(kalan, sayi, ilerledi) + '\n(Ayarlar\'dan bu beklemeyi kapatabilir ya da aşağıdaki "Beklemeyi Kaldır" ile hemen deneyebilirsiniz.)', true);
    state.beklemeMesaji = true;
    engelDugmesiniGoster(true);
    return true;
  }

  /**
   * The block option is shared by every UYAP tab and by the hearings section,
   * which follows it live. Follow it here too, so a tab opened earlier does not
   * keep waiting on blocks after the option was turned off in another one.
   */
  function ayarDegisiminiIzle() {
    globalThis.chrome?.storage?.onChanged?.addListener?.((d, alan) => {
      if (alan !== 'local' || !('engelKorumasi' in d)) return;
      state.engelKorumasi = d.engelKorumasi.newValue !== false;
      const kutu = el.querySelector('[data-act="engel-koruma"]');
      if (kutu) kutu.checked = state.engelKorumasi;
      yarimCiz();
    });
  }

  /** Clear every trace of a past block, so nothing holds the next run back. */
  async function engeliSifirla() {
    try {
      await chrome.storage.local.remove(['uyapEngeli', 'uyapEngelSayisi', 'uyapEngelIlerledi', 'istekYavaslatma']);
    } catch {
      /* nothing to clear if storage is unavailable */
    }
    state.yavaslatma = 1;
    state.engellendi = false;
    state.engelMetni = '';
    state.engelKaydi = null;
    engelDugmesiniGoster(false);
    hizAciklamasiYaz();
    yarimCiz();
    if (state.beklemeMesaji) setMeta('Bekleme kaldırıldı. Şimdi yeniden İndir ya da Yazdır diyebilirsiniz.', false);
  }

  /** The "Beklemeyi Kaldır" button, shown only while a self-imposed wait is in force. */
  function engelDugmesiniGoster(goster) {
    const b = el.querySelector('[data-act="engel-kaldir"]');
    if (b) b.hidden = !goster;
  }

  /** The progress bar alone, for phases that count something other than downloads. */
  function cubuk(done, total) {
    const fill = el.querySelector('[data-role="fill"]');
    if (fill) fill.style.width = total ? `${Math.round((done / total) * 100)}%` : '0%';
  }

  /* ------------------------------------------------------------------ pulse */

  /**
   * A line that changes every second while a run is in progress: elapsed time,
   * the document being waited on, and a plain warning when nothing has moved
   * for too long. Drawn by a timer on purpose — if the page itself freezes, the
   * seconds stop and the dot stops blinking, which is the honest signal.
   */
  function nabizBaslat() {
    nabiz.basla();
    donma = { sure: 0, zaman: 0 };
    sonTik = Date.now();
    const kutu = el.querySelector('[data-role="nabiz"]');
    if (kutu) kutu.hidden = false;
    clearInterval(nabizSayaci);
    nabizSayaci = setInterval(nabizCiz, 1000);
    nabizCiz();
  }

  function nabizDurdur() {
    clearInterval(nabizSayaci);
    nabizSayaci = null;
    const kutu = el.querySelector('[data-role="nabiz"]');
    if (kutu) kutu.hidden = true;
  }

  function nabizCiz() {
    const simdi = Date.now();
    // A tick that arrives seconds late means the page could not run at all for
    // that long: heavy work on one document, not a hang — but worth saying.
    if (simdi - sonTik > 2500) donma = { sure: simdi - sonTik - 1000, zaman: simdi };
    sonTik = simdi;
    const kutu = el.querySelector('[data-role="nabiz"]');
    if (!kutu) return;
    const { metin, uyari } = nabizMetni(nabiz.ozet(), {
      duraklatildi: Boolean(state.queue?.paused),
      donma: simdi - donma.zaman < 15_000 ? donma.sure : 0
    });
    kutu.querySelector('[data-role="nabiz-metin"]').textContent = metin;
    kutu.classList.toggle('is-uyari', uyari);
    kutu.classList.toggle('is-tik');
  }

  /** "013 · Bilirkişi Raporu" for a document's uid. */
  function nabizEtiketi(uid) {
    const i = state.evraklar.findIndex((e) => e.uid === uid);
    if (i < 0) return String(uid);
    const ad = state.evraklar[i].ad || '';
    return `${String(i + 1).padStart(3, '0')} · ${ad.length > 48 ? ad.slice(0, 47) + '…' : ad}`;
  }

  /** The panel should say what it knows, not wait to be asked. */
  async function tanıYaz() {
    const pathname = new URL(ctx.preset.endpoints.evrakListesi.path, location.origin).pathname;
    const hazir = ((await ctx.getRequests?.(pathname)) || []).length > 0 || Boolean(currentDosyaId());

    // Neither message mentions captured requests any more. How the panel learns
    // what to ask the portal is its own business; the reader needs the next step.
    setMeta(
      hazir
        ? 'Hazır. Evrakları Listele\'ye basabilirsiniz.'
        : 'Başlamak için:\n1. Bir dava dosyası açın\n2. Evrak sekmesine girin\n3. Evrakları Listele\'ye basın',
      false // an instruction, not a fault: the red error styling would misread it
    );
  }

  function setMeta(text, isError = false) {
    const m = el.querySelector('[data-role="meta"]');
    if (!m) return;
    state.beklemeMesaji = false;
    m.textContent = text;
    m.classList.toggle('is-error', isError);
  }

  function mesaj(err) {
    if (eklentiKoptuMu(err)) return YENILE_MESAJI;
    if (err?.status === 401 || err?.status === 403) return 'Oturum düştü. Portala yeniden girip tekrar deneyin.';
    if (err?.status === 429) return 'UYAP şu an istekleri kısıtlıyor. Birkaç dakika sonra tekrar deneyin.';
    return String(err?.message || err);
  }
}

/** The case-file id inside a captured request body, whatever shape it takes. */
function govdedekiDosyaId(body) {
  try {
    const v = JSON.parse(body || '{}');
    if (v.dosyaId || v.DOSYAID) return String(v.dosyaId || v.DOSYAID);
  } catch {
    /* not JSON — fall through to the pattern below */
  }
  const m = /dosyaId["']?\s*[:=]\s*["']?("?[^"'&,}\s]+"?)/i.exec(String(body || ''));
  return m ? m[1] : '';
}

/**
 * Case files are told apart by the leading characters of their id.
 *
 * UYAP re-encrypts the id on every response, but the first ~20 characters stay
 * the same for a given file and differ between files. Comparing whole tokens
 * would treat two listings of one file as two files; comparing the prefix
 * keeps them together while still separating 2026/1234 from 2020/999.
 */
const dosyaOneki = (id) => String(id || '').replace(/^"/, '').slice(0, 20);

/**
 * How much of a case file may stay in memory between operations.
 * 120 MB covers a normal file while leaving room for a print run's own buffers.
 */
const ONBELLEK_SINIRI = 120_000_000;

/**
 * How fast documents are asked of UYAP, for printing, downloading and scanning
 * alike, and the only pace there is: one request at a time, the next one 3–4.5 s
 * after the last, about sixteen documents a minute.
 *
 * Faster settings — three at a time every 0.6–1.0 s, then two every 1.5–2.5 s,
 * then a choice of four speeds — each ended in UYAP suspending access part-way
 * through a run, and a suspended run gets nothing at all. The lawyer chose this
 * one for everything. The queue still slows down further after a block.
 */
const ISTEK_TEMPOSU = { concurrency: 1, minDelayMs: 3000, jitterMs: 1500, maxRetries: 1 };

// After a block the pace is halved for later runs too, up to four times slower,
// and comes back a little after each run that finishes without one.
const YAVASLATMA_SINIRI = 4;

/** An error the queue must not retry: asking again cannot change the answer. */
const kaliciHata = (mesaj) => Object.assign(new Error(mesaj), { kalici: true });

/** Listings remembered per case file. Years of weekly checks, a few kilobytes. */
const GECMIS_SINIRI = 100;

/**
 * The advice to give when a run mostly failed.
 *
 * A long list of per-document errors tells the reader what happened but not what
 * to do. When most of a selection fails the cause is almost never those
 * documents: it is the session or the portal, and both have a remedy the reader
 * can act on.
 *
 * @returns {string} empty when the failure rate is ordinary
 */
function toplucaBasarisizUyarisi(basarisiz, toplam, sebepler = []) {
  if (!toplam || basarisiz / toplam < 0.3 || basarisiz < 3) return '';

  const bas = `\n\n${basarisiz}/${toplam} evrak alınamadı. `;

  // The portal's own reason decides the advice. "Vekil kaydınız bulunmamaktadır"
  // is a fact about authorisation, not a fault: telling the reader to sign out
  // and back in would send them chasing a session problem that does not exist.
  if (sebepler.some((x) => /vekil kayd/i.test(x))) {
    // Deliberately not asserted as an authorisation limit. This same sentence was
    // once the portal's answer to a request the extension had built wrongly, and
    // reading it as a fact about the lawyer's registration sent the diagnosis in
    // the wrong direction for two rounds. The reader can settle it in one click.
    return (
      bas +
      'Sunucu bu evraklar için "vekil kaydınız bulunmamaktadır" diyor. Bu evraklar ' +
      'genellikle bağlı bir talimat veya soruşturma dosyasından gelir; alt satırlarda ' +
      'hangi dosyadan geldikleri yazar.\n' +
      '1. O evraklardan birini portalda elle açmayı deneyin.\n' +
      '2. Portalda da açılmıyorsa vekil kaydınız o dosyaya işlenmemiştir; ilgili yargı ' +
      'biriminin kaydı yapması gerekir.\n' +
      '3. Portalda açılıyor ama burada alınamıyorsa bu bir eklenti hatasıdır: ' +
      'F12 → Konsol\'daki "[UYAP Arşiv] alınamadı" kayıtlarıyla bildirin.'
    );
  }

  return (
    bas +
    'Bu oran tek tek evraklardan değil, genellikle oturumdan veya portalın o anki ' +
    'durumundan kaynaklanır:\n' +
    "1. UYAP'tan çıkış yapıp yeniden giriş yapın, dosyayı açıp yeniden listeleyin.\n" +
    '2. Sürmesi hâlinde bir süre bekleyip tekrar deneyin; portal yoğun olabilir.\n' +
    '3. Bu sırada daha az evrak seçmek de yardımcı olur.'
  );
}

/**
 * A remaining-time estimate that can be trusted.
 *
 * A number that jitters — 40 seconds, then 70, then 35 — is worse than no
 * number at all: the reader stops believing it and still does not know whether
 * to wait. So the estimate holds back until it has enough evidence, is rounded
 * to a coarseness the reader would use themselves, and only climbs when the run
 * has genuinely slowed rather than on ordinary variance.
 */
function sureTahminci(toplam) {
  const basladi = Date.now();
  let hiz = 0; // documents per second, smoothed
  let sonBiten = 0;
  let sonZaman = basladi;
  let sonGosterilen = null;
  let sonYazma = 0;

  return (biten) => {
    const simdi = Date.now();
    const gecen = (simdi - basladi) / 1000;

    // Exponential smoothing rather than a sliding window. With three requests in
    // flight, completions arrive in bursts, and any estimate computed from the
    // last few of them swung between twenty seconds and two minutes.
    const araSaniye = (simdi - sonZaman) / 1000;
    if (araSaniye >= 0.5 && biten > sonBiten) {
      const anlik = (biten - sonBiten) / araSaniye;
      hiz = hiz ? hiz * 0.75 + anlik * 0.25 : anlik;
      sonBiten = biten;
      sonZaman = simdi;
    }

    if (biten < 5 || gecen < 4 || biten >= toplam || !hiz) return sonGosterilen ? sonMetin(sonGosterilen) : '';

    // Recomputed constantly, shown at most once a second: a number that changes
    // faster than it can be read is noise, not information.
    if (sonGosterilen !== null && simdi - sonYazma < 1000) return sonMetin(sonGosterilen);
    sonYazma = simdi;

    const kalanSaniye = (toplam - biten) / hiz;
    const yuvarla = (sn) => {
      if (sn < 30) return Math.max(5, Math.round(sn / 5) * 5);
      if (sn < 120) return Math.round(sn / 10) * 10;
      return Math.round(sn / 30) * 30;
    };

    let deger = yuvarla(kalanSaniye);
    // Never climb by a hair: only a change worth reporting replaces the old one.
    if (sonGosterilen !== null && deger > sonGosterilen && deger < sonGosterilen * 1.4) deger = sonGosterilen;
    sonGosterilen = deger;
    return sonMetin(deger);
  };
}

function sonMetin(saniye) {
  if (saniye < 60) return `yaklaşık ${saniye} saniye kaldı`;
  const dakika = Math.round(saniye / 60);
  return `yaklaşık ${dakika} dakika kaldı`;
}

/* ---------------------------------------------------------------- helpers */


function node(tag, cls) {
  const n = document.createElement(tag);
  n.className = cls;
  return n;
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

function base64ToBlob(b64, type = 'application/octet-stream') {
  const clean = String(b64).replace(/^data:[^;]+;base64,/, '');
  const bin = atob(clean);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type });
}

/**
 * Keep the title bar on screen.
 *
 * Dragged above the top of the window, the header goes with it — and the close
 * button with the header. There was then no way to get the panel back short of
 * reloading the page, which also throws away the listing.
 */
/**
 * Bring the panel back inside the window.
 *
 * Applied when a drag ends and whenever the panel's own content resizes it —
 * never while the pointer is down. Clamping mid-drag made the panel stop
 * following the cursor at the limit, which reads as the drag having broken.
 *
 * The edges are flush: the panel may sit right against the bottom of the window.
 */
function konumuSinirla(panel) {
  const r = panel.getBoundingClientRect();

  let sol = Math.min(r.left, window.innerWidth - r.width);
  let ust = Math.min(r.top, window.innerHeight - r.height);

  // Taller or wider than the window: keep the title bar reachable instead.
  sol = Math.max(sol, Math.min(0, window.innerWidth - 140));
  ust = Math.max(ust, 0);

  panel.style.left = `${sol}px`;
  panel.style.top = `${ust}px`;
  panel.style.right = 'auto';
  panel.style.bottom = 'auto';
}

function makeDraggable(panel, handle) {
  let sx = 0, sy = 0, ox = 0, oy = 0, dragging = false;
  handle.addEventListener('pointerdown', (e) => {
    if (e.target.closest('button')) return;
    // Dragging the header is the user taking the panel's position as their own,
    // so it is no longer repositioned automatically as its content grows.
    panel._uaDevral?.();
    dragging = true;
    sx = e.clientX; sy = e.clientY;
    const r = panel.getBoundingClientRect();
    ox = r.left; oy = r.top;
    handle.setPointerCapture(e.pointerId);
  });
  handle.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    panel.style.left = `${ox + e.clientX - sx}px`;
    panel.style.top = `${oy + e.clientY - sy}px`;
    panel.style.right = 'auto';
    panel.style.bottom = 'auto';
    // Clamped continuously: releasing the pointer outside the browser window
    // never fires pointerup, and the panel would be left stranded off-screen.
    konumuSinirla(panel);
  });
  handle.addEventListener('pointerup', () => {
    dragging = false;
    konumuSinirla(panel);
  });

  // A window that shrinks can strand the panel outside it just as a drag can.
  window.addEventListener('resize', () => konumuSinirla(panel));
}
