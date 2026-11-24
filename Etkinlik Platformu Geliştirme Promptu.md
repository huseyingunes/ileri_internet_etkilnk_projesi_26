# Etkinlik Platformu Geliştirme Promptu

Nov 24, 2026 · @Mechasim Teknoloji

## 1. Görev ve çalışma şekli

Bu depoda bir üniversite için "Etkinlik Yönetimi ve Öğrenci Katılım Platformu" web uygulamasını sıfırdan geliştireceksin. Aşağıdaki mimari, teknoloji ve kural kararları kesindir; bunlara uyarak aşama aşama ilerle.

- Aşamalar bölüm 12'dedir. Her aşamada önce kısa bir plan sun, onayımı al, sonra uygula. Aşama bitince dur, özet ver ve sonraki aşama için onay bekle.
- Belirsiz ya da eksik bir gereksinim görürsen varsayım yapma, sor.
- Bu belgedeki bir kararı değiştirmen gerektiğini düşünürsen uygulamadan önce gerekçesiyle öner. Kabul edilirse `docs/adr/` altına karar kaydı yaz.
- Bu belgede adı geçmeyen bir kütüphane gerekiyorsa eklemeden önce öner ve onay al.
- Kod, tanımlayıcılar, kod yorumları ve commit mesajları İngilizce; arayüz metinleri ve `docs/` altındaki belgeler Türkçe yazılır.
- Her aşama ayrı dalda, küçük ve anlamlı commit'lerle ilerler; aşama sonunda PR açılır.
- Gizli bilgi depoya girmez; `.env.example` güncel tutulur.
- Yapay zekâ ajanı olarak yalıtılmış bir geliştirme konteynerinde çalış (`devcontainer-setup`).

Kurulu becerileri kullan; kurulu olmayanı atla ve bana bildir:

- HTML, CSS ve istemci JavaScript işlerinin başında `modern-web-guidance`.
- Tasarım sistemi, sayfa, bileşen, erişilebilirlik ve etkileşim işlerinde `ui-ux-pro-max` (bölüm 8).
- Güvenlik için Trail of Bits: `static-analysis`, `insecure-defaults`, `sharp-edges`, `supply-chain-risk-auditor`, `differential-review`, `property-based-testing`, `mutation-testing`, `spec-to-code-compliance`.
- Backend için wshobson: `backend-development`, `database-design`, `database-migrations`, `javascript-typescript`, `developer-essentials`.

## 2. Ürün gereksinimleri

Sistem; bilim, kültür ve spor etkinliklerinin öğrenci oylarıyla seçilmesini, başvuruların alınmasını, katılımın doğrulanmasını, puanlanmasını ve değerlendirilmesini sağlar.

### Roller ve yetkiler

| Yetki | Öğrenci | Danışman | Yönetici |
| --- | --- | --- | --- |
| Etkinlik oluşturma | Evet | Evet | Evet |
| Öğrenci etkinliklerini onaylama | Hayır | Evet | Evet |
| Etkinlikleri oylama | Evet | Hayır | Hayır |
| Etkinliklere başvurma | Evet | Hayır | Hayır |
| Günlük oylamaları belirleme | Hayır | Hayır | Evet |
| Etkinlik değerlendirme | Evet | Hayır | Hayır |
| Etkinlik fotoğraflarını yönetme | Hayır | Evet | Evet |
| İstatistikleri görüntüleme | Kişisel | Yetkili olduğu etkinlikler | Tümü |
| Sistem yönetimi | Hayır | Hayır | Evet |

### Temel kavramlar

- Kategoriler: Bilim, Kültür, Spor.
- Öğrenci toplulukları bağımsız varlıklardır; üyeleri ve danışmanları vardır.
- Etkinlik alanları: ad, açıklama, kategori, düzenleyen kişi veya topluluk, tarih, başlangıç ve bitiş saati, konum ve koordinatlar, kontenjan, kapak görseli, anahtar kelimeler, ilgili danışman, katılım koşulları.

### Akışlar

