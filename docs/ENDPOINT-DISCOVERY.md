# Uç haritasını yenileme

UYAP Avukat Portal'ın dahili API'si belgelenmiş değil ve portal güncellendiğinde
değişebiliyor. Bu yüzden adresler koda gömülü değil; `presets/avukatbeta.json`
dosyasında duruyor.

**Normal kullanımda bu belgeye ihtiyacınız yok.** Harita eklentiyle birlikte geliyor
ve doğrulanmış durumda. Burası, UYAP adresleri değiştirip eklenti çalışmaz hale
geldiğinde haritayı elle yenilemek için.

Eklenti içinde bir kaydedici vardı, kaldırıldı: çalışan bir kurulumun yanı başındaki
ayar ekranı çoğunlukla onu yanlışlıkla bozmanın yoludur. Aşağıdaki iş, tarayıcının
kendi geliştirici araçlarıyla yapılıyor.

## Neden bu yaklaşım

Üç seçenek vardı:

| Yaklaşım | Sorun |
|---|---|
| DOM'u kazımak (HTML'den bağlantı çıkarmak) | Portal Angular; liste sanal kaydırmalı, ekranda olmayan evrak DOM'da da yok. Sessizce eksik arşiv üretir. |
| Adresleri koda gömmek | UYAP her güncellediğinde eklenti bozulur, yeni sürüm yayınlanana kadar kimse kullanamaz. |
| **Adresleri JSON haritada tutmak** | Harita bir kez çıkarılır; portal değişince tek satırlık bir PR herkesi onarır. |

Üçüncüsü seçildi. Haritanın da mümkün olduğunca azı sabit: liste isteği portalın kendi
attığı isteğin birebir tekrarı, yanıtın şekli her listelemede canlı yanıttan yeniden
çıkarılıyor. Dolayısıyla elle yenilenmesi gereken şey pratikte yalnızca iki adres.

## Neyi bulmanız gerekiyor

`presets/avukatbeta.json` içinde doldurulması gereken iki alan var:

| Alan | Ne olduğu | Bugünkü değeri |
|---|---|---|
| `endpoints.evrakListesi.path` | Dosyanın evrak listesini döndüren adres | `/list_dosya_evraklar.ajx` |
| `endpoints.evrakIndir.path` | Tek bir evrağın kendisini döndüren adres | `/download_document_brd.uyap?dosyaId=%22{{dosyaId}}%22&evrakId=%22{{evrakId}}%22` |

Geri kalan alanlar (`listPath`, `fields`) çalışma anında yanıttan çıkarılıyor; boş
bırakılabilir.

## Adımlar

### 1. Ağ trafiğini izlemeye alın

Portalda **F12** → **Network** sekmesi. Filtreye `ajx` ya da `Fetch/XHR` seçin,
listeyi temizleyin.

### 2. Liste adresini bulun

Bir dava dosyası açıp **Evrak** sekmesine girin. Bu sırada düşen isteklerden birinin
yanıtı dosyanın evraklarını içerir — yanıtı açıp içinde evrak sayınıza yakın uzunlukta
bir dizi arayın.

O isteğin **yolunu** (`?` işaretinden öncesi) `evrakListesi.path` alanına yazın.
Gövdesini şablonlamanıza gerek yok: eklenti, portalın attığı isteğin gövdesini olduğu
gibi tekrarlıyor.

### 3. İndirme adresini bulun

Listeden tek bir evrağı normal şekilde indirin. Düşen istek, içerik türü `text/udf`,
`application/pdf` gibi bir şey olan istektir.

Adresteki kimlik değerlerini yer tutucularla değiştirin:

- dosyayı gösteren parametre → `{{dosyaId}}`
- evrağı gösteren parametre → `{{evrakId}}`

Dikkat: UYAP kimlikleri **kendi içinde tırnak taşıyor** ve `+`, `@`, `/` gibi
karakterler içeriyor. Adreste `%22` görüyorsanız o tırnak değerin bir parçasıdır;
şablona ikinci bir tırnak eklemeyin. Eklenti değerleri kendisi kodlar.

### 4. Deneyin

Klasörü `chrome://extensions` üzerinden yenileyin, UYAP sekmesinde `Ctrl + F5` yapın,
bir dosya listeleyin. Panel evrak sayısını yazıyorsa harita çalışıyor demektir.

### 5. Paylaşın

`verifiedAt` alanına tarihi yazıp PR açın. Aynı sorunu yaşayan herkes faydalanır.

## Sık karşılaşılan durumlar

**Liste yalnızca son evrakları getiriyor.** Portalın yanıtında tam liste
(`tumEvraklar`, bağlı dosya başına ayrı dizi) ile son evraklar listesi yan yana
gelir. Eklenti listeleri dizi dizi değil toplam evrak sayısıyla karşılaştırır ve
eşitlikte tam listeyi seçer (`detectShape`). Panel bu uyarıyı veriyorsa yanıtta tam
liste hiç bulunamamıştır: yanıtın yapısı değişmiş olabilir, alan adlarına bakın.

**İndirme "Evrak bulunamadı" veya "vekil kaydınız bulunmamaktadır" dönüyor.** Bunlar
sunucunun HTTP 200 ile döndürdüğü ret mesajlarıdır, eklentinin arızası değil. Bağlı
dosya evrakları için eklenti dört kimlik birleşimini sırayla dener; hiçbiri belge
vermezse sebebi panelde yazar.

**Kimlikler her listelemede değişiyor.** Doğrusu budur: UYAP kimlikleri her yanıtta
yeniden şifreliyor. Bu yüzden indirme, kimliği veren listelemeyle aynı oturumda
yapılmalı; eklenti sıralama ve geçmiş için kimliğe değil, evrağın içeriğinden
türettiği kalıcı bir imzaya bakar.

## Sınır

Bu araç yalnızca **zaten yetkili olduğunuz**, vekâletiniz bulunan dosyalarda çalışır.
Portalın size göstermediği hiçbir şeye erişmez, hiçbir yetkilendirmeyi aşmaz; sadece
sizin elinizle yapacağınız tıklamaları sırayla ve ölçülü hızda yapar.
