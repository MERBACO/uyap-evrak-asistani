# Yayınlama

Chrome Web Store'a gönderme adımları, forma yapıştırılacak hazır metinler ve yayın
öncesi kontrol listesi.

Kararlar (12 Ekim 2026): mağaza adı **UYAP Dosyalama ve Evrak Asistanı**; lisans
**tüm hakları saklı** (`LICENSE`), kaynak kodu herkese açık depoda incelenebilir;
mobil imzayla hızlı giriş mağaza sürümünde kalıyor (inceleme reddederse çıkarılır,
aşağıya bakın); takvim eşitlemesi 2.16.0 ile kaldırıldı.

## Hazır olanlar

| Ne | Nerede |
|---|---|
| Yüklenecek paket | GitHub'daki son sürümün (Releases) ekindeki `uyap-evrak-asistani-<sürüm>.zip`; yalnızca `manifest.json`, `src/`, `presets/`, `fonts/`, `vendor/`, `icons/` içerir |
| Mağaza simgesi (128×128) | `icons/icon128.png` (paketin içinde, ayrıca yüklenmez) |
| Ekran görüntüleri (1280×800) ve küçük tanıtım görseli (440×280) | `docs/magaza/` — uydurma verilerle üretildi, müvekkil bilgisi yok |
| Gizlilik politikası adresi | https://github.com/MERBACO/uyap-evrak-asistani/blob/main/PRIVACY.md |

## Adım adım

Bu adımları hesap sahibi olarak sizin yapmanız gerekir; geliştirici kaydı ödeme ve
Google hesabıyla giriş ister.

1. **Geliştirici hesabı.** https://chrome.google.com/webstore/devconsole adresine
   Google hesabınızla girin, geliştirici sözleşmesini okuyup kabul edin ve tek
   seferlik 5 USD kayıt ücretini ödeyin. **Yayıncı adı** (ör. "Av. Mert Bayur") ve
   **iletişim e-postası** mağazada herkese açık görünür; e-postayı doğrulamanız
   istenir.
2. **Yeni öğe.** *Yeni öğe* → zip dosyasını yükleyin. Ad, kısa açıklama, sürüm ve
   simge zip'teki `manifest.json`'dan gelir.
3. **Mağaza girişi** sekmesi: aşağıdaki *Ayrıntılı açıklama*'yı yapıştırın; kategori
   **Verimlilik → İş akışı ve planlama**, dil **Türkçe**; `docs/magaza/` içindeki
   ekran görüntülerini ve küçük tanıtım görselini yükleyin. Ana sayfa adresi:
   https://github.com/MERBACO/uyap-evrak-asistani · Destek adresi:
   https://github.com/MERBACO/uyap-evrak-asistani/issues
4. **Gizlilik** sekmesi: *Tek amaç* metnini, her izin için aşağıdaki gerekçeyi
   yapıştırın; *Uzak kod kullanıyor musunuz?* → **Hayır**. *Veri kullanımı* bölümünü
   aşağıdaki gibi doldurun ve gizlilik politikası adresini girin.
5. **Dağıtım** sekmesi: ücretsiz; görünürlük **Herkese açık** (önce yalnızca
   bağlantıyı bilenlerin kurabildiği bir deneme isterseniz **Liste dışı** seçin, sonra
   herkese açarsınız); bölge: tüm bölgeler ya da yalnızca Türkiye.
6. **İncelemeye gönder.** İnceleme genellikle birkaç gün sürer; sonuç e-postayla
   gelir. Onaylanınca README'lerdeki kurulum bölümüne mağaza bağlantısını ekleyin.

## Hazır metinler

**Ad** (manifest): UYAP Dosyalama ve Evrak Asistanı

**Kısa açıklama** (manifest, 132 karakter sınırı):

> UYAP Avukat Portal için: evrakları kronolojik sırayla indirir ve yazdırır, duruşmaları listeler, mobil imzayla hızlı giriş yapar.

**Ayrıntılı açıklama:**

