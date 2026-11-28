# 0017. Bildirimler, kanallar ve ilgi alanları

- Durum: Kabul edildi
- Tarih: 2026-11-28 (gece; proje sahibinin "sormadan en uygun şekilde ilerle" talimatıyla)

## Bağlam

Promptun 7. bölümü bildirimlerin kanaldan bağımsız olmasını istiyor: uygulama içi, e-posta ve
WhatsApp. Açık soru şuydu: WhatsApp Business hesabı ve onaylı şablonlar hazır mı, e-posta hangi
sağlayıcıyla gönderilecek? Proje bir ders demosu; gerçek bir WhatsApp Business hesabı ya da kurumsal
e-posta sağlayıcısı yok.

## Karar

- **Kanaldan bağımsız model:**
  - Her bildirim önce `notifications` tablosuna yazılır ve uygulama içinde görünür.
  - E-posta ve WhatsApp kopyaları `notification_deliveries` tablosuna `queued` durumunda girer ve
    worker'daki `notification.deliver` işiyle gönderilir. Bu iş idempotenttir, üstel bekleme ve
    jitter ile yeniden dener; tükenen iş ölü mektup kuyruğuna düşer.
- **Yinelenen bildirim yok:** her bildirim bir `dedupe_key` taşır ve `(user_id, dedupe_key)`
  tekildir (kısmi tekil indeks). Yeniden çalışan bir iş aynı kişiye aynı haberi ikinci kez
  göndermez. Örnek anahtarlar: `event_reminder:<etkinlik>`, `vote_invitation:<gün>`.
- **E-posta:**
  - SMTP ile gönderilir; kütüphane `nodemailer` 10.6.1'dir (bağımlılığı yok, en yaygın Node SMTP
    istemcisi; gece kararı).
  - Geliştirmede `compose.dev.yaml` içindeki **Mailpit** bütün e-postaları yakalar; web arayüzü
    yalnızca `127.0.0.1` adresinde açıktır.
  - Üretimde `SMTP_URL` ve `EMAIL_FROM` zorunludur, gerçek sağlayıcı bu değişkenlerle bağlanır.
  - İçerik yalnızca düz metindir; kullanıcı metni HTML'e dönüşmez.
- **WhatsApp:**
  - Cloud API adaptörü arayüz arkasındadır. `WHATSAPP_DRIVER` varsayılan olarak `disabled`
    değerindedir.
  - `cloud` seçilirse dört değer zorunludur: numara kimliği, erişim belirteci, uygulama gizli
    anahtarı ve doğrulama belirteci.
  - Mesaj yalnızca şu koşulların hepsi sağlanınca gider: öğrencinin **açık rızası** var, telefon
    numarası kayıtlı, o bildirim türü için WhatsApp tercihi açık ve onaylı şablon kullanılıyor.
    Şablon adı `etkinlik_<tür>`, dili `tr`, gövde parametresi bildirim metnidir. Şablonların
    Meta'da onaylatılması işletme adımıdır.
  - Rıza kuyruktayken geri alınırsa mesaj atlanır (`skipped`). Rıza geri alınınca telefon numarası
    silinir.
  - Testlerde `memory` sürücüsü kullanılır; üretimde `memory` reddedilir.
- **Webhook:**
  - `GET /webhooks/whatsapp` abonelik el sıkışmasıdır; doğrulama belirteci sabit zamanlı
    karşılaştırılır.
  - `POST` isteğinde `X-Hub-Signature-256`, **ham gövde** üzerinden HMAC-SHA256 ile doğrulanır.
    Algoritma sabittir, karşılaştırma `timingSafeEqual` ile yapılır.
  - Olay `webhook_events` tablosuna yazılır ve hemen 200 dönülür; aynı olay ikinci kez gelirse
    birincil anahtar onu ayıklar.
  - Durumlar (`delivered`, `read`, `failed`) worker'da ilgili gönderime işlenir. Uç nokta hız
    sınırlıdır.
- **Tercihler:**
  - 2 kanal × 8 türden oluşan bir matris tutulur. Varsayılan: e-posta açık, WhatsApp kapalı.
  - Uygulama içi bildirim kapatılamaz.
- **Tetikleyiciler:**

  | Bildirim                                          | Ne zaman                                                                                                                                            |
  | ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
  | Oylama sonucu                                     | Her 10 dakikada son üç günün sonuçları kontrol edilir ve oy verenlere bildirilir. Eşitlik bekleyen sonuç, yönetici karar verdikten sonra duyurulur. |
  | İlgi alanına uygun oylama daveti                  | Her gün 00.05'te.                                                                                                                                   |
  | Başvuru onayı ve bekleme listesinden yer açılması | Başvuru anında.                                                                                                                                     |
  | Etkinlikten 24 saat önce hatırlatma               | Saatlik kontrolle.                                                                                                                                  |
  | Değerlendirme talebi ve neden sorusu              | `event.completed` olayıyla.                                                                                                                         |
  | Puan değişikliği                                  | Puanlama sırasında ve mazeret iadesinde.                                                                                                            |

- **İlgi alanları:**
  - Öğrencinin seçtikleri (`selected`) ve davranışından çıkarılanlar (`inferred`) olmak üzere iki
    tür vardır. Çıkarılan ilgi alanları son 365 günün oylarından, katılımlarından ve 4–5 puanlı
    değerlendirmelerinden gelir.
  - Çıkarılanlar her gece 23.30'da **baştan hesaplanır** (tam yeniden yazım). Böylece iş
    idempotenttir ve tekrar çalışınca ağırlıklar şişmez. Seçilen ilgi alanlarına dokunulmaz.
  - Davet, seçilen ilgi alanıyla ya da en az 2 sinyalle çıkarılmış ilgi alanıyla eşleşen
    öğrencilere gider.
- **İstemci:**
  - Üst çubuktaki zil, okunmamış bildirim sayısını 30 saniyelik sorgulamayla günceller; sekme
    gizliyken sorgulama durur. SSE gerekmedi.
  - Profil sayfasından rızalar, WhatsApp numarası, kanal tercihleri ve ilgi alanları yönetilir.

## Sonuçlar

- Açık soru kapandı: gerçek hesaplar olmadan sistem çalışır (e-posta Mailpit'e düşer, WhatsApp
  kapalıdır). Hesaplar hazır olunca yalnızca `.env` değerleri değişir.
- Üretimde gerçek SMTP ve WhatsApp kullanmak için çıkış (egress) izni gerekir. API ve worker,
  dış ağa çıkabilen `edge` ağındadır.
