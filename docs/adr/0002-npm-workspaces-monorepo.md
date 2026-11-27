# 0002. npm workspaces monorepo

- Durum: Kabul edildi
- Tarih: 2026-11-28

## Bağlam

API, istemci ve ortak kod (tipler, Zod şemaları, Temporal yardımcıları, saf alan
kuralları) aynı depoda tutulacak. pnpm kapsam dışında bırakıldı.

## Karar

Depo bir **npm workspaces** monorepo'sudur:

| Workspace         | Paket adı          | İçerik                                                                        |
| ----------------- | ------------------ | ----------------------------------------------------------------------------- |
| `packages/shared` | `@etkinlik/shared` | Ortak tipler, Zod şemaları, Temporal yardımcıları, UUIDv7, saf alan kuralları |
| `apps/api`        | `@etkinlik/api`    | NestJS HTTP API ve worker                                                     |
| `apps/web`        | `@etkinlik/web`    | React + Vite PWA                                                              |

- `@etkinlik/shared` `tsc` ile `dist/` altına derlenir; diğer workspace'ler derlenmiş çıktıyı
  kullanır. Bu yüzden derleme sırası `shared` → `api`/`web` şeklindedir (`npm run build`).
- Tüm bağımlılıklar tam sürümle sabitlenir (`save-exact`); tek bir `package-lock.json` vardır.
- Kurulumda paket betikleri çalıştırılmaz (`NPM_CONFIG_IGNORE_SCRIPTS=true`); gereken üretim
  adımları (`prisma generate`, Playwright tarayıcı kurulumu) açık komutlarla yapılır.

## Sonuçlar

- Ortak şemalar API ile istemci arasında tek kaynaktan gelir.
- `shared` değişince bağımlı workspace'lerden önce yeniden derlenmesi gerekir.