> UYAP Avukat Portal evrakları tek tek verir. İki yüz evraklık bir dosyayı arşivlemek
> iki yüz tıklama demek ve sonuç, İndirilenler klasöründe sırasız bir yığın olarak
> kalır.
>
> UYAP Dosyalama ve Evrak Asistanı, açtığınız dosyanın evraklarını tarih sırasına göre,
> tek bir klasöre indirir. Dosya adları sıra numarasıyla başladığı için klasörün kendi
> sıralaması kronolojiyi korur — beş yıl sonra arşivi okumak için bu eklentiye ihtiyaç
> kalmaz.
>
> • Bağlı soruşturma ve talimat dosyaları ile eklerin tamamı listelenir
> • İşinize yaramayan evrak türleri elenebilir, tercih kalıcı yapılabilir
> • Arama kutusu ve tarih aralığıyla uzun dosyalar daraltılır
> • Evrakların içinde arama: UDF, PDF, Word, Excel ve KEP evraklarının metninde
>   aranır, kelimenin geçtiği yer gösterilir; okunan metin hiçbir yere kaydedilmez
> • İçeriği birebir aynı olan evraklar bir kez indirilir
> • Seçili evraklar, biçim farkı gözetmeksizin tek belgede yazdırılabilir veya PDF
>   olarak kaydedilebilir; UDF evraklar metni aranabilir kalacak şekilde çevrilir
> • Fiziki dosya için kapak sayfası; yazdırılan belgede içindekiler sayfası, her evrak
>   için yer imi ve sayfa numaraları
> • Dosyaya son bakışınızdan sonra gelen evraklar işaretlenir; her dosyanın ne zaman
>   listelendiği, indirildiği ve yazdırıldığı panelde görünür
> • Klasöre, evrakları durumlarıyla listeleyen ve tıklanınca evrağı açan bir Excel
>   dizini konur
> • Yarıda kalan indirme ya da yazdırma "Kaldığı Yerden Devam Et" ile sürdürülür;
>   inmiş evraklar yeniden istenmez
> • 30 günlük duruşma ve keşif listesi: UYAP'a girince kendiliğinden gelir, gün gün
>   tablo olarak açılır, yazdırılır ve Excel'e aktarılır
> • İsteğe bağlı mobil imza ile hızlı giriş: UYAP'ın giriş sayfasındaki tek düğme
>   e-Devlet'in mobil imza formunu doldurup imzaya gönderir, siz telefondan
>   onaylarsınız. Parola saklanmaz; bilgiler tarayıcınızda saklanır ve yalnızca
>   e-Devlet'in formuna yazılır
>
> Evraklar UYAP'ı yormamak için tek tek, birkaç saniye arayla (dakikada yaklaşık 16
> evrak) istenir; seçimin tahmini süresi düğmelerin üstünde yazar, uzun işlerde bir
> satır işin sürdüğünü gösterir. UYAP erişimi geçici olarak durdurursa eklenti bunu
> tanır ve UYAP'ın yanıtını gösterir.
>
> Yalnızca vekâletiniz bulunan, portalın size zaten gösterdiği dosyalarda çalışır.
> Hiçbir yetkilendirmeyi aşmaz. Sunucusu yoktur; evraklar doğrudan sizin diskinize
> iner, geliştiriciye hiçbir veri ulaşmaz.
>
> Kaynak kodu herkese açık olarak incelenebilir: https://github.com/MERBACO/uyap-evrak-asistani
>
> Not: UDF evrakların PDF çıktısı okunabilir bir surettir; elektronik imza PDF'e
> aktarılamaz. Aslın gerektiği yerlerde UDF dosyasının kendisi kullanılmalıdır.
> Adalet Bakanlığı veya UYAP ile bağlantılı değildir.

### Tek amaç

> Eklentinin tek amacı, avukatın UYAP Avukat Portal'daki işini kolaylaştırmaktır:
> yetkili olduğu dosyaların evraklarını kronolojik sırayla indirmek, yazdırmak ve
> dizinlemek, portalın gösterdiği duruşmalarını listelemek ve portala girişi
> kısaltmak. Bütün özellikler aynı portalın verisi üzerinde çalışır.

**Hızlı giriş incelemede soru çıkarabilir.** Mağaza "tek amaç" kuralını dar
yorumlayabilir; e-Devlet giriş sayfasında form dolduran bir betik ayrıca dikkat
çeker. Bu yüzden erişim isteğe bağlı izinle (`optional_host_permissions`) ve yalnızca
kurulumda istenir, betik izin verilmeden hiçbir sayfaya bağlanmaz. İnceleme
reddederse hızlı giriş mağaza sürümünden çıkarılıp yeniden gönderilir.

### İzin gerekçeleri

