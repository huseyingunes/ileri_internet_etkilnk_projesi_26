# 0010. API sözleşmesi kararları

- Durum: Kabul edildi
- Tarih: 2026-11-28

## Bağlam

Prompt (bölüm 6), OpenAPI sözleşmesinin koddan önce yazılmasını istiyor: yollar `/api/v1` altında,
kaynak adları çoğul, en fazla iki düzey iç içe, tek hata gövdesi, sayfalama (varsayılan 20, en
fazla 100), idempotent oy/başvuru/QR, hız sınırı başlıkları ve ETag. Aşama 2'de bu kuralların
açık bıraktığı noktalar kararlaştırıldı.

## Karar

- **Sözleşme:** `docs/openapi/openapi.yaml` (yollar) ve `docs/openapi/components/*.yaml`
  (şemalar, parametreler, yanıtlar, başlıklar). JSON alanları camelCase. Dışarıya yalnızca
  UUIDv7 `public_id` açılır.
- **Yetki işaretleri:**
  - Her işlem izinli rolleri `x-roles` ile belirtir; `public` yalnızca `security: []` ile birlikte kullanılır.
  - `x-phase` işlemin uygulanacağı aşamayı gösterir.
  - `x-audited` denetim kaydına, `x-idempotent` idempotentliğe, `x-rate-limited` hız sınırına işaret eder.
- **Sayfalama imleç tabanlıdır:** `limit` + `cursor`, yanıtta `page.nextCursor`. Sayfa
  numarasına göre büyüyen listelerde kayma ve tekrar olmaz.
- **İdempotentlik doğal anahtarla sağlanır:** aynı oy, başvuru ya da QR okutması tekrarlanınca
  `200` ile mevcut kayıt döner; çakışan istek `409` alır. Ayrı bir `Idempotency-Key` başlığı yoktur.
- **Hız sınırı başlıkları:** `RateLimit-Limit`, `RateLimit-Remaining`, `RateLimit-Reset` ve
  `429` yanıtında `Retry-After`.
- **QR belirteci URL parçasında (`#…`) taşınır:** tarayıcı parçayı sunucuya göndermez, bu yüzden
  belirteç Caddy ve API erişim loglarına düşmez. PWA belirteci gövdede `POST /attendance-scans`
  ile gönderir.
- **Medya API üzerinden yüklenir** (`multipart/form-data`). Garage dışarıya kapalı `data`
  ağındadır; görsel türevleri de API'den akıtılır.
- **Durum değiştiren işlemler** (`POST`, `PUT`, `PATCH`, `DELETE`) Fetch Metadata denetimi
  nedeniyle `403` dönebilir.
- **Doğrulama:** `docs/openapi/redocly.yaml` proje kurallarını tanımlar (her işlemde `x-roles`
  ve `x-phase`, 4xx yanıtları, kebab-case yollar). `@redocly/cli` henüz onaylanmadığı için
  CI'a eklenmedi.

## Sonuçlar

- Her aşamada uygulanan uç noktalar bu sözleşmeye uymak zorundadır; ilgili Zod şemaları
  `packages/shared` içinde sözleşmeden türetilir.
- Sözleşme değişikliği önce bu dosyalarda yapılır, sonra koda yansır.