1. Etkinlik önerisi: Öğrenci, danışman veya yönetici etkinlik oluşturur. Öğrencinin etkinliği danışman onayından sonra, diğerleri doğrudan havuza girer.
2. Günlük seçim: Yönetici, onaylı havuzdan ertesi gün için her kategoriden üç, toplam dokuz etkinlik seçer.
3. Oylama: Öğrenci her kategoride en fazla bir etkinliğe oy verir. Süre bitince her kategoride en çok oyu alan kazanır ve kendi planlanan tarihinde takvime eklenir. Kazanamayanlar havuzda kalır ve yeniden oylanabilir.
4. Başvuru: Öğrenci takvimdeki etkinliğe başvurur ve başvurusunu iptal edebilir. Kontenjan dolunca bekleme listesi oluşur. Oy vermek ile başvurmak birbirinden bağımsızdır.
5. Katılım doğrulama: Etkinlik alanında dinamik QR, konum ve süre ile yapılır (bölüm 10).
6. Puanlama: Etkinlik bitip katılım doğrulandıktan sonra puanlar güncellenir (bölüm 3). Öğrenci puan geçmişini ve hangi etkinlikten kaç puan aldığını görür.
7. Liderlik tablosu: Her akademik yıl en yüksek puanlı 10 öğrenci listelenir; geçmiş yıllar arşivlenir. Öğrenci kendi sırasını, puanını ve katılım istatistiklerini görür.
8. Neden soruları: Etkinlikten sonra, kazanan etkinliğe oy vermiş öğrencilere açık uçlu tek soru sorulur. Katılana "Bu etkinliğe neden katıldınız?", katılmayana "Oy verdiğiniz bu etkinliğe neden katılmadınız?" sorulur.
9. Değerlendirme: Katılımı doğrulanan her öğrenci etkinliğe 1–5 puan ve yorum verir. Ortalama puanı ve yorumları ilgili danışman ile yönetici görür.
10. Arşiv: Gerçekleşen her etkinliğin sayfasında bilgiler, fotoğraf galerisi, katılımcı sayısı, oylama sonuçları ve ortalama puan bulunur. Fotoğrafı danışman ve yönetici yükler.
11. Bildirimler: Oylama sonucu, başvuru onayı, yaklaşan etkinlik hatırlatması, değerlendirme talebi ve kazanılan ya da kaybedilen puan bildirilir. Bildirim, öğrencinin iletişim iznine ve tercihine göre gönderilir.
12. İlgi alanları: Öğrenci ilgi alanlarını seçer; profil geçmiş oy, katılım ve değerlendirmelerle güncellenir. Oylamaya açılan etkinliğin anahtar kelimeleri öğrencinin ilgi alanlarıyla eşleşirse oylamaya davet bildirimi gider.
13. Yönetici paneli: Kayıtlı öğrenci sayısı, gerçekleşen etkinlik sayısı, oy verenlerin katılım oranı, ortalama etkinlik puanı, kategori bazında oy ve katılım sayıları, katılmama nedenleri dağılımı, toplulukların başarısı ve saatlere göre katılım gösterilir.

İlk sürümün kapsamı dışında: açık uçlu cevapların yapay zekâ ile sınıflandırılması. Yalnızca arayüzü tanımlanır; uygulaması sonraki aşamadır.

## 3. İş kuralları ve puanlama

Her öğrenci 1500 puanla başlar. Puanlar aşağıdaki sabit tabloyla değişir; değerler yönetici panelinden değiştirilebilir.

| Durum (kategori bazında) | Varsayılan puan |
| --- | --- |
| Oy verdiği etkinlik kazandı ve katıldı | +20 |
| Oy verdiği etkinlik kazandı ama katılmadı | −20 |
| Oy kullanmadı ama kazanan etkinliğe katıldı | +10 |
| Başka etkinliğe oy verdi ve kazanan etkinliğe katıldı | +30 |
| Başka etkinliğe oy verdi ve kazanan etkinliğe katılmadı | 0 |
| Oy kullanmadı ve katılmadı | 0 |