| İzin | Yazılacak gerekçe |
|---|---|
| `downloads` | Kullanıcının seçtiği evrakları kendi indirme klasörüne yazmak için. Başka amaçla kullanılmaz. |
| `storage` | Kullanıcının tercihlerini ve çalışma kayıtlarını (kayıt klasörü, elenen evrak türleri, indirilmiş evrak kaydı, yarım kalan işin kaydı, son duruşma listesi; kurulduysa hızlı giriş bilgileri) yalnızca tarayıcıda saklamak için. |
| `unlimitedStorage` | İndirilmiş evrak kaydı dosya başına tutulur ve yüzlerce dosyadan sonra tarayıcının 10 MB'lık varsayılan sınırını aşar; aşınca "kaldığı yerden devam" bozulur. Kayıt yine yalnızca tarayıcıda kalır. |
| `notifications` | Uzun süren indirmelerde alınamayan evrak olduğunda kullanıcıyı bilgilendirmek için. |
| `scripting` | Kullanıcı hızlı girişi kurup izin verdiğinde, e-Devlet'in mobil imza formunu dolduran betiği yalnızca `giris.turkiye.gov.tr` sayfasına bağlamak için. İzin geri alınınca betik kaldırılır. |
| İsteğe bağlı host: `giris.turkiye.gov.tr` | UYAP'a mobil imzayla giriş e-Devlet üzerinden yapılır. Yalnızca kullanıcı hızlı girişi kurarken istenir; formu, kullanıcı UYAP'ta Giriş Yap'a bastığında ve yalnızca UYAP'a dönen girişlerde doldurmak için. |
| Host: `avukat.uyap.gov.tr`, `avukatbeta.uyap.gov.tr` | Eklenti yalnızca bu iki adreste çalışır; evrak listesi, evraklar ve duruşma listesi buradan alınır. |
| Uzak kod | Kullanılmıyor. Çalıştırılan tüm kod paketin içindedir (`vendor/` dahil). |

### Veri kullanımı

Eklenti geliştiriciye hiçbir veri iletmez ve satmaz. Formda şu türleri işaretleyin:

- **Kişisel olarak tanımlayıcı bilgiler** — hızlı giriş kurulursa T.C. kimlik no ve
  GSM numarası tarayıcıda saklanır ve yalnızca kullanıcı UYAP'ta Giriş Yap'a
  bastığında e-Devlet'in kendi mobil imza formuna yazılıp e-Devlet'e gönderilir;
  duruşma listesindeki taraf adları yalnızca tarayıcıda tutulur.
- **Web sitesi içeriği** — evrak listesi, evraklar ve duruşmalar UYAP'tan okunur,
  kullanıcının diskine ve tarayıcısına yazılır, başka hiçbir yere gönderilmez.

Ardından üç beyanı da onaylayın: veriler üçüncü taraflara satılmaz ya da
aktarılmaz (e-Devlet'e gönderim, kullanıcının istediği girişin kendisidir); tek
amaçla ilgisiz bir amaçla kullanılmaz; kredi değerliliği ya da borç verme amacıyla
kullanılmaz.

## GitHub

Depo `github.com/MERBACO/uyap-evrak-asistani` adresinde ve **herkese açık**; gizlilik
politikası ve destek bağlantısı buraya bakar. Her sürüm `manifest.json` ile aynı
numaralı bir etiket alır (`v2.16.0` gibi) ve GitHub'da, ekinde mağaza zip'i olan bir
sürüm (Release) olarak yayınlanır:

```bash
git archive --format=zip -o uyap-evrak-asistani-<sürüm>.zip v<sürüm> manifest.json src presets fonts vendor icons
```

Mağazadaki bir güncelleme için yeni zip'i aynı öğeye *Paket* sekmesinden yükleyip
yeniden incelemeye gönderin; sürüm numarası her seferinde artmalıdır.

## Yayın öncesi son kontrol

```bash
npm run check          # denetimler, uçtan uca testler ve panel testi
```

- [ ] `manifest.json` sürümü doğru ve `CHANGELOG.md` içinde o sürümün kaydı var
- [ ] Yeni izin eklendiyse gerekçesi mağaza formuna ve `PRIVACY.md`'ye yazıldı
- [ ] `PRIVACY.md` herkese açık adresinde güncel
- [ ] Depoda ve geçmişinde müvekkil evrakı, gerçek dosya numarası, taraf adı ya da test UDF'i yok
- [ ] Ekran görüntülerinde müvekkil bilgisi, kimlik ya da GSM numarası yok (paneldeki hızlı giriş bölümü ve popup dahil)
- [ ] Ekran görüntülerindeki duruşma listesinde gerçek dosya numarası ve taraf adı yok
