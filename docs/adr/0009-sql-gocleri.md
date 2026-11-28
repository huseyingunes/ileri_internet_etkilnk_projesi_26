# 0009. SQL göçleri ve üretilen Prisma şeması

- Durum: Kabul edildi
- Tarih: 2026-11-28

## Bağlam

Veritabanı kuralları (prompt bölüm 6) Prisma şemasının ifade edemediği yapılar istiyor:

- `text` + `CHECK` ile numaralandırmalar ve iş kuralları
- `GENERATED ALWAYS AS IDENTITY` birincil anahtarlar
- Aktif başvurular ve bekleme listesi için kısmi indeksler
- Bileşik yabancı anahtarlar (oy ↔ günlük oylama)
- Sezonların çakışmasını engelleyen `EXCLUDE` kısıtı
- Puan defteri ve denetim kaydının değiştirilemezliği (trigger)
- Günlük seçimde "kategori başına en fazla 3 etkinlik" kuralı (trigger)

## Karar

- **Tek kaynak SQL'dir.** Her göç `apps/api/prisma/migrations/<zaman>_<ad>/migration.sql` dosyasında
  elle yazılır ve `prisma migrate deploy` ile uygulanır.
- Her göçün yanında bir `down.sql` geri alma betiği bulunur ve entegrasyon testinde çalıştırılır.
- `prisma/schema.prisma`, göç uygulanmış veritabanından `prisma db pull` ile **üretilir**.
  Elle düzenlenmez. Entegrasyon testi `db pull --print` çıktısını depodaki dosyayla karşılaştırır
  (sapma denetimi).
- Model adları tablo adlarıyla aynıdır (`users`, `score_ledger`, …). Alan türleri depo
  katmanında karşılanır; dışarıya Prisma tipleri değil, `@etkinlik/shared` şemaları açılır.
- Dışarıya açık kimlikler PostgreSQL 18'in yerleşik `uuidv7()` fonksiyonuyla üretilir.
- Göçler üretimde API açılışında çalışmaz. Önce yedek alınır, sonra
  `docker compose --profile tools run --rm migrate` çalıştırılır.

## Sonuçlar

- Kısıtlar veritabanında zorunlu tutulur ve uygulama hatalarına karşı son savunma hattı olur.
  Kısıt ihlalleri uygulama katmanında 409/422'ye eşlenecektir (Aşama 3 ve sonrası).
- `prisma migrate dev` ile otomatik göç üretilmez; yeni göç her zaman elle yazılan SQL'dir.
