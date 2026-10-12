# Değişiklikler

## 2.16.0 — 12 Ekim 2026

Chrome Web Store'a gönderilen ilk sürüm. Eklentinin adı **UYAP Dosyalama ve Evrak
Asistanı** oldu. Ayarlar, kayıtlar ve `UYAP Arsiv` indirme klasörü değişmedi.

Yeni izin yok; `identity` izni kaldırıldı. Kurulumlar onay sorulmadan güncellenir.

### Kaldırılan

- **Google Takvim eşitlemesi.** Duruşma listesi, duruşma tablosu, yazdırma ve Excel'e
  aktarma aynen sürüyor; yalnızca duruşmaların Google Takvim'e yazılması kaldırıldı.
  Popup'taki Google Takvim bölümü ve paneldeki bağlan düğmesi yok. Daha önce
  bağlandıysanız Google hesabınızdaki "UYAP Duruşmalar" takvimi silinmez; isterseniz
  Google Takvim'den kaldırabilirsiniz. Eklentinin bu bağlantı için tarayıcıda tuttuğu
  kayıtlar güncellemeyle silinir.

### Değişen

- **Ad:** panel başlığı, kapatınca kalan düğme, popup ve duruşma tablosu yeni adı
  taşıyor.
- **Lisans:** MIT yerine tüm hakları saklı (`LICENSE`). Kaynak kodu herkese açık
  https://github.com/MERBACO/uyap-evrak-asistani deposunda incelenebilir; izinsiz
  kopyalanamaz, değiştirilemez, dağıtılamaz.
- Gizlilik politikası, README'ler ve mağaza metinleri (`docs/YAYINLAMA.md`) buna
  göre yenilendi; eklenti artık UYAP ve (hızlı giriş kurulduysa) e-Devlet dışında
  hiçbir adrese bağlanmıyor.

### Düzeltilen

- Panel kısa kaldığında evrak sayısını gösteren satır ("22 evrak — 22 ana, 0 ek")
  neredeyse görünmez bir şeride iniyordu; artık yer gerektiğinde liste küçülüyor.

### Geliştirme

- Belgelerdeki ve testlerdeki örnek dosya numaraları ve mahkeme adları açıkça
  uydurma olanlarla ("Örnekköy") değiştirildi.
- Takvim modülü, takvim belgesi ve testleri kaldırıldı; `tools/check-docs.mjs`
  CHANGELOG dışında Google Takvim'den söz eden belgeyi yakalıyor.
- Mağaza ekran görüntüleri ve tanıtım görseli: `docs/magaza/`.

## 2.15.0 — 7 Ekim 2026

Eklentinin adı **UYAP Yardımcısı** oldu (çalışma adı; mağazaya çıkmadan kesinleşecek).
Ayarlar, kayıtlar ve `UYAP Arsiv` indirme klasörü değişmedi.

Yeni uyarılı izin yok; kurulumlar onay sorulmadan güncellenir. Eklenen `identity`
izni için Chrome kurulumda uyarı göstermez.

### Yeni

- **30 günlük duruşma listesi.** UYAP'a girdiğinizde panelin en üstündeki
  **Duruşmalar** satırı, bugün dahil önümüzdeki 30 günün duruşma ve keşiflerini
  kendiliğinden alır. Portalın "Yaklaşan Duruşmalarım" kartının kendi sorgusu
  7 gün yerine 30 günle yinelenir. Eldeki liste önceki bir günden kalmışsa ya da bir
  saatten eskiyse sayfa açılınca kendiliğinden yenilenir (sayfa yenilenene kadar bir
  kez); **Yenile** ile istediğiniz an yeniletebilirsiniz.
- **Duruşma tablosu.** **Tabloyu Aç** bütün duruşmaları gün gün, birim, dosya no,
  dosya türü, işlem, müvekkil ve diğer taraflarla bir sayfada gösterir;
  yazdırılabilir, **Excel'e Aktar** ile `.xlsx` olarak indirilir.
