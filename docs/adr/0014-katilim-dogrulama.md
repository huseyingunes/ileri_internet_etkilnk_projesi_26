# 0014. Katılım doğrulama: QR, konum ve süre

- Durum: Kabul edildi
- Tarih: 2026-11-28 (gece; proje sahibinin "sormadan en uygun şekilde ilerle" talimatıyla)

## Bağlam

Promptun 10. bölümü katılımı üç koşula bağlıyor: dinamik QR okutma, konumun etkinlik alanında
olması ve etkinlik süresinin en az %50'sinde bulunma. Çok günlü etkinliklerde %50 kuralının nasıl
uygulanacağı açık soruydu.

## Karar

- **QR belirteci:**
  - Yapısı `base64url(yük).base64url(HMAC-SHA256)`. Yükte etkinlik, okutma türü
    (giriş / çıkış / ara yoklama), rastgele 128 bitlik belirteç kimliği ve son kullanma zamanı var.
  - Anahtar `QR_SIGNING_SECRET` ortam değişkeninde (en az 32 karakter, varsayılanı yok).
  - Algoritma sabit; imza `timingSafeEqual` ile karşılaştırılır.
  - Belirteç, yenileme süresinin iki katı boyunca geçerlidir (ör. 25 sn → 50 sn); böylece kod
    değişmeden hemen önce okutan öğrenci de kabul edilir.
- **QR bağlantısı:** `https://<alan-adı>/katilim#t=<belirteç>`. Belirteç URL parçasında taşınır, bu
  yüzden sunucuya ve loglara gitmez. PWA belirteci okur, adres çubuğundan siler ve gövdede gönderir.
  Öğrenci giriş yapmamışsa belirteç saklanmaz; giriş sonrası güncel kodu yeniden okutur.
- **QR'ı kim gösterebilir:** yalnızca etkinliğin danışmanı ya da yönetici, etkinlik penceresi
  içinde (başlangıçtan 15 dakika önce – bitişten 15 dakika sonra).
- **Okutma kuralları:**
  - Öğrencinin **onaylı başvurusu** ve **konum açık rızası** olmalı.
  - Uzaklık haversine formülüyle hesaplanır ve etkinliğe özgü yarıçapla karşılaştırılır.
  - Doğruluğu 500 m'den kötü konum kabul edilmez.
  - Koordinatlar yalnızca uzaklığı hesaplamak için kullanılır ve **saklanmaz**. Saklananlar:
    uzaklık, yarıçap içinde olup olmadığı, sonuç ve zaman.
  - Aynı belirteçle tekrar okutma aynı sonucu döner; `(öğrenci, belirteç)` tekillik kısıtı ve
    `ON CONFLICT DO NOTHING` bunu sağlar.
  - Uç nokta hız sınırlıdır.
- **Süre (%50) kuralı** (saf fonksiyonlar, özellik testli):
  - Bulunma süresi, geçerli ilk ve son okutma arasındaki süredir; pencereyle sınırlanır.
  - Başlangıçtan önce 15 dakikalık tolerans içinde yapılan giriş okutması da sayılır.
  - Gereken süre, planlanan sürenin yarısıdır (ör. 120 dakikada 60 dakika).
- **Çok günlü etkinlikler (açık soru kararı):**
  - Etkinliğin başlangıç ve bitiş saatleri **her gün tekrar eden bir pencere** olarak yorumlanır.
    Örneğin 1 Nisan 09.00 – 3 Nisan 18.00 → her gün 09.00–18.00.
  - Bulunma süresi her gün için ayrı hesaplanıp toplanır. Gereken süre, günlük pencerelerin
    toplamının yarısıdır (örnekte 13,5 saat).
  - Bitiş saati başlangıç saatinden önce olan gece etkinlikleri tek, kesintisiz bir aralık sayılır.
- **Kesinleştirme:**
  - Worker'da her 5 dakikada `attendance.finalize` işi çalışır.
  - Biten etkinliklerde her onaylı başvuru için `attended` ya da `absent` yazılır. Bekleme
    listesindekiler için `blocked_by_capacity` yazılır; bu öğrenciler puan kaybetmez.
  - Etkinlik `completed` durumuna geçer ve `event.completed` olayı yayınlanır. Puanlama, neden
    soruları ve değerlendirme talepleri bu olaya abone olur.
  - İşlem idempotenttir.
- **Yeni kütüphane:** QR görseli istemcide `qrcode` ile SVG olarak üretilir. Kütüphane yalnızca QR
  sayfası açılınca yüklenir. Görsel `data:` adresiyle gösterilir; CSP'de `img-src data:` zaten var.

## Sonuçlar

- Bilinen sınırlar (prompt bölüm 10): tarayıcı arka planda konum izleyemez, kapalı alanda GPS
  sapabilir ve sahte konum tamamen engellenemez. Bu yüzden QR, konum ve kurumsal oturum birlikte
  aranır ve yarıçap ayarlanabilir tutulur.