### İş kuralları

- Oylama her gün 00.00–23.59 arasında, Europe/Istanbul saatine göre yapılır.
- Öğrenci istediği kategoride oy kullanır; üç kategoride de oy vermek zorunda değildir.
- Eşitlikte kazananı yönetici belirler.
- Etkinliğin gerçekleşmesi için asgari oy eşiği tanımlanabilir; eşiğin altında kalan kategoride kazanan çıkmaz.
- Danışmanın onayladığı mazerette puan düşülmez.
- İptal edilen etkinlik puanları etkilemez.
- Oy verdiği hâlde kontenjan nedeniyle katılamayan öğrenci puan kaybetmez.
- Her akademik yıl başında puanlar 1500'e döner; geçmiş yılların sıralamaları saklanır.
- Gerçek Elo algoritması kullanılmaz; parametrik sabit puanlama yeterlidir.
- Giriş yalnızca üniversitenin kurumsal hesabıyla yapılır.

### Açık sorular

İlgili aşamaya başlamadan önce bana sor:

- Üretim alan adı nedir? (Aşama 0)
- Üniversitenin kimlik sağlayıcısı hangisi ve OIDC istemci bilgileri hazır mı? (Aşama 3)
- Oylama sürerken oy sayıları öğrencilere gösterilecek mi? (Aşama 5)
- Asgari oy eşiği, konum yarıçapı ve QR yenileme süresinin varsayılanları ne olacak? (Aşama 5 ve 7)
- WhatsApp Business hesabı ve onaylı şablonlar hazır mı? E-posta hangi sağlayıcıyla gönderilecek? (Aşama 10)
- Yapay zekâ sınıflandırması gelene kadar katılmama nedenleri dağılımı nasıl üretilecek? (Aşama 11)

## 4. Mimari

Uygulama tek kod tabanlı, tek dağıtımlı bir modüler monolittir.

### Depo yapısı

Depo bir npm workspaces monorepo'sudur.

- `apps/api`: NestJS. İki giriş noktası vardır: HTTP API ve worker.
- `apps/web`: React PWA.
- `packages/shared`: ortak tipler, doğrulama şemaları, tarih ve saat yardımcıları, saf alan kuralları.
- `design-system/etkinlik-platformu/`: `ui-ux-pro-max` ile üretilen `MASTER.md`, `tokens.css`, `tokens.json` ve sayfa bazlı `pages/*.md`.
- `docs/`: `gereksinimler.md`, `adr/`, `openapi/`, `isletim-kilavuzu.md`.

### Modüller ve katmanlar

- Modüller: kimlik ve yetki, topluluklar, etkinlik, oylama, başvuru, katılım doğrulama, puanlama ve liderlik, geri bildirim, bildirim, ilgi alanı, arşiv ve medya, analitik.
- Modül sınırı: Bir modül başka modülün tablolarına doğrudan erişmez; yalnızca o modülün dışa açtığı servis arayüzünü kullanır.
- Modül içi katmanlar: controller, uygulama servisi, alan kuralları, depo ve adaptör. Bağımlılık içe doğrudur.
- Alan kuralları (puanlama, süre hesabı, kazanan belirleme) çerçeveden bağımsız saf fonksiyonlardır.
- Dış servisler (kimlik sağlayıcı, WhatsApp, e-posta, nesne depolama, LLM) arayüz arkasındadır. Testte ve yerel geliştirmede bellek içi sahteleri kullanılır.

### Dağıtım

- Tek sunucuda Docker Compose. Servisler: Caddy, API, worker, PostgreSQL, Redis, nesne depolama. Yerel geliştirmede ek olarak Keycloak.
- Tek origin: Caddy istemcinin statik dosyalarını sunar ve `/api` yolunu API'ye yönlendirir. CORS kapalıdır.
- Üretim alan adı yayından önce sabitlenir ve değiştirilmez.

## 5. Teknolojiler

Aşağıdaki yığın sabittir; sürüm yazılmayan satırlarda güncel kararlı sürüm kullanılır.

