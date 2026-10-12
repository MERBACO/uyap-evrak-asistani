# UYAP Dosyalama ve Evrak Asistanı

**UYAP Avukat Portal için Chrome eklentisi: evrakları kronolojik sırayla toplu indirir ve yazdırır, 30 günlük duruşmalarınızı listeler, mobil imzayla tek tıkla giriş yapar.**

Eski adları *UYAP Arşiv* ve *UYAP Yardımcısı*; ayarlar, kayıtlar ve `UYAP Arsiv` indirme klasörü aynen korunur.

[English README →](README.md)

Portal evrakları tek tek veriyor. İki yüz evraklık bir dosyayı arşivlemek iki yüz
tıklama demek ve sonuç, İndirilenler klasöründe portalın verdiği adlarla, sırasız bir
yığın olarak duruyor.

Bu eklenti dosyanın tamamını **tarih sırasına göre**, tek bir klasöre indirir; klasörün
kendi alfabetik sıralaması kronolojiyi korur.

```
UYAP Arsiv/
└── 2026-1234 Örnekköy 3. Asliye Ceza Mahkemesi - Ceza Dava Dosyası/
    ├── 001_2020-01-04_2020-999(CBS Sorusturma Dosyası)_Kolluk Kuvveti İhbar Evrakı.pdf
    ├── 002_2026-07-03_İfade Tutanağı_[Müdafii MERT BAYUR].udf
    ├── 003_2026-07-27_Genel Karar-Müzekkere.udf
    ├── 004_2026-07-27_Ek 01 · Kolluktan Gelen Fezleke Yazısı.pdf
    └── 005_2026-08-20_Tensip Zaptı.udf
```

Baştaki sayı işin özü: beş yıl sonra arşivi okumak için ne bu eklentiye, ne bir
görüntüleyiciye, ne de veritabanına ihtiyaç olur. Bağlı dosyalardan gelen evraklar o
dosyanın numarasını adında taşır; ekler ait oldukları evrağın hemen ardından gelir.

## Ne yapar

- Açık dosyanın **bütün evraklarını listeler**, en eskiden en yeniye: bağlı soruşturma
  ve talimat dosyaları ile her evrağın ekleri dahil.
- **Yeni geleni gösterir.** Dosyaya son bakışınızdan sonra düşen evraklar
  işaretlenir ve tek tıkla seçilir. Her dosyanın işlem geçmişi — ne zaman
  listelendiği, indirildiği, yazdırıldığı — panelde görünür.
- **Evrak türüne göre eler.** Hiç işinize yaramayan bir türü kalıcı olarak
  eleyebilirsiniz; kural bundan sonra açtığınız her dosyada uygulanır.
- **Aynı içerikli evrakları atlar.** Yirmi evrağa iliştirilmiş aynı ek bir kez iner
  ve bir kez yazdırılır.
