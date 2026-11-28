# CLAUDE.md

Üniversite için **Etkinlik Yönetimi ve Öğrenci Katılım Platformu**. Ürün gereksinimleri ve iş
kuralları: [docs/gereksinimler.md](docs/gereksinimler.md). Kararlar: [docs/adr/](docs/adr/).
Asıl kaynak: [docs/kaynak/gelistirme-promptu.md](docs/kaynak/gelistirme-promptu.md) (çelişkide o kazanır).

## Çalışma şekli

- Geliştirme 13 aşamada ilerler (promptun 12. bölümü). Her aşamada önce kısa plan sun, onay al,
  uygula; aşama bitince dur, özet ver, onay bekle.
- Belirsiz ya da eksik gereksinimde varsayım yapma, sor. Bir kararı değiştirmek gerekirse önce
  gerekçesiyle öner; kabul edilirse `docs/adr/` altına kayıt yaz.
- Promptta adı geçmeyen kütüphaneyi eklemeden önce öner ve onay al.
- **Dil:** kod, tanımlayıcılar, kod yorumları, commit mesajları İngilizce; arayüz metinleri ve
  `docs/` Türkçe.
- Her aşama ayrı dalda (`phase-N/<konu>`), küçük ve anlamlı commit'lerle ilerler; sonunda PR açılır.
- Gizli bilgi depoya girmez; `.env.example` güncel tutulur.
- Komutlar dev container içinde çalışır (Node 26): `devcontainer exec --workspace-folder . <komut>`.
- Beceriler: HTML/CSS/istemci JS işinin başında `modern-web-guidance`; arayüz işlerinde
  `ui-ux-pro-max`; güvenlikte Trail of Bits (`static-analysis`, `insecure-defaults`, `sharp-edges`,
  `supply-chain-risk-auditor`, `differential-review`, `property-based-testing`, `mutation-testing`,
  `spec-to-code-compliance`, `agentic-actions-auditor`); backend'de wshobson (`backend-development`,
  `database-design`, `database-migrations`, `javascript-typescript`, `developer-essentials`).

## Komutlar

```sh
npm run build -w @etkinlik/shared   # diğer workspace'lerden önce
npm run lint && npm run format:check && npm run typecheck
npm test                            # birim (Vitest)
npm run test:integration            # Testcontainers: PostgreSQL 18 + Redis 8
npm run test:e2e                    # Playwright + axe-core
docker compose --profile tools run --rm migrate   # göç (önce yedek: docs/isletim-kilavuzu.md)
docker compose -f compose.yaml -f compose.dev.yaml up -d --build
```

## Mimari

- Tek kod tabanlı, tek dağıtımlı **modüler monolit** ([ADR 0001](docs/adr/0001-moduler-monolit.md)).
  npm workspaces: `apps/api` (NestJS; giriş noktaları `src/main.ts` ve `src/worker.ts`),
  `apps/web` (React PWA), `packages/shared` (tipler, Zod şemaları, Temporal yardımcıları, saf kurallar).
- Bir modül başka modülün tablolarına doğrudan erişmez; yalnızca dışa açtığı servis arayüzünü kullanır.
- Katmanlar: controller → uygulama servisi → alan kuralları → depo/adaptör; bağımlılık içe doğru.
- Alan kuralları (puanlama, süre hesabı, kazanan belirleme) çerçeveden bağımsız saf fonksiyonlardır.
- Dış servisler (IdP, WhatsApp, e-posta, nesne depolama, LLM) arayüz arkasında; testte bellek içi sahte.
- Tek origin: Caddy statik dosyaları sunar, `/api` → API. **CORS kapalı** ([ADR 0004](docs/adr/0004-tek-origin-cors-kapali.md)).
- Origin: `APP_ORIGIN`; yerel `https://etkinlik.localhost`, üretim `https://haber10da.net` ([ADR 0007](docs/adr/0007-alan-adi-ve-origin.md)).

## Yığın