| Katman | Seçim |
| --- | --- |
| Dil, çalışma zamanı | TypeScript (strict), Node.js 26 LTS |
| Backend | NestJS 12 |
| İstemci | React + Vite, PWA |
| Arayüz | Tailwind CSS; önce yerel HTML öğeleri, shadcn/ui yalnızca yerel karşılığı olmayan bileşenlerde |
| Veri çekme | TanStack Query |
| Grafik | Recharts |
| Veritabanı | PostgreSQL 18 |
| ORM, göç | Prisma 7 |
| Doğrulama | Zod şemaları, `packages/shared` içinde ortak |
| Tarih ve saat | Temporal; tarayıcıda yoksa `@js-temporal/polyfill` koşullu yüklenir |
| API | REST + JSON, OpenAPI |
| Kimlik doğrulama | OIDC ile üniversite SSO, sunucu taraflı oturum, rol tabanlı yetki |
| Önbellek, kuyruk | Redis + BullMQ |
| Dosya depolama | S3 uyumlu depolama: Garage (uygun olmazsa SeaweedFS, karar kaydıyla) |
| Bildirim | WhatsApp Cloud API, e-posta, uygulama içi |
| Gerçek zamanlı | Kısa aralıklı sorgulama; gerekirse SSE |
| Test | Birim testleri, Testcontainers, Playwright + axe-core, fast-check, mewt, k6 |
| Dağıtım | Docker Compose, Caddy, GitHub Actions |
| İzleme | Yapılandırılmış log, Sentry, sağlık uç noktaları |

Kullanılmayacaklar: mikroservis, Kubernetes, Kafka, RabbitMQ, Elasticsearch, MongoDB, GraphQL, WebSocket, MinIO, pnpm, dayjs, date-fns, GSAP.

## 6. Veritabanı ve API kuralları

Önce veri modeli, sonra API sözleşmesi, sonra modüller yazılır.

### Veritabanı

- Tipler: `timestamptz`, `text` + `CHECK`; birincil anahtar `bigint identity`; dışarıya açık kimlikler UUIDv7.
- Gerekli her sütun `NOT NULL` olur; her yabancı anahtar sütununa indeks eklenir.
- Tekillik kısıtları: oy (öğrenci, gün, kategori); başvuru (öğrenci, etkinlik); puan hareketi (öğrenci, etkinlik, kural); günlük oylama (gün, kategori, etkinlik).
- Aktif başvurular ve bekleme listesi için kısmi indeks kullanılır.
- Puanlar değiştirilemez bir hareket defterinde tutulur; toplam puan defterden türetilir. Puan kuralları ayrı bir tabloda durur. Akademik yıl bir sezondur.
- Kontenjan ve bekleme listesi transaction ve satır kilidiyle yönetilir.
- Yönetici işlemleri (kural değişikliği, eşitlik kararı, rol atama) denetim kaydına yazılır.
- Analitik için toplu SQL sorguları ve materialized view kullanılır.
- Göçler geriye uyumlu adımlarla yapılır (önce ekle, sonra kaldır). Canlı tabloda `CREATE INDEX CONCURRENTLY` kullanılır. Göçten önce yedek alınır, geri alma adımı yazılır, sonrasında veri doğrulanır.
- Gecelik yedek alınır; geri yükleme düzenli denenir.

### API

- OpenAPI sözleşmesi koddan önce yazılır; yollar `/api/v1` altındadır.
- Kaynak adları çoğul isimdir; en fazla iki düzey iç içe olur.
- Tek hata gövdesi kullanılır: kod, mesaj, alan hataları, istek kimliği. 401, 403, 422 ve 429 doğru ayrılır.
- Tüm liste uç noktalarında sayfalama vardır: varsayılan 20, en fazla 100.
- Hız sınırı başlıkları ve `Retry-After` döner.
- Oy, başvuru ve QR okutma idempotenttir: tekrar gönderilen istek aynı sonucu döner.
- N+1 sorgu yasaktır; ilişkiler tek sorguda yüklenir.
- Günün oylama listesi ve oy sayıları kısa ömürlü Redis önbelleğinde tutulur; etkinlik listelerinde ETag kullanılır.