- **Daraltır:** uzun dosyalarda arama kutusu ve tarih aralığı.
- **Evrakların içinde arar.** İçerikler bir kez tarandıktan sonra arama kutusu
  UDF, PDF (parola istemeyen şifreli PDF'ler dahil), Word, Excel, KEP, HTML ve EYP
  evraklarının metninde de arar; kelimenin geçtiği yer vurgulu gösterilir. Türkçe
  harf ve büyük/küçük harf fark etmez. Okunan metin yalnızca sayfanın belleğinde
  durur.
- **Yazdırır:** seçili evraklar, biçimleri ne olursa olsun, listedeki sırayla tek bir
  belgede birleşir. UDF evraklar PDF'e çevrilir, PDF'lerin sayfaları olduğu gibi
  kopyalanır, görseller ve çok sayfalı TIFF taramalar sayfalara yerleştirilir, EYP
  paketleri açılıp içindekiler birleştirilir. Portalın HTML ürettiği evraklar, docx,
  eml ve düz metin metne çevrilir; xlsx elektronik tablolar sütunlarıyla, sayfaya
  sığmayacak kadar genişse kayıt düzeninde basılır. Sayfa sırası ters çevrilebilir, böylece çıktı klasöre konduğunda en eski evrak
  altta kalır; son sayfasında yalnızca imza bloğu kalan evraklar bir önceki
  sayfaya sığdırılır. İsteğe bağlı kapak sayfası dosyayı tanıtır ve taraflar, duruşma tarihleri ile
  notlar için el yazısıyla doldurulacak boş bölümler bırakır. İsteğe bağlı
  içindekiler sayfası her evrağın başladığı sayfayı gösterir ve ekranda
  tıklanabilir; her evrak PDF görüntüleyicinin kenar çubuğunda bir yer imidir
  ve her sayfa numaralıdır.
- **Excel dizini yazar.** Klasörün başındaki `000_Evrak Dizini.xlsx` dosyanın
  bütün evraklarını durumlarıyla listeler; süzülebilir, dosya adına tıklayınca evrak
  açılır. Ayarlardan kapatılabilir.
- **Kaldığı yerden devam eder.** İptal edilen ya da oturum düşmesi veya UYAP
  engeliyle yarıda kalan indirme ya da yazdırma dosya başına kaydedilir; panelde
  **Kaldığı Yerden Devam Et** düğmesi çıkar. İndirmede inmiş evraklar, yazdırmada
  bu sayfanın belleğinde bekleyenler yeniden istenmez. UYAP beklemesi sürerken
  düğme kapalıdır ve kaç dakika sonra açılacağını yazar; **Beklemeyi Kaldır**
  düğmeyi hemen açar.
- **Tek tıkla giriş yapar** (isteğe bağlı). T.C. kimlik no, mobil imzalı GSM
  numarası ve operatörünüzü popup'ta bir kez kaydedersiniz; UYAP'ın giriş
  sayfasında panelde çıkan **Giriş Yap** düğmesi e-Devlet'in mobil imza formunu
  açar, doldurur, gönderir ve **İmzala**'ya basar. Size yalnızca telefondan
  onaylamak kalır.
- **Duruşmalarınızı listeler.** UYAP'a girdiğinizde panelin **Duruşmalar** bölümü
  bugünden başlayarak 30 günlük duruşma ve keşiflerinizi kendiliğinden alır; eldeki liste bugüne
  aitse ve bir saatten yeniyse yeniden sormaz. Tam
  tablo ayrı bir sayfada, gün gün açılır; yazdırılabilir, Excel'e aktarılabilir.

## Neden bir yenisi

Chrome mağazasında UYAP toplu indirici birkaç tane var; neredeyse hepsinin kodu
görülemiyor, bir kısmı abonelikli. Vekâlet kapsamındaki evrakı işleyen bir aracın, ona
güvenen kişi tarafından denetlenebilmesi gerekir; bu yüzden bu eklentinin kaynak kodu
herkesin incelemesine açıktır. Sunucusu da hesabı da yok; UYAP'tan başka hiçbir adrese
bağlanmaz. İsteğe bağlı hızlı giriş, sekmenizdeki e-Devlet formunu doldurur. Başka
hiçbir yere bir şey gönderilmez.

## Nasıl çalışıyor

| Parça | Görevi |
|---|---|
| `src/inject/net-hook.js` | Sayfa dünyası. Portalın kendi isteklerini izler ki panel onları tekrarlayabilsin; oturum başlıklarını yalnızca bellekte tutar. Kendiliğinden hiç istek atmaz. |
| `src/content/bridge.js` | O istekleri portalın kendi kaynağından tekrarlar; UYAP açısından siz tıklamışsınız gibi görünür. |
| `src/content/panel.js` | Panel: listeleme, eleme, indirme ve yazdırma. |
| `src/content/hizli-giris.js` | Panelin UYAP giriş sayfasında gösterdiği hızlı giriş bölümü; e-Devlet'in mobil imza formuna götürür. |
| `src/content/edevlet-giris.js` | O formu doldurur ve İmzala'ya basar; yalnızca son 90 saniyede panelden başlatılmış bir UYAP girişi için. |
| `src/lib/preset.js` | Yanıtı okur: evrakların nerede olduğu, tarihin hangi alanda durduğu, indirme ucunun hangi kimliği istediği. |
| `src/lib/gorsel.js` | Taramaları PDF'e hızlı ve kayıpsız ekler; birleşik çıktıda yazı tiplerini teke indirip metni sıkıştırır. |
| `src/lib/engel.js` | UYAP'ın "erişiminiz geçici olarak durdurulmuştur" yanıtını tanır; işi durdurur, bir süre yeni toplu işlem başlatmaz. |
| `src/lib/nabiz.js` | Uzun işlerde "çalışıyor mu, takıldı mı" satırı: geçen süre, beklenen evrak, takılma uyarısı. |
| `src/lib/queue.js` | İstekleri sıraya sokar; sunucu zorlanınca yavaşlar, düzelince hızlanır. |
| `src/lib/naming.js` | Evrağı, yıllar sonra da anlamlı olacak bir dosya adına çevirir. |
| `src/lib/udf.js` | UYAP'ın kendi belge biçimi UDF'i okur ve görüntüler. |
| `src/lib/pdf.js` | Gömülü Türkçe fontla PDF yazar; UDF yazdırmak için. |
| `src/lib/zip.js` | Dosyanın tamamı tek indirme olarak istendiğinde zip üretir. |
| `src/lib/dizin.js` | Birleşik çıktıya içindekiler sayfası, yer imleri ve sayfa numarası ekler. |
| `src/lib/gecmis.js` | Dosyanın listeleme, indirme ve yazdırma geçmişi. |
| `src/lib/excel.js` | Excel dizinini (`000_Evrak Dizini.xlsx`) yazar. |
| `src/lib/pdfmetin.js` | PDF'ten metin çıkarır; evrak içinde arama için. |
| `src/lib/pdfsifre.js` | Parola istemeyen şifreli PDF'leri açar (RC4, AES-128). |
| `src/lib/arama.js` | Türkçe harf duyarsız arama ve vurgulanacak alıntı. |
| `src/lib/mobilimza.js` | Hızlı giriş bilgilerini doğrular ve maskeler. |
| `src/content/durusmalar.js` | Paneldeki Duruşmalar bölümü: 30 günlük sorgu ve liste. |
| `src/lib/durusma.js` | Sorgu aralığını hesaplar, duruşma yanıtını okur. |
| `src/popup/durusmalar.html` | Duruşma tablosu: gün gün, yazdırılabilir, Excel'e aktarılabilir. |
| `src/background/service-worker.js` | Diske yazar, bildirim gönderir, izin verilince e-Devlet betiğini bağlar, duruşma tablosunu açar. Ağa hiç çıkmaz. |
| `presets/*.json` | Uç haritası — aşağıya bakın. |

### Uç haritası

UYAP'ın dahili API'si belgelenmiş değil ve portal güncellendiğinde değişiyor. Uçları
koda gömmek, her değişiklikte eklentinin bozulması ve yeni sürüm beklenmesi demek.
Bunun yerine harita bir JSON dosyasında duruyor ve içindekilerin çoğu sabit değil:
liste isteği, portalın kendi attığı isteğin birebir tekrarı; yanıtın şekli — evrakların
nerede olduğu, tarihin hangi alanda durduğu — her listelemede canlı yanıttan yeniden
çıkarılıyor.

İndirme de aynı ilkeyi izler. Dört kimlik birleşimi denenir; evrak yine
reddedilirse portalın kendi indirme isteği şablon olarak kullanılır ve yalnızca
kimlikler değiştirilir — böylece eklentinin hiç bilmediği bir parametre de
istekle birlikte gider. Bazı bağlı dosyaların evrakları tam da bunu gerektiriyordu.

Bu arama bir dosyanın yalnızca ilk evrakları içindir. Hangi birleşimin çalıştığı
öğrenilince o dosyanın sonraki evraklarında diğer birleşimler denenmez; denemeler
arasında da normal tempoda beklenir. Portalın reddi bir cevap sayılır, yeniden
denenmez. İki evrağı her biçimde reddedip hiç evrak vermeyen bir dosyanın kalan
evrakları, dosya yeniden listelenene kadar istenmez; satırlarında sebebi yazar.

UYAP değişince tek bir preset PR'ı herkesin kurulumunu onarır. Uygulama içinde harita
düzenleme ekranı yok: geliştirme sırasında vardı, ama çalışan bir kurulumun yanı
başındaki ayar ekranı çoğunlukla onu yanlışlıkla bozmanın yoludur. Haritayı elle
yenileme yöntemi [`docs/ENDPOINT-DISCOVERY.md`](docs/ENDPOINT-DISCOVERY.md) içinde.

### PDF'te Türkçe

PDF'in yerleşik yazı tiplerinde Ğ, İ, Ş yok; onlara güvenen her üretici
`Örnekköy 3. Asliye Ceza Mahkemesi` yazısını bozar. `fonts/` klasöründe Liberation Serif
var — UYAP belgelerinin istediği Times New Roman ile ölçü uyumlu — Türkçe hukuk
metninin ihtiyacı olan karakterlere indirgenmiş hâliyle, yazıcının ihtiyacı olan
ölçülerle birlikte. Yeniden üretmek için `python3 tools/build-fonts.py`; çıktı depoda
durduğu için normal kurulumda derleme adımı gerekmez.

## Kurulum

Chrome Web Store'dan kurun (mağaza bağlantısı yayından sonra buraya eklenecek). Sonra:

1. Portalda bir dosya açın, **Evrak** sekmesine girin, paneli kullanın
2. İsteğe bağlı: tek tıkla mobil imza girişi için araç çubuğundaki simgeye
   tıklayın, "Mobil İmza ile Hızlı Giriş" altında **Kur**'a basın, bilgilerinizi
   kaydedin ve Chrome sorduğunda `giris.turkiye.gov.tr` erişimine izin verin

Geliştirme için kaynaktan: `git clone https://github.com/MERBACO/uyap-evrak-asistani.git`,
sonra `chrome://extensions` → **Geliştirici modu** → **Paketlenmemiş öğe yükle** →
depo klasörü.

Derleme adımı ve paket kurulumu yok: gereken her şey depoda, kullanılan iki üçüncü
taraf kütüphane (pdf-lib ve UTIF) dahil; ne olduklarını ve neden orada olduklarını `vendor/README.md` anlatıyor.

## Kapsam ve sınırlar

- Yalnızca zaten yetkili olduğunuz dosyalarda çalışır. Hiçbir yetkilendirmeyi aşmaz,
  portalın size tıklayınca göstermeyeceği hiçbir şeyi göstermez.
- İstekler bilerek yavaş. Amaç hız değil, ortak kullanılan bir kamu sistemini yormamak.
  İndirme, yazdırma ve içerik taraması evrakları tek tek, istekler arasında 3–4,5
  saniye bırakarak ister (dakikada yaklaşık 16 evrak); hız ayarı yoktur. İndir ve
  Yazdır düğmelerinin üstünde seçili evraklar için tahmini süre yazar. İş sürerken
  durum yazısının altındaki satır saniyede bir güncellenir; bir evrak 45 saniyede
  gelmezse ya da 75 saniye hiçbir şey ilerlemezse sarıya döner.
- UYAP kısa sürede çok istek görünce erişimi "erişiminiz geçici olarak
  durdurulmuştur" sayfasıyla keser. Eklenti bu sayfayı tanır; evrak olarak kaydetmez
  ya da basmaz. Ayarlar'daki **UYAP "erişiminiz durduruldu" yanıtı verince bir süre bekle**
  seçeneği açıkken (varsayılan) iş hemen durur ve 15 dakika yeni toplu işlem
  başlatılmaz; üst üste engellerde bekleme 1 saate, 4 saate, en çok 12 saate uzar ve
  sonraki işler daha yavaş çalışır. **Beklemeyi Kaldır** düğmesi beklemeyi hemen
  kaldırır. Seçenek kapalıyken eklenti (duruşma sorgusu dahil) kendiliğinden durmaz
  ve beklemez; verilmeyen evrak sunucunun kendi yanıtıyla işaretlenir, iş sürer. İki
  durumda da panel, UYAP'ın gönderdiği metni mesajının altında aynen gösterir.
- Yazdırılan veya çevrilen UDF **okunabilir bir surettir, imzalı aslın kendisi
  değildir**: UDF içindeki elektronik imza PDF'e aktarılamaz. Aslın gerektiği yerlerde
  UDF dosyasının kendisi kullanılmalıdır.
- Yukarıda sayılanlar (UDF, PDF, PNG, JPEG, TIFF, EYP, HTML, xlsx, docx, eml, düz
  metin) dışındaki biçimler birleşik çıktıya giremez.
  Yerlerine bunu bildiren bir sayfa konur, kendi görüntüleyicilerinden yazdırılmaları
  gerekir.
- Çok büyük taranmış evraklar Chrome'un indirme sınırını aşabilir; bunlar tek tek
  raporlanır.
- Yazdırma, belge kapanana kadar seçili evrakların tamamını bellekte tutar; yaklaşık
  350 MB'ı aşınca işlem durur ve daha az evrak seçmenizi ister.

## Gizlilik

Telemetri yok, analitik yok, uzak uç yok. Evraklar doğrudan sizin diskinize iner; uç
haritası ve tercihleriniz `chrome.storage.local` içinde kalır. Hızlı girişi
kurduysanız bilgileri de (T.C. kimlik no, GSM numarası, operatör; parola ya da PIN
yok) orada durur ve yalnızca e-Devlet'in formuna yazılır. Son duruşma listesi de
orada tutulur.

Evraklar kişisel veri içerir. KVKK bakımından indirilen her şeyin veri sorumlusu
avukattır: diski şifreleyin ve bir hata bildirimine eklediğiniz her şeyden müvekkil
bilgilerini temizleyin.

## Katkı

Hata bildirimi ve önerileriniz için GitHub'da bir *issue* açın; ekran görüntüsü ya
da konsol kaydı eklerseniz önce müvekkil bilgilerini temizleyin. Kod tüm hakları
saklı bir lisansla yayınlandığı için kod katkıları (PR) şimdilik kabul edilmiyor.

`node tools/check-dead-declarations.mjs`, bu projede üç kez tekrarlanan bir hatayı
yakalar: fabrika fonksiyonunun `return` satırından sonra yazılmış bir `const`. Sözdizimi
geçerlidir, ancak bir düğmeye basıldığında patlar.

Aşağıdaki denetimlerin hepsi CI'da çalışıyor:

| | |
|---|---|
| `tools/check-dead-declarations.mjs` | `return`'den sonra yazılmış `const` |
| `tools/check-unused.mjs` | kimsenin kullanmadığı dışa açık fonksiyon, olay ve mesajlar; aynı dosyada iki kez tanımlanmış fonksiyon |
| `tools/check-docs.mjs` | kırık yollar ve hâlâ anlatılan kaldırılmış özellikler |
| `tools/check-manifest.mjs` | bildirilen dosyalar, sayfadan erişilebilirlik, izinler |
| `tools/test-e2e.mjs` | kütüphaneler uçtan uca; bir `.udf` verilirse UDF ve PDF de |
| `tools/test-panel.mjs` | panelin kendisi, başsız Chrome'da sahte bir portala karşı: listeleme, yeni rozeti, işlem geçmişi, indirme, yazdırma; hızlı giriş bölümü, e-Devlet tarafı ve popup'taki kurulum; Duruşmalar bölümü ve tablo sayfası. Chrome yoksa atlanır (`CHROME_PATH`) |
| `eslint .` | tanımsız isimler, ölü bağlamalar — `node --check`'in göremediği sınıf |

Hepsini birden çalıştırmak için `npm run check`.

## Yayınlama

[`docs/YAYINLAMA.md`](docs/YAYINLAMA.md) içinde mağaza metinleri, incelemenin
istediği izin gerekçeleri ve yayın öncesi kontrol listesi var.

## Lisans

Tüm hakları saklıdır © 2026 Av. Mert Bayur. Kaynak kodu inceleme amacıyla herkese
açıktır; yazılı izin olmadan kopyalanamaz, değiştirilemez, dağıtılamaz ya da
satılamaz. Ayrıntı: [`LICENSE`](LICENSE). Adalet Bakanlığı veya UYAP ile bağlantılı
değildir.
Gizlilik politikası: [`PRIVACY.md`](PRIVACY.md).
Birlikte gelen üçüncü taraf bileşenler kendi lisanslarını korur:
`vendor/LICENSE-pdf-lib.md` (MIT), `vendor/LICENSE-utif.txt` (MIT) ve `fonts/LICENSE-LiberationSerif.txt` (SIL OFL).