TypeScript strict, Node 26 LTS, NestJS 12, React + Vite PWA, Tailwind (önce yerel HTML; shadcn/ui
yalnızca yerel karşılığı yoksa), TanStack Query, Recharts, PostgreSQL 18, Prisma 7, Zod (ortak),
Temporal, REST + OpenAPI, OIDC + sunucu taraflı oturum, Redis + BullMQ, Garage (S3), WhatsApp
Cloud API + e-posta + uygulama içi bildirim, kısa aralıklı sorgulama (gerekirse SSE), Docker
Compose + Caddy + GitHub Actions, yapılandırılmış log + Sentry. Sürümler: [ADR 0003](docs/adr/0003-teknoloji-yigini.md).

**Kullanılmaz:** mikroservis, Kubernetes, Kafka, RabbitMQ, Elasticsearch, MongoDB, GraphQL,
WebSocket, MinIO, pnpm, dayjs, date-fns, GSAP (ESLint `no-restricted-imports` ile engelli).

## Veritabanı

- Sıra: önce veri modeli, sonra OpenAPI sözleşmesi, sonra modüller.
- **Göçler elle yazılan SQL'dir** (`apps/api/prisma/migrations/*/migration.sql` + `down.sql`); `schema.prisma` `prisma db pull` ile üretilir, elle düzenlenmez ([ADR 0009](docs/adr/0009-sql-gocleri.md)). Tablolar `text + CHECK`, kısmi indeks ve trigger kullanır; Prisma şeması bunları göstermez.
- `timestamptz`; `text` + `CHECK`; birincil anahtar `bigint identity`; dışa açık kimlikler UUIDv7.
- Gerekli sütunlar `NOT NULL`; her yabancı anahtar sütununa indeks.
- Tekillik: oy (öğrenci, gün, kategori); başvuru (öğrenci, etkinlik); puan hareketi
  (öğrenci, etkinlik, kural); günlük oylama (gün, kategori, etkinlik).
- Aktif başvuru ve bekleme listesi için kısmi indeks.
- Puanlar değiştirilemez hareket defterinde; toplam defterden türetilir. Puan kuralları ayrı
  tabloda. Akademik yıl bir sezondur.
- Kontenjan ve bekleme listesi transaction + satır kilidiyle.
- Yönetici işlemleri (kural değişikliği, eşitlik kararı, rol atama) denetim kaydına yazılır.
- Analitik: toplu SQL ve materialized view.
- Göçler geriye uyumlu (önce ekle, sonra kaldır); canlı tabloda `CREATE INDEX CONCURRENTLY`;
  göç öncesi yedek, geri alma adımı, sonrasında veri doğrulama.

## API

- OpenAPI ([docs/openapi/openapi.yaml](docs/openapi/openapi.yaml)) koddan önce yazılır; yollar `/api/v1`.
- Sözleşme çok dosyalıdır (`docs/openapi/components/`); her işlem `x-roles` ve `x-phase` taşır. Sayfalama imleç tabanlıdır (`limit` + `cursor` → `page.nextCursor`). QR belirteci URL parçasında (`#`) taşınır ([ADR 0010](docs/adr/0010-api-sozlesmesi.md)).
- Kaynak adları çoğul; en fazla iki düzey iç içe.
- Tek hata gövdesi `{ code, message, fieldErrors, requestId }` (`@etkinlik/shared`
  `errorBodySchema`); 401, 403, 422, 429 doğru ayrılır. Hatalar yalnızca
  `GlobalExceptionFilter`'dan çıkar; özel hata sınıfları `apps/api/src/common/errors.ts`.
- Listelerde sayfalama: varsayılan 20, en fazla 100 (`pageSizeSchema`).
- Hız sınırı başlıkları ve `Retry-After`. Oy, başvuru ve QR okutma idempotent.
- N+1 yasak; ilişkiler tek sorguda. Günün oylama listesi ve oy sayıları kısa ömürlü Redis
  önbelleğinde; etkinlik listelerinde ETag.
- Her girdi sınırda Zod ile doğrulanır.

## Arka plan işleri