## 7. Arka plan işleri ve dış servisler

Zamanlanmış ve uzun süren her iş worker'da, BullMQ kuyruğunda çalışır.

- İşler: oylamayı açma ve kapatma, kazananı belirleme, etkinlik hatırlatması, katılımı kesinleştirme, puan hesaplama, neden ve değerlendirme talebi gönderme, bildirim gönderme, görsel işleme, sezon kapatma.
- Her iş idempotenttir; üstel bekleme ve jitter ile yeniden denenir. Denemesi tükenen iş ölü mektup kuyruğuna düşer ve uyarı üretir.
- Her dış çağrıda zaman aşımı zorunludur.
- Bildirim modülü kanaldan bağımsızdır. WhatsApp yalnızca onaylı şablonla ve öğrencinin izniyle gönderir; kapalıyken uygulama içi bildirim çalışmaya devam eder.
- WhatsApp webhook'unda imza doğrulanır, hemen 200 dönülür, işleme kuyrukta yapılır ve yinelenen olay ayıklanır.
- Görsel işleme: yüklenen kapak görseli ve fotoğraflardan AVIF/WebP ve birkaç boyutta türev üretilir; en ve boy veritabanına yazılır.
- İlgi alanı eşleştirmesi ilk sürümde etiket kesişimidir (SQL).
- Her girdi sınırda Zod şemasıyla doğrulanır. Hatalar için özel hata sınıfları ve tek genel hata işleyici kullanılır; hatalar yutulmaz.
- API ve worker kapanırken süren istek ve işleri bitirir.
- Veritabanı bağlantı havuzu API ve worker için ayrı boyutlanır.
- Gözlemlenebilirlik: Her isteğe kimlik verilir; loglarda ve kuyruk işlerinde taşınır. İstek sayısı, hata oranı ve süre ölçülür. Liveness ve readiness ayrı uç noktalardır.

## 8. İstemci kuralları

İstemci, telefona kurulabilen tek bir React PWA'dır; ayrı mobil uygulama yazılmaz.

- Önce yerel HTML kullanılır: modal için `<dialog>`, açılır içerik için popover, formlarda yerel doğrulama.
- Tarayıcı desteği: Baseline "yaygın" özellikler serbesttir; daha yeni özellikler yalnızca `modern-web-guidance` kılavuzundaki yedeğiyle kullanılır.
- Erişilebilirlik hedefi WCAG 2.2 AA'dır. Grafiklerin yanında veri tablosu bulunur.
- Önbellek: Sürüm damgalı statik dosyalar önbellekten, sayfa kabuğu önce ağdan gelir. Oy, başvuru, katılım ve profil yanıtları service worker'da önbelleğe alınmaz.
- Görseller `srcset` ve `sizes` ile duyarlı sunulur; genişlik ve yükseklik belirtilir. İlk ekrandaki kapak görseli tembel yüklenmez; diğerleri tembel yüklenir.
- Yönetici paneli ve grafik kütüphanesi ayrı parça olarak, yalnızca açıldığında yüklenir.
- Kişisel veri ve oturum bilgisi `localStorage`'a yazılmaz.
- Tarih ve saat hesapları `packages/shared` içindeki Temporal yardımcılarıyla yapılır; `Date` ile hesap yapılmaz.

### Tasarım sistemi (ui-ux-pro-max)

Arayüzün görsel dili `ui-ux-pro-max` ile bir kez üretilir ve tüm ekranlar ondan beslenir.

