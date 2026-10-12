# Gizlilik Politikası — UYAP Dosyalama ve Evrak Asistanı

(Eski adları: UYAP Arşiv, UYAP Yardımcısı)

Son güncelleme: 12 Ekim 2026
[English below](#privacy-policy--uyap-dosyalama-ve-evrak-asistanı-english)

## Kısaca

UYAP Dosyalama ve Evrak Asistanı'nın sunucusu yoktur. Eklenti, UYAP Avukat Portal
dışında hiçbir adrese kendiliğinden bağlanmaz. Tek isteğe bağlı özellik olan hızlı
giriş, yalnızca kullanıcı kurarsa e-Devlet'in kendi giriş formunu doldurur (aşağıya
bakın). İşlediği evraklar doğrudan kullanıcının kendi bilgisayarına iner.
Geliştirici, kullanıcının hiçbir verisine erişemez ve hiçbir veri toplamaz.

## Eklenti neye erişir

Eklenti yalnızca `avukat.uyap.gov.tr` ve `avukatbeta.uyap.gov.tr` adreslerinde
çalışır. Orada:

- Portalın kendi isteklerini izler ve aynılarını tekrarlar. Bu şekilde, kullanıcının
  zaten yetkili olduğu dosyanın evrak listesini, evrakların kendisini ve
  kullanıcının 30 günlük duruşma listesini alır.
- Oturum başlıklarını yalnızca bellekte, yalnızca o sekmede tutar. Diske yazılmaz,
  hiçbir yere gönderilmez.
- Evrakları kullanıcının tarayıcısının indirme klasörüne yazar.

Eklenti, portalın kullanıcıya zaten göstermediği hiçbir şeye erişmez ve hiçbir
yetkilendirmeyi aşmaz.

## Mobil imza ile hızlı giriş (isteğe bağlı)

Kullanıcı eklentinin penceresinde T.C. kimlik numarasını, mobil imzalı GSM
numarasını ve operatörünü kaydederse:

- Bu üç bilgi yalnızca kullanıcının tarayıcısında (`chrome.storage.local`) tutulur.
  Parola, PIN ya da e-Devlet şifresi istenmez ve saklanmaz; giriş, kullanıcının
  telefonundaki onayla olur.
- Kaydederken Chrome, eklentinin `giris.turkiye.gov.tr` sayfasına erişmesi için
  kullanıcıdan ayrıca izin ister. Hızlı girişi kurmayan kullanıcıda eklentinin
  e-Devlet'e hiçbir erişimi yoktur.
- Bilgiler yalnızca kullanıcı UYAP'ın giriş sayfasında **Giriş Yap**'a bastığında,
  son 90 saniye içinde ve yalnızca UYAP'a dönen bir e-Devlet girişinde,
  e-Devlet'in kendi mobil imza formuna yazılır; form kullanıcının sekmesinden
  e-Devlet'e gönderilir ve ardından e-Devlet'in **İmzala** düğmesine basılır.
  Eklenti bu bilgileri başka hiçbir adrese iletmez.
- UYAP sayfasında yalnızca maskeli numara gösterilir (ör. 0532 *** ** 67); kimlik
  numarası UYAP sayfasına hiç yazılmaz.
- **Bilgileri Sil** düğmesi bilgileri siler ve e-Devlet erişim iznini geri verir.
  Eklenti kaldırıldığında da silinirler.

## Tarayıcıda saklananlar

Aşağıdakiler yalnızca kullanıcının tarayıcısında (`chrome.storage.local`) tutulur ve
hiçbir yere iletilmez:

| Ne | Neden |
|---|---|
| Uç haritası | Portalın adreslerini bilmek için |
| Kalıcı olarak elenen evrak türleri | Tercihin her dosyada uygulanması için |
| Kayıt klasörü, zip, bildirim, kapak sayfası ve benzeri tercihler | Ayarların hatırlanması için |
| İndirilen evrakların içerikten türetilmiş imzaları | "Sadece indirilmemişler" seçeneğinin çalışması için |
| İndirilen evrakların kaydedildiği dosya adları | Excel dizininin önceki indirmelerdeki evraklara da bağlantı verebilmesi için |
| Listelenen evrakların imzaları ve dosyanın işlem geçmişi (listeleme, indirme ve yazdırmaların tarihi ve evrak sayıları) | Son bakıştan sonra gelen evrakların "yeni" diye işaretlenmesi ve işlem geçmişinin gösterilmesi için |
| Yalnızca hızlı giriş kurulduysa: T.C. kimlik no, GSM numarası, operatör | e-Devlet'in mobil imza formunun doldurulması için (yukarıya bakın) |
| Son duruşma listesi: 30 günlük duruşmaların tarihi, birimi, dosya numarası, işlemi ve tarafları | Paneldeki listenin ve duruşma tablosunun sayfalar arasında korunması için; her sorguda yenisiyle değiştirilir |
| Yarım kalan indirme ya da yazdırmanın türü, evrak imzaları, evrak sayısı ve zamanı (dosya başına) | "Kaldığı Yerden Devam Et"in sayfa yenilense de çalışması için; iş tamamlanınca ya da Vazgeç'e basılınca silinir |
| UYAP'ın son "erişiminiz durduruldu" yanıtının zamanı, art arda kaçıncı olduğu, o sırada evrak gelip gelmediği ve sonraki işler için yavaşlatma oranı | Beklemenin ve yavaşlatmanın sayfa yenilense de sürmesi için; "Beklemeyi Kaldır" ya da Ayarlar'daki seçeneğin kapatılması siler |

Evrak içinde arama için evraklardan okunan metin yalnızca açık sayfanın belleğinde
tutulur; diske ya da tarayıcı deposuna yazılmaz, sayfa kapanınca silinir.

Hızlı giriş bilgileri ve duruşma listesi dışında bu kayıtlar kişisel veri ve evrak
içeriği barındırmaz; imzalar tarih, tür ve evrak numarasından türetilmiş kısa
metinlerdir. Eklenti kaldırıldığında hepsi silinir.

## Gönderilmeyenler

- Hiçbir telemetri, analitik, kullanım istatistiği veya hata raporu toplanmaz.
- Evrak içeriği, müvekkil bilgisi ya da dosya numarası hiçbir sunucuya gönderilmez.
- Reklam ağı, izleyici veya üçüncü taraf servis kullanılmaz.
- Eklenti uzaktan kod indirmez; çalıştırdığı tüm kod paketin içindedir.
- Veriler satılmaz, devredilmez, eklentinin amacı dışında kullanılmaz.

## Kullanıcının sorumluluğu

İndirilen evraklar kişisel veri içerir. 6698 sayılı KVKK bakımından bu verilerin
sorumlusu, evrakları indiren avukattır. Diskin şifrelenmesi, erişim kontrolü ve
saklama süreleri kullanıcının yükümlülüğündedir.

Eklentinin ürettiği PDF çıktıları **okunabilir suretlerdir**. UDF dosyalarındaki
elektronik imza PDF'e aktarılamaz; aslın gerektiği yerlerde UDF dosyasının kendisi
kullanılmalıdır.

## İzinler ve gerekçeleri

| İzin | Gerekçe |
|---|---|
| `downloads` | Evrakları kullanıcının indirme klasörüne yazmak |
| `storage` | Yukarıdaki tercihleri ve kayıtları tarayıcıda saklamak |
| `unlimitedStorage` | İndirilmiş evrak kaydının, çok sayıda dosyada tarayıcının varsayılan saklama sınırına takılmaması |
| `notifications` | Uzun indirmelerde alınamayan evrak olduğunu bildirmek |
| `scripting` | Hızlı giriş kurulduğunda e-Devlet formunu dolduran betiği yalnızca izin verilen `giris.turkiye.gov.tr` sayfasına bağlamak |
| `avukat.uyap.gov.tr` ve `avukatbeta.uyap.gov.tr` erişimi | Eklentinin çalıştığı yer |
| `giris.turkiye.gov.tr` erişimi (isteğe bağlı) | Yalnızca kullanıcı hızlı girişi kurarken izin verirse; mobil imza formunu doldurmak |