- **Google Takvim eşitlemesi** (isteğe bağlı). Popup'tan ya da paneldeki Duruşmalar
  bölümünden bağlanınca duruşmalar Google hesabınızda açılan ayrı bir **UYAP
  Duruşmalar** takvimine yazılır, 1 saat ve 15 dakika önce hatırlatılır. Her
  yenilemede takvim güncellenir: yeni duruşma eklenir, ertelenen taşınır, listeden
  düşen kaldırılır; elle eklediğiniz notlar korunur. Takvime yalnızca vekili
  olduğunuz tarafın adı yazılır. Eklenti yalnızca kendi açtığı takvime erişebilir
  (`calendar.app.created`). Kurulum için bir kez Google istemci kimliği gerekir:
  docs/GOOGLE-TAKVIM.md (2.16.0'da kaldırıldı).
- **"Çalışıyor mu, takıldı mı?" satırı.** Yazdırma, indirme ve içerik taramasında
  durum yazısının altında saniyede bir güncellenen bir satır var: yanıp sönen nokta,
  geçen süre ve birkaç saniyeden uzun süren evrağın adı ("şu an: 149 · Bilirkişi
  Raporu (7 sn)", yeniden deneniyorsa kaçıncı deneme olduğu). 45 saniye bir evrak
  bitmezse ya da 75 saniye hiçbir şey ilerlemezse satır sarıya döner ve nerede
  beklendiğini söyler. Sayaç bir zamanlayıcıyla çizilir: sayfa gerçekten donarsa
  durur, bu da donmayı ayırt etmeyi sağlar. Tarayıcı ağır bir evrakta birkaç saniye
  meşgul kalırsa bu da yazılır.
- **Kaldığı yerden devam.** Yarım kalan indirme ya da yazdırma (UYAP engeli, iptal,
  oturum düşmesi) dosya başına kaydedilir ve panelde **Kaldığı Yerden Devam Et**
  düğmesi çıkar. İndirmede inmiş evraklar yeniden istenmez, kayıt sayfa yenilense
  de durur. Yazdırmada alınmış evraklar sayfanın belleğinde bekler; aynı dosya
  yeniden listelense de silinmez, devamda yalnızca kalanlar istenir. İndirmede
  UYAP'ın reddettiği ya da "bulunamadı" dediği evraklar devamda istenmez. Engel
  beklemesi sürerken düğme kapalıdır ve kaç dakika sonra açılacağını yazar; süre
  dolunca kendiliğinden, **Beklemeyi Kaldır**'a basınca hemen açılır.

### Değişen

- **UYAP'tan evrak isteme temposu yavaşladı:** aynı anda 3 istek ve 0,6–1 sn
  aralık yerine evraklar tek tek, istekler arasında 3–4,5 sn bırakılarak istenir
  (dakikada ~16 evrak). Önceki tempo UYAP'ın güvenlik sistemini tetikledi;
  engellenen bir işlem hiçbir şey getirmediği için yavaş ama biten tempo daha kısa
  sürer. Yazdırma, indirme ve içerik taraması aynı, tek tempoyu kullanır; hız ayarı
  yoktur. İndir ve Yazdır düğmelerinin üstünde seçili evraklar için tahmini süre
  yazar. Ağ hatasında evrak bir kez yeniden denenir (iki yerine).
- **Engelden ders alıyor.** Ayarlar'daki bekleme seçeneği açıkken UYAP bir kez
  engellerse sonraki işler yarı hızda çalışır, her yeni engelde tempo yeniden yarıya
  iner (en fazla dört kat yavaş); panel bunu tahmini süreyle birlikte İndir/Yazdır
  düğmelerinin üstünde yazar. En az 20 evrak alıp engelsiz biten her işten sonra
  tempo biraz toparlanır; **Beklemeyi Kaldır** ya da seçeneği kapatmak yavaşlatmayı
  da hemen sıfırlar.

### Hızlanan

- **Yazdırma, evraklar inerken hazırlanıyor.** Evraklar UYAP'tan bilerek yavaş
  alınır; işlemci bu sırada boş bekliyordu ve bütün hazırlık indirme bitince
  başlıyordu. Artık taranmış evraklar (TIFF, PNG) gelir gelmez çözülüp
  sıkıştırılıyor ve aynı içerik denetimi için özetleri çıkarılıyor; indirme bitince
  geriye birkaç saniyelik birleştirme kalıyor (150 UDF evrakta ~1,7 sn).
- **Taranmış sayfalar 4–5 kat hızlı ekleniyor.** TIFF ve PNG taramalar
  tarayıcının kendi sıkıştırıcısıyla doğrudan PDF'e yazılıyor; önceki yolda PDF
  kütüphanesi, bizim ürettiğimiz PNG'yi JavaScript'le yeniden çözüyordu. A4, 300
  dpi bir sayfa 0,9 saniyeden 0,2 saniyeye indi; kayıpsız, üstelik üçte bir
  boyutta. Gri taramalar tek kanalla saklanıyor.
- **Çıktı dosyası çok daha küçük.** Her evrak Türkçe yazı tiplerini ayrı ayrı
  taşıyordu; 150 evraklık bir çıktıda 150 kopya. Artık her yazı tipi bir kez
  bulunuyor ve eklentinin yazdığı sayfa metni sıkıştırılıyor: 150 evrak, 542
  sayfalık bir ölçümde 51,8 MB → 3,9 MB. Chrome'un PDF görüntüleyicisi ve yazıcı
  kuyruğu dosyayı buna göre hızlı açıyor.
- Yazdırma sonunda toplam süre ve bunun ne kadarının UYAP'tan evrak almak olduğu
  yazıyor.

### Arayüz

- **Evrak listesine daha çok yer.** Üstteki düğme ve yazıların kapladığı alan
  kısıldı (Ayarlar düğmesi "Evrakları Listele" ile aynı satıra alındı,
  bölümler arası boşluklar daraltıldı) ve panelin varsayılan boyu büyütüldü;
  böylece kronolojik evrak listesi bir bakışta çok daha fazla satır gösteriyor.
  Pencereyi dilediğiniz gibi büyütüp küçültmeye devam edebilirsiniz.
- **Panel "Evrakları Listele" deyince yerinden oynamıyor.** Önceden listeleme
  bitince panel kendini yeniden konumlandırıp ekranın üstüne doğru zıplıyordu.
  Artık açıldığı sağ alt köşede sabit durur; liste dolunca yukarı doğru büyür,
  alttaki düğmeler yerinde kalır. Paneli taşımak ya da boyutlandırmak yine size
  kalmış — bir kez elle oynattığınızda konumu tümüyle sizin olur.
- **Boyutlandırma tutamağı belirginleşti.** Panelin sağ alt köşesindeki, çekip
  genişletmeye yarayan işaret artık mühür renginde (koyu kırmızı) çizgilerle
  gösteriliyor; kolayca fark edilir.

### Düzeltilen

- **UYAP'ın güvenlik engeli evrak sanılıyordu.** UYAP, kısa sürede çok istek
  gelince "Güvenlik sistemlerimiz, erişiminizde insan kullanımına uygun olmayan
  bir etkinlik örüntüsü tespit etmiştir…" sayfasıyla erişimi geçici olarak
  durduruyor. Bu sayfa metin içeren bir HTML olduğu için evrak kabul ediliyor,
  indirmede dosya olarak kaydediliyor, yazdırmada basılıyordu; eklenti de engeli
  görmediği için aynı hızla, her evrakta birkaç kimlik birleşimi deneyerek istek
  atmaya devam ediyordu. Artık engel yanıtı — sayfa olarak da gelse, hata koduyla
  da gelse, evrak listesi isteğine de gelse — tanınıyor (liste isteğinde "isteklerin
  hiçbiri yanıt vermedi" diye ya da eksik bir listeyle sessizce bitmiyor); engel
  sayfası evrak olarak kaydedilmiyor ya da basılmıyor
  ve panel UYAP'ın gönderdiği metni mesajının altında aynen gösteriyor.
  Ayarlar'daki **UYAP "erişiminiz durduruldu" yanıtı verince bir süre bekle**
  seçeneği açıkken (varsayılan) ilk engel yanıtında bütün istekler kesiliyor,
  hiçbiri yeniden denenmiyor ve 15 dakika yeni toplu işlem (yazdırma, indirme,
  içerik tarama, duruşma sorgusu) başlatılmıyor; panel kalan süreyi yazıyor. Engel
  kalkmadan yeniden denenip yine engellenirse bekleme uzuyor: 15 dakika, 1 saat,
  4 saat, en çok 12 saat; bu durumda panel önce portalı elle kontrol etmeyi ve
  gerekirse UYAP destek hattını aramayı söylüyor. İkinci engel evraklar gelirken
  geldiyse panel UYAP'ın erişimi bugün yeniden durdurduğunu ve sonraki işlerin daha
  yavaş çalışacağını söylüyor. Evrak alınan ilk işten sonra sayaç sıfırlanıyor.
  Bekleme sürerken çıkan **Beklemeyi Kaldır** düğmesi beklemeyi hemen kaldırır.
  Seçenek kapatılınca bekleyen süre silinir; eklenti hiçbir işte (duruşma sorgusu
  dahil) kendiliğinden durmaz ve beklemez: UYAP'ın vermediği evrak tek istekte,
  sunucunun kendi yanıtıyla işaretlenir ve işlem sürer; o evrak ret sayılmadığı
  için devamda yeniden istenir.
- **Reddedilen bir evrak için 27'ye kadar istek gidiyordu — engelin asıl
  sebebi büyük ihtimalle bu.** Portal bir evrağı vermeyince ("vekil kaydınız
  bulunmamaktadır") eklenti onu beklemeden, art arda 5–9 farklı biçimde daha
  istiyor, sonra ret "geçici hata" sayıldığı için bütün bunları iki kez daha
  tekrarlıyordu. Vekaletin olmadığı bağlı bir soruşturma dosyasında bu, her evrak
  için saniyenin altında bir istek patlaması demekti. Artık:
  - ret bir cevap sayılıyor, hiç tekrarlanmıyor;
  - bir dosya için hangi biçimin çalıştığı öğrenildikten sonra evrak başına
    yalnızca o biçim deneniyor (normalde tek istek);
  - bir evrağın denemeleri arasında da normal tempoda bekleniyor;
  - bir dosya iki evrağı her biçimde reddedip hiç evrak vermediyse, o dosyanın
    kalan evrakları hiç istenmiyor ve satırında sebebi yazıyor.
- **Eklenti yenilenince açık UYAP sekmesi anlaşılmaz hatalar veriyordu:**
  "Extension context invalidated", "Cannot read properties of undefined (reading
  'local')". Artık panel de duruşma bölümü de "sayfayı yenileyin (F5)" diyor ve
  düğmeler o hâlde hiçbir şey denemiyor.
- **İptal ya da engelden sonra her çalışan bir istek daha gönderiyordu.** Kuyruk durdurma
  isteğini, iki istek arasındaki bekleme başlamadan bakıyor, bitince bakmıyordu.
- **Yazdırma evrak alma aşamasında durursa** alınamayan evrakların satırı
  "alınıyor" hâlinde kalıyordu; artık işaretleniyor.
- **Büyük yazdırmalarda son aşama sessizdi.** PDF dosyası yazılırken panel işi
  bitmiş sayıyor ve bir önceki adımın yazısını ("Belgeler birleştiriliyor: 240/240"
  ya da "İçindekiler hazırlanıyor…") gösterip bekliyordu; büyük dosyalarda bu bir
  dakikayı bulabiliyor ve takılmış gibi görünüyordu. Artık "PDF dosyası yazılıyor"
  ve "Yazdırma sekmesi açılıyor" yazar, iş bitene kadar düğmeler kilitli kalır.
  PDF yazılamazsa da panel kilitli kalmaz, sebebi yazılır.
- Aynı içerikli evrakları ayıklama ve sayfa üst bilgilerini hazırlama aşamaları
  hiçbir şey yazmadan sürüyordu; ikisi de artık sayılarıyla görünür. İlerleme
  çubuğu yazdırmanın bütün aşamalarında ilerler.
- **Zip açıkken yarım kalan indirme kayboluyordu.** Evraklar "indirildi" diye
  kaydediliyor, ama yarım kalan zip teslim edilmediği için diske hiç inmiyor, sonra
  "Sadece İndirilmemişler" seçiminde de atlanıyordu. Artık yarım kalan zip
  "(yarım).zip" adıyla teslim ediliyor ve evraklar ancak zip teslim edilince inmiş
  sayılıyor.
- **İndirme kaydı ancak iş bitince yazılıyordu.** Sekme yarıda kapanırsa o ana kadar
  inenler unutuluyordu; artık kayıt iş sürerken birkaç saniyede bir yazılıyor.

### İzinler

- `identity` eklendi: Google'ın izin ekranını açmak ve takvim anahtarı almak için.
  Chrome bu izin için kurulumda uyarı göstermez; Google izni ayrıca, bağlanırken
  sorulur.

### Geliştirme

- Yeni modüller: `src/lib/durusma.js`, src/lib/gtakvim.js (2.16.0'da kaldırıldı),
  `src/content/durusmalar.js`, `src/popup/durusmalar.html`, `src/popup/durusmalar.js`;
  `src/lib/engel.js` (UYAP engelinin tanınması ve bekleme süreleri),
  `src/lib/nabiz.js` ("çalışıyor mu, takıldı mı" satırı), `src/lib/gorsel.js`
  (taramaların PDF'e doğrudan yazılması), `src/lib/baglanti.js` (eklenti
  yenilenince "F5" mesajı).
- `src/lib/queue.js`: eşzamanlı çalışanlar bekleme adımını sırayla yapıyor (2.14.0'daki
  üç çalışan aynı anda başlayıp aralığı kısaltabiliyordu). Eklenti artık tek çalışanla
  istediği için bu kullanıcıya görünmez.
- `src/lib/excel.js` başka sütunlarla da tablo yazabiliyor.
- `tools/test-durusma.html`: Duruşmalar bölümü, tablo sayfası ve engel korumasıyla
  duruşma sorgusu; `tools/test-e2e.mjs` sahte bir Google Takvim API'sine karşı
  eşitlemeyi sınıyor. `tools/test-panel.html` engel, koruma kapalıyken işleyiş,
  Beklemeyi Kaldır ve kaldığı yerden devam senaryolarını kapsıyor.
- Uç haritasına `durusmaListesi` eklendi; bir kez listeleme yapılmış kurulumlarda
  kayıtlı harita ilk açılışta sıfırlanır, fark edilmez.

## 2.14.0 — 5 Ekim 2026

Yeni uyarılı izin yok; kurulumlar onay sorulmadan güncellenir. e-Devlet erişimi
yalnızca hızlı girişi kuran kullanıcıya, kurulum sırasında sorulur.

### Yeni

- **Mobil imza ile hızlı giriş** (isteğe bağlı). T.C. kimlik no, mobil imzalı GSM
  numarası ve operatör eklentinin penceresinde bir kez kaydedilir. UYAP'ın giriş
  sayfasında sağ alttaki panel, listeleme yerine bir **Giriş Yap** düğmesi
  gösterir: basınca e-Devlet'in mobil imza formu açılır, doldurulur, gönderilir ve
  **İmzala**'ya basılır; geriye telefondan onay kalır. Ayrı bir kutu açılmaz;
  oturum açılınca panel her zamanki hâline döner. Parola ya da PIN saklanmaz.
  Panel yalnızca maskeli numarayı gösterir; kimlik no UYAP sayfasına hiç yazılmaz.
  Form yalnızca son 90 saniyede panelden başlatılmış ve UYAP'a dönen bir girişte
  doldurulur; form da İmzala da aynı istekle ikinci kez gönderilmez.

### İzinler

- `scripting` eklendi; Chrome bu izin için uyarı göstermez.
- `giris.turkiye.gov.tr` erişimi **isteğe bağlı**: yalnızca hızlı girişi kurarken
  sorulur. Kurmayan kullanıcıda eklentinin e-Devlet'e erişimi olmaz ve güncelleme
  yeniden onaya düşmez. **Bilgileri Sil** izni de geri verir.

### Değişen

- Popup'taki tanıtım ve sorun giderme metinleri güncellendi: evrak içinde arama,
  YENİ etiketi, işlem geçmişi, Excel dizini, içindekiler ve hızlı giriş anlatılıyor.

### Geliştirme

- `tools/test-panel.mjs` artık üç senaryo çalıştırıyor: `tools/test-giris.html`
  hızlı giriş bölümünü ve e-Devlet tarafını (İmzala adımı dahil),
  `tools/test-popup.html` kurulum formunu sahte sayfalara karşı sınıyor.
- `tools/check-manifest.mjs` çalışırken kaydedilen betikleri ve isteğe bağlı host
  izinlerini de denetliyor.

## 2.13.0 — 2 Ekim 2026

Yeni izin yok; kurulumlar onay sorulmadan güncellenir.

### Yeni

- **Evrakların içinde arama.** **İçerikleri Tara** evrakları portaldan alıp
  metinlerini okur; arama kutusu sonra evrakların içinde de arar ve kelimenin
  geçtiği cümleyi satırın altında vurgular. Türkçe harf ve büyük/küçük harf fark
  etmez, birden çok kelime yazılınca hepsi aranır. UDF, PDF, Word, Excel, KEP,
  HTML, düz metin ve EYP paketlerinin içi okunur; taranmış görüntüler ayrıca
  bildirilir. Daha önce indirilen ya da yazdırılan evraklar yeniden istenmez.
  Okunan metin yalnızca sayfanın belleğinde tutulur.
- **Parola istemeyen şifreli PDF'ler okunuyor.** Resmî kurumların kopyalamayı
  kısıtlamak için şifrelediği PDF'ler (RC4, AES-128) artık aranabiliyor. AES-256
  ile şifrelenmiş ya da gerçekten parola isteyen PDF'ler "okunamadı" diye
  bildirilir.
- Arama artık bütün kelimeleri ayrı ayrı arıyor ve Türkçe harflere duyarsız:
  "raporu bilirkisi" yazınca "Bilirkişi Raporu" da bulunur.

### Geliştirme

- CI güncellendi: `actions/checkout` ve `actions/setup-node` v7 (Node 24), Node 24
  ile test, `ubuntu-26.04` sabitlendi, ESLint 9'a sabitlendi. Panel testi CI'da
  zorunlu: Chrome bulunamazsa atlanmak yerine başarısız olur.

## 2.12.0 — 2 Ekim 2026

### Yeni

- **Yeni gelen evraklar işaretleniyor.** Bir dosyayı daha önce listelediyseniz, o
  zamandan beri gelen evrakların başında yeşil **YENİ** etiketi olur ve panel kaç
  tane olduğunu yazar. **Sadece Yeniler** düğmesi yalnızca onları seçer.
- **İşlem geçmişi.** Panel her dosyanın en son ne zaman listelendiğini, indirildiğini
  ve yazdırıldığını gösterir; hiç listeleme yapılmadıysa bunu söyler. Bölüm açılınca
  bütün işlemler tarih ve sayılarıyla listelenir.
- **Excel dizini.** Klasörün başına `000_Evrak Dizini.xlsx` konur: dosyanın bütün
  evrakları tarih, tür, gönderen ve durumlarıyla (indirildi, aynı içerik, alınamadı,
  seçilmedi). Süzülebilir; dosya adına tıklayınca evrak açılır. Kaldığı yerden devam
  eden indirmelerde de tek ve güncel bir dizin kalır. Ayarlardan kapatılabilir.
- **Yazdırma çıktısında içindekiler, yer imleri ve sayfa numarası.** Kapaktan sonra
  her evrağın başladığı sayfayı gösteren, ekranda tıklanabilir bir içindekiler
  sayfası; PDF görüntüleyicinin kenar çubuğunda her evrak için bir yer imi; her
  sayfanın köşesinde "37 / 412". Ayarlardan kapatılabilir.

### Düzeltilen

- **"Aynı içerikli evrağı bir kez indir" açıkken indirme ilk evrakta takılıyordu.**
  Seçimde atlanan evrak ya da indirilemeyen bir evrak olduğunda da takılıyordu.
- **Bağlı dosyası olan dosyalarda yanlış liste seçiliyordu.** Panel "yalnızca Son 20
  Evrak alındı" diye gereksiz bir uyarı veriyordu; ana ve bağlı dosyaların toplamı
  20'yi aşınca fazlası hiç listelenmiyor, bağlı dosya etiketleri kayboluyordu.
- **Aynı gün, aynı türde, numarasız iki evraktan biri listeden düşebiliyordu.**
- **Klasör adı yanlış dosyanın başlığından alınabiliyordu.** Sayfada başka bir dosya
  numarası önce geçtiğinde evraklar o dosyanın adını taşıyan klasöre iniyordu. Başlık
  artık listelenen dosyanın numarasıyla doğrulanıyor.
- **Eklentiyle gelen uç haritası güncellemeleri, bir kez listeleme yapılmış
  kurulumlara ulaşmıyordu.**
- **İndirme kaydı yazılamazsa panel kilitli kalıyordu**; düğmeler sayfa yenilenene
  kadar açılmıyordu.

### İzinler

- `unlimitedStorage` eklendi. İndirme kaydı yüzlerce dosyadan sonra tarayıcının
  10 MB'lık varsayılan sınırını aşıyordu. Kayıtlar yine yalnızca tarayıcıda kalır;
  Chrome bu izin için uyarı göstermez ve kurulumu yeniden onaya düşürmez.

### Güncellerken bilinmesi gerekenler

- İlk açılışta kayıtlı uç haritası bir kez sıfırlanır; ilk listelemede yeniden
  çıkarıldığı için fark edilmez.
- Güncellemeden sonra her dosyanın ilk listelemesi "daha önce listeleme yapılmadı"
  der. YENİ etiketleri ikinci bakıştan itibaren görünür.
- Excel dizini, güncellemeden önce indirilmiş evrakları "önceki indirmede alındı"
  diye gösterir ama dosya adlarını bilmediği için onlara bağlantı vermez.

### Geliştirme

- `tools/test-panel.mjs`: panelin kendisi başsız Chrome'da sahte bir portala karşı
  sınanıyor; `npm run check` ve CI'a eklendi.
- `tools/test-e2e.mjs` Windows'ta da çalışıyor; birleştirme, sıra, liste seçimi,
  geçmiş, içindekiler ve Excel dizini için testler eklendi.
- Yeni modüller: `src/lib/dizin.js`, `src/lib/gecmis.js`, `src/lib/excel.js`.