1. Aşama 0'da tasarım sistemini üret ve kaydet. Sorgu örneği: `"university event platform student engagement voting" --design-system --persist --tokens css -p "Etkinlik Platformu" --output-dir <proje kökü>`. Öğrenci ekranları için `--density 5`, yönetici paneli için `--page "yonetici-paneli" --density 8` kullan. Sonucu, önizlemesiyle (`--preview`) birlikte onayıma sun.
2. Tailwind teması `tokens.css` içindeki CSS değişkenlerinden beslenir. Bileşenlerde ham hex renk ve sabit yazı tipi adı kullanılmaz.
3. Bir sayfa yazılmadan önce `MASTER.md` ve varsa `pages/<sayfa>.md` okunur; sayfa dosyası Master'ı geçersiz kılar.
4. Odaklı konular için tek alanlı arama yapılır (`--domain ux`, `--domain chart`, `--domain icons`); uygulama ayrıntısı için `--stack react`, `--stack html-tailwind`, `--stack shadcn` kullanılır.
5. `MASTER.md` varken `--force` onayım olmadan kullanılmaz. Sonuç boş dönerse bir kez daraltıp yeniden aranır; yine boşsa genel varsayılan kullanıldığı belirtilir.
6. Her ekran teslimden önce `references/pro-rules.md` kontrol listesinden geçer.

Temel ölçüler: dokunma hedefi en az 44×44 px, gövde metni 16 px, kontrast en az 4.5:1, mobil öncelikli düzen, yatay kaydırma yok, alt gezinmede en fazla 5 öğe, ikonlar SVG (emoji yok). Hata mesajı alanın yanında gösterilir; etiket hiçbir zaman yalnızca placeholder olmaz.

Çelişkide bu belge kazanır: yerel HTML önceliği, WCAG 2.2 AA, Recharts ve CSS animasyonu geçerlidir. GSAP eklenmez; hareket `transform` ve `opacity` ile sınırlıdır ve `prefers-reduced-motion` dikkate alınır. Eklentinin önerdiği yazı tipleri sitenin kendi sunucusundan sunulur; CSP gereği dış yazı tipi servisi kullanılmaz.

## 9. Güvenlik ve gizlilik kuralları

Güvenlik varsayılanları ilk aşamadan itibaren zorunlu açıktır; sonradan eklenmez.

### Yapılandırma ve varsayılanlar

- Zorunlu ortam değişkeni eksikse uygulama açılmaz; gizli anahtar ve parola için varsayılan değer yoktur.
- Kimlik doğrulama, CORS ve hata ayıklama ayarlarının varsayılanı güvenli taraftır; hata ayrıntısı yanıtlara sızmaz.
- QR ömrü, konum yarıçapı, kontenjan, puan kuralı ve hız sınırı değerleri şemayla doğrulanır; 0, boş ve negatif değer reddedilir.
- Tohum veride varsayılan yönetici hesabı ve parolası oluşturulmaz. İlk yönetici, ortam değişkeninde verilen kurumsal e-posta adresiyle ilk girişinde atanır.
- Depolama kovası varsayılan olarak özeldir.

### Oturum ve yetki

- Oturum çerezi `__Host-` öneklidir ve `Secure; HttpOnly; SameSite=Lax` taşır. Girişte yeni oturum kimliği üretilir; zaman aşımı pozitif olmak zorundadır.
- OIDC dönüşü GET ile yapılır; `form_post` kullanılmaz. Çıkışta `Clear-Site-Data` gönderilir.
- Yetki varsayılan olarak reddedilir; rol denetimi merkezidir; roller enum'dur.
- Öğrenci kimliği istekten değil oturumdan alınır; danışman yalnızca kendi etkinliklerine erişir.
- Oy, QR doğrulama ve profil uç noktalarında Redis tabanlı hız sınırı vardır.

### Başlıklar