## Değişiklikler

Bu politika değişirse güncel hâli bu sayfada, değişiklik tarihiyle birlikte yayınlanır.

## İletişim

Sorular ve hata bildirimi: https://github.com/MERBACO/uyap-evrak-asistani/issues

---

# Privacy Policy — UYAP Dosyalama ve Evrak Asistanı (English)

Last updated: 12 October 2026

**In short.** UYAP Dosyalama ve Evrak Asistanı (formerly UYAP Arşiv and UYAP
Yardımcısı) has no server. On its own it contacts no address other than the UYAP
Attorney Portal. Its one optional feature, the quick login, fills in e-Devlet's own
login form, and only if the user sets it up (see below). Documents it handles go
straight to the user's own disk. The developer has no access to any user data and
collects none.

**What it accesses.** The extension runs only on `avukat.uyap.gov.tr` and
`avukatbeta.uyap.gov.tr`. There it observes the portal's own requests and replays
them to fetch the document list and the documents of a case file the user is already
authorised to see, and the user's 30-day hearing list. Session headers are held in
memory, in that tab only; they are never written to disk or transmitted. It reaches
nothing the portal would not already show the user, and bypasses no authentication.

**Quick mobile-signature login (optional).** If the user saves their T.C. kimlik
no, mobile-signature GSM number and operator in the extension's popup, these three
values are kept in `chrome.storage.local` only. No password, PIN or e-Devlet
password is asked for or stored; the login is confirmed on the user's phone.
Saving them asks Chrome for separate access to `giris.turkiye.gov.tr`; without the
quick login the extension has no access to e-Devlet at all. The values are typed
into e-Devlet's own mobile-signature form, sent to e-Devlet from the user's tab and
followed by a press of e-Devlet's **İmzala** button — only when the user presses
**Giriş Yap** on UYAP's login page, within 90 seconds, and only for an e-Devlet login
that returns to UYAP. They go nowhere else. UYAP's page shows the masked number
only. **Bilgileri Sil** deletes them and gives the e-Devlet access back;
uninstalling deletes them too.

**What is stored in the browser.** The endpoint map; permanently excluded document
types; the download folder and other preferences; content-derived signatures of
downloaded documents and the file names they were saved under; signatures of listed
documents with a history of listings, downloads and printouts (time and document
counts); the quick-login details, if set up; the last hearing list (with party
names); the selection of an interrupted download or print (document signatures and
counts, per case file) so that "Kaldığı Yerden Devam Et" works after a reload; and the
time and count of UYAP's recent access suspensions with the slow-down they caused.
All of it stays in `chrome.storage.local` and is removed when the extension is
uninstalled. Text read from documents for the in-document search is held in the open
page's memory only; it is never written to disk or storage and is gone when the page
closes.

**What is never sent.** No telemetry, analytics, usage statistics or crash reports.
No document content, client details or case numbers leave the browser. No
advertising networks, trackers or third-party services. No remotely hosted code:
everything the extension runs ships inside the package. Data is never sold,
transferred, or used for anything but the extension's single purpose.

**User responsibility.** Downloaded documents contain personal data. Under Turkish
data-protection law (KVKK, Law 6698) the lawyer who downloads them is the data
controller. Disk encryption, access control and retention are the user's obligation.
PDFs produced by the extension are readable copies: the electronic signature inside a
UDF cannot be carried into a PDF, so the UDF file itself must be used where the
original is required.

**Permissions.** `downloads` to write documents to the user's download folder;
`storage` for the preferences and records above; `unlimitedStorage` so that the
record of downloaded documents does not hit the browser's default storage cap across
many case files; `notifications` to report documents that could not be fetched during
a long run; `scripting` to attach the form-filling script to `giris.turkiye.gov.tr`
once the user has allowed it; host access to the UYAP portal, where the extension
operates; optional access to `giris.turkiye.gov.tr`, requested only when the quick
login is set up.

**Changes.** If this policy changes, the current version is published on this page
with its date.

**Contact.** Questions and bug reports: https://github.com/MERBACO/uyap-evrak-asistani/issues