- Zamanlanmış ve uzun işler worker'da, BullMQ'da. Her iş idempotent; üstel bekleme + jitter
  (`DEFAULT_JOB_OPTIONS`); tükenen iş ölü mektup kuyruğuna düşer ve `ALERT` logu üretir.
- Her dış çağrıda zaman aşımı zorunlu (`withTimeout`, `EXTERNAL_CALL_TIMEOUT_MS`).
- Bildirim kanaldan bağımsız; WhatsApp yalnızca onaylı şablon + öğrenci izniyle. Webhook'ta
  imza doğrulanır, hemen 200 dönülür, işleme kuyrukta, yinelenen olay ayıklanır.
- API ve worker kapanırken süren istek ve işleri bitirir. DB havuzu API/worker için ayrı.
- Her isteğe UUIDv7 istek kimliği (`X-Request-Id`); loglarda ve kuyruk işlerinde taşınır.

## İstemci

- Tek React PWA. Önce yerel HTML: modal `<dialog>`, açılır içerik popover, yerel form doğrulama.
- Baseline "yaygın" özellikler serbest; daha yenileri yalnızca `modern-web-guidance` yedeğiyle.
- WCAG 2.2 AA; grafiklerin yanında veri tablosu.
- Service worker: sürüm damgalı statikler önbellekten, kabuk önce ağdan. Oy, başvuru, katılım ve
  profil yanıtları önbelleğe alınmaz.
