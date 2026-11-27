# 0006. Test koşucusu: Vitest

- Durum: Kabul edildi
- Tarih: 2026-11-28

## Bağlam

Prompt birim, entegrasyon (Testcontainers), özellik (fast-check), mutasyon (mewt), uçtan uca
(Playwright) ve yük (k6) testlerini istiyor, ancak birim/entegrasyon test koşucusunu
belirtmiyor. Kod ESM ve TypeScript strict; istemci Vite ile derleniyor.

## Karar

- Birim ve entegrasyon testleri **Vitest** ile çalışır.
- NestJS dekoratör metadata'sı için API testlerinde `unplugin-swc` kullanılır.
- `apps/api` iki Vitest projesine ayrılır: `unit` (`src/**/*.test.ts`) ve `integration`
  (`test/**/*.int.test.ts`, gerçek PostgreSQL 18 ve Redis 8 konteynerleri).
- Uçtan uca testler Playwright Test + `@axe-core/playwright` ile ayrı çalışır.

## Değerlendirilen seçenek

- **Jest:** ESM desteği hâlâ deneysel bayraklar gerektiriyor; Vite yapılandırmasını
  paylaşamıyor.

## Sonuçlar

- `npm test` birim testlerini, `npm run test:integration` entegrasyon testlerini çalıştırır.
- Entegrasyon testleri Docker gerektirir (dev container ve CI'da mevcut).