- Hash tabanlı sıkı CSP, `object-src 'none'`, `base-uri 'none'`, `frame-ancestors 'self'`.
- Trusted Types önce yalnızca raporlama modunda açılır; ihlal sıfırlanınca zorunlu olur.
- HSTS (kısa süreyle başlar, artırılır), `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, COOP `same-origin-allow-popups`.
- `Permissions-Policy`: konum yalnızca kendi origin'imize açıktır; kamera ve mikrofon kapalıdır.
- API'de Fetch Metadata denetimi yapılır; ihlal raporları API'deki bir rapor uç noktasına düşer.

### Kod kuralları

- Kullanıcı metinleri düz metin olarak saklanır ve gösterilir; HTML kabul edilmez. `innerHTML` ve `dangerouslySetInnerHTML` yasaktır.
- SQL metni birleştirerek sorgu kurmak yasaktır.
- `===` zorunludur. Kullanıcı girdisiyle `obj[key]` ataması, iç içe niceleyicili regex ve güvenlik sınırında `any`, `as`, `!` yasaktır; eksik `await` lint ile yakalanır.
- Belirteç ve imza karşılaştırmaları `crypto.timingSafeEqual` ile yapılır; imza algoritması istekten alınmaz.

### Gizlilik (KVKK)

- Ham koordinat saklanmaz; yalnızca doğrulama sonucu, etkinlik noktasına uzaklık ve zaman tutulur.
- Loglarda öğrenci numarası, telefon ve koordinat maskelenir.
- Konum, WhatsApp ve fotoğraf için ayrı açık rıza kaydı tutulur; rıza geri alınabilir.
- Profilde "verilerimi indir" ve "verilerimi sil" akışları bulunur.

## 10. Katılım doğrulama tasarımı

Öğrenci, etkinlik alanında QR okutup konumu doğrulandığında ve etkinlik süresinin en az %50'sinde alanda bulunduğunda katılmış sayılır.

1. Etkinliğin QR sayfasını danışman ya da yönetici ekranda gösterir. QR, 20–30 saniyede bir yenilenen, sunucu imzalı, kısa ömürlü bir belirteç taşıyan HTTPS bağlantısıdır.
2. Öğrenci QR'ı telefonunun kendi kamerasıyla okutur; bağlantı PWA'yı açar. Uygulama içi kamera kullanılmaz.
3. Sayfa konumun neden istendiğini açıklar; konum izni öğrencinin dokunuşuyla istenir.
4. Sunucu belirteci, oturumu ve konumu doğrular. Belirteç süresi geçmemiş ve bu etkinliğe ait olmalıdır. Konum, etkinlik koordinatına etkinlik bazında ayarlanabilir yarıçap içinde olmalıdır.
5. Girişte ve çıkışta okutma yapılır; istenirse rastgele bir ara yoklama eklenir. İlk ve son geçerli okutma arasındaki süre, etkinlik süresinin en az yarısı olmalıdır. Örnek: 120 dakikalık etkinlikte en az 60 dakika.
6. Aynı belirteçle tekrar okutma aynı sonucu döner; okutma uç noktası hız sınırlıdır.
7. Etkinlik bitince bir iş katılımı kesinleştirir ve puanlamayı tetikler.

Bilinen sınırlar: Tarayıcı arka planda konum izleyemez, kapalı alanda GPS sapar ve sahte konum tamamen engellenemez. Bu yüzden yarıçap ayarlanabilir tutulur; QR, konum ve kurumsal oturum birlikte aranır.

## 11. Test ve CI

Bir aşama, testleri ve otomatik denetimleri geçmeden tamamlanmış sayılmaz.

### Testler

- Birim testleri: Alan kuralları saf fonksiyon olarak test edilir.
- Entegrasyon testleri: Uç noktalar gerçek PostgreSQL ve Redis ile test edilir (Testcontainers).
- Uçtan uca testler: Playwright ile oy, başvuru, QR ile katılım ve puanlama akışları; her senaryoda axe-core denetimi. Bu akışlar ayrıca klavye ve ekran okuyucuyla elle denenir.
- Mutasyon testi (mewt): puanlama, katılım doğrulama ve yetki modüllerinde.
- Yük testi (k6): etkinlik başındaki QR doğrulama yoğunluğu ve oylama kapanışı.

Özellik testleri (fast-check) şu kuralları doğrular:

- Puan toplamı defterdeki hareketlerin toplamına eşittir; aynı etkinlik iki kez puanlanmaz.
- Üretilen QR belirteci doğrulanır; süresi geçmiş ya da başka etkinliğe ait olan reddedilir.
- Öğrenci, gün ve kategori başına en fazla bir oy vardır.
- Onaylı başvuru sayısı kontenjanı aşmaz.
- %50 süre hesabı sınır değerlerde doğrudur.

### CI ve incelemeler

- GitHub Actions her PR'da lint, tip denetimi, testler, Semgrep, CodeQL (JS/TS) ve bağımlılık denetimi çalıştırır.
- Semgrep kural setleri: `p/security-audit`, `p/secrets`, `p/typescript`, `p/react`, `p/nodejs`, `p/dockerfile`, `p/github-actions` ve Trail of Bits kuralları; her komutta `--metrics=off`.
- Projeye özel Semgrep kuralları: `innerHTML` yasağı, SQL metni birleştirme yasağı, yetki denetimi olmayan controller.
- Kimlik, yetki, puanlama ve katılım doğrulama dosyalarına dokunan PR'larda `differential-review` çalıştırılır.
- Her sürüm öncesi `spec-to-code-compliance`, `docs/gereksinimler.md` ile kodu karşılaştırır; `insecure-defaults` ve `sharp-edges` tam tarama yapar.
- İş akışına yapay zekâ ajanı eklenirse `agentic-actions-auditor` ile denetlenir.

## 12. Aşamalar ve ilk adım

Geliştirme 13 aşamada ilerler; her aşamanın sonunda dur ve onay bekle.

| Aşama | Kapsam |
| --- | --- |
| 0 | İskelet: monorepo, lint ve tip denetimi, Docker Compose, CI, sağlık uç noktaları, `CLAUDE.md`, `docs/gereksinimler.md`, ilk karar kayıtları, tasarım sistemi ve token'lar |
| 1 | Veri modeli ve göçler: şemanın tamamı, onaydan sonra uygulanır |
| 2 | OpenAPI sözleşmesi: tüm uç noktalar, onaydan sonra uygulanır |
| 3 | Kimlik ve yetki (OIDC, oturum, roller), topluluklar, güvenlik başlıkları |
| 4 | Etkinlik oluşturma, danışman onayı, havuz, kapak görseli |
| 5 | Günlük seçim, oylama, kapanış işi, eşitlik kararı |
| 6 | Takvim, başvuru, kontenjan, bekleme listesi |
| 7 | Katılım doğrulama: QR, konum, süre |
| 8 | Puanlama, puan geçmişi, liderlik tablosu, sezon |
| 9 | Neden soruları, değerlendirme, arşiv ve fotoğraf galerisi |
| 10 | Bildirimler (uygulama içi, e-posta, WhatsApp adaptörü), ilgi alanı eşleştirme |
| 11 | Yönetici paneli ve analitik |
| 12 | Sertleştirme: güvenlik taramaları, erişilebilirlik, yük testi, yedek ve geri yükleme, işletim kılavuzu |

### Bitti tanımı

Bir aşama şu koşulların hepsi sağlandığında biter:

- Kapsamdaki gereksinimler çalışır ve testleri yazılmıştır.
- Lint, tip denetimi, testler ve CI denetimleri geçer.
- OpenAPI, göçler ve `docs/` günceldir.
- Bölüm 9'daki güvenlik ve gizlilik kuralları sağlanır.
- İstemci ekranları klavyeyle kullanılabilir ve axe-core denetiminden geçer.
- İstemci ekranları tasarım sistemi token'larını kullanır ve `ui-ux-pro-max` teslim öncesi kontrol listesinden geçer.

### İlk adım

Depoyu incele. Ardından yalnızca Aşama 0 için planını yaz: klasör yapısı, kurulacak paketler, Compose servisleri ve CI adımları. Bu belgedeki kalıcı kuralları `CLAUDE.md` dosyasına, bölüm 2 ve 3'ü `docs/gereksinimler.md` dosyasına taşımayı plana ekle. Planı göster ve onayımı bekle; onay vermeden kod yazma.