- Görseller `srcset`/`sizes`, genişlik/yükseklik belirtilir; ilk ekrandaki kapak tembel yüklenmez.
- Yönetici paneli ve grafik kütüphanesi ayrı parça (lazy).
- Kişisel veri ve oturum bilgisi `localStorage`'a yazılmaz.
- Tarih/saat yalnızca `@etkinlik/shared` Temporal yardımcılarıyla; `Date` ile hesap yasak (lint).
- **Tasarım sistemi:** `design-system/etkinlik-platformu/`. Sayfa yazmadan önce `MASTER.md` ve varsa
  `pages/<sayfa>.md` okunur (sayfa dosyası Master'ı geçersiz kılar). Tailwind teması `tokens.css`
  değişkenlerinden beslenir; bileşenlerde ham hex ve sabit yazı tipi adı yok. `MASTER.md` varken
  `--force` onaysız kullanılmaz. Her ekran teslimden önce `ui-ux-pro-max` `references/pro-rules.md`
  kontrol listesinden geçer.
- Ölçüler: dokunma hedefi ≥ 44×44 px, gövde 16 px, kontrast ≥ 4.5:1, mobil öncelikli, yatay kaydırma
  yok, alt gezinmede ≤ 5 öğe, SVG ikon (emoji yok), hata mesajı alanın yanında, etiket asla yalnızca
  placeholder değil.
- Hareket yalnızca `transform`/`opacity`, `prefers-reduced-motion` dikkate alınır. Yazı tipleri kendi
  sunucumuzdan (`@fontsource`); dış yazı tipi servisi yok.

## Güvenlik ve gizlilik

- Zorunlu ortam değişkeni eksikse uygulama açılmaz (`apps/api/src/config/env.ts`); gizli değerin
  varsayılanı yok. QR ömrü, yarıçap, kontenjan, puan kuralı, hız sınırı şemayla doğrulanır;
  0, boş, negatif reddedilir.
- Tohum veride varsayılan yönetici yok; ilk yönetici ortam değişkenindeki kurumsal e-postayla
  ilk girişinde atanır. Depolama kovası özel.
- Oturum çerezi `__Host-`, `Secure; HttpOnly; SameSite=Lax`; girişte yeni oturum kimliği;
  zaman aşımı pozitif. OIDC dönüşü GET (`form_post` yok). Çıkışta `Clear-Site-Data`.
- **Yetki varsayılan olarak reddedilir** (`DefaultDenyGuard`). Her route `@Public()` ya da
  `@Roles(...)` taşımak zorunda (Semgrep kuralı). Roller enum. Öğrenci kimliği oturumdan alınır;
  danışman yalnızca kendi etkinliklerine erişir.
- Oy, QR doğrulama ve profil uç noktalarında Redis tabanlı hız sınırı.
- Başlıklar (Caddy): sıkı CSP, `object-src 'none'`, `base-uri 'none'`, `frame-ancestors 'self'`;
  Trusted Types önce rapor modunda; HSTS kısa başlar; `nosniff`; `Referrer-Policy:
strict-origin-when-cross-origin`; COOP `same-origin-allow-popups`; `Permissions-Policy` konum
  yalnızca self, kamera/mikrofon kapalı. API'de Fetch Metadata denetimi; ihlal raporları API'ye.
- Kod: kullanıcı metni düz metin; `innerHTML`/`dangerouslySetInnerHTML` yasak. SQL birleştirme yasak
  (yalnızca etiketli `$queryRaw`). `===` zorunlu. Kullanıcı girdisiyle `obj[key]` ataması, iç içe
  niceleyicili regex, güvenlik sınırında `any`/`as`/`!` yasak; eksik `await` lint ile yakalanır.
  Belirteç/imza karşılaştırması `crypto.timingSafeEqual`; imza algoritması istekten alınmaz.
- KVKK: ham koordinat saklanmaz (yalnızca sonuç, uzaklık, zaman). Loglarda öğrenci numarası,
  telefon, koordinat maskelenir (`REDACT_PATHS`). Konum, WhatsApp, fotoğraf için ayrı, geri
  alınabilir açık rıza. "Verilerimi indir" ve "verilerimi sil" akışları. Sentry kişisel veri toplamaz.

## Katılım doğrulama

QR (20–30 sn'de yenilenen, sunucu imzalı, kısa ömürlü belirteçli HTTPS bağlantısı; telefonun
kendi kamerasıyla okutulur) + konum (etkinlik bazında ayarlanabilir yarıçap) + süre (giriş ve
çıkış okutması arası ≥ etkinlik süresinin %50'si). Okutma idempotent ve hız sınırlı. Etkinlik
bitince bir iş katılımı kesinleştirir ve puanlamayı tetikler. Ayrıntı: promptun 10. bölümü.

## Test ve CI

- Bitti tanımı: gereksinim çalışır ve testli; lint, tip, testler, CI geçer; OpenAPI, göçler ve
  `docs/` güncel; güvenlik kuralları sağlanır; ekranlar klavyeyle kullanılabilir, axe-core'dan
  geçer, token'ları kullanır ve pro-rules kontrol listesinden geçer.
- Birim (saf kurallar), entegrasyon (gerçek PostgreSQL/Redis, Testcontainers), uçtan uca
  (Playwright + axe-core; ayrıca klavye ve ekran okuyucuyla elle), mutasyon (mewt: puanlama,
  katılım, yetki), yük (k6: QR yoğunluğu, oylama kapanışı).
- fast-check özellikleri: puan toplamı = defter toplamı ve çift puanlama yok; QR belirteci
  doğrulanır, süresi geçmiş/başka etkinliğin belirteci reddedilir; öğrenci-gün-kategori başına
  ≤ 1 oy; onaylı başvuru ≤ kontenjan; %50 süre hesabı sınırlarda doğru.
- CI (her PR): lint, tip, testler, Semgrep (`--metrics=off`; `p/security-audit`, `p/secrets`,
  `p/typescript`, `p/react`, `p/nodejs`, `p/dockerfile`, `p/github-actions`, `p/trailofbits`,
  `tools/semgrep/`), CodeQL, bağımlılık denetimi. Action'lar SHA ile sabit.
- Kimlik, yetki, puanlama ve katılım dosyalarına dokunan PR'larda `differential-review`.
  Sürüm öncesi `spec-to-code-compliance`, `insecure-defaults`, `sharp-edges` tam tarama.
  İş akışına yapay zekâ ajanı eklenirse `agentic-actions-auditor`.
- Semgrep bulgusu yalnızca gerekçesi yazılı `nosemgrep` ile susturulur.
