# 0003. Teknoloji yığını ve sürüm sabitleme

- Durum: Kabul edildi
- Tarih: 2026-11-28

## Bağlam

Geliştirme promptunun 5. bölümü yığını sabitler; sürüm yazılmayan satırlarda güncel kararlı
sürüm kullanılır. Aşama 0'da bazı "en güncel" sürümler birbiriyle uyumsuz çıktı.

## Karar

Yığın promptta yazıldığı gibidir. Aşama 0'da kullanılan sürümler ve sapmalar:

| Bileşen                                   | Sürüm                    | Not                                                                                                                                                                                    |
| ----------------------------------------- | ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Node.js                                   | 26 LTS (26.13.1)         | Temporal yerel olarak gelir                                                                                                                                                            |
| TypeScript                                | **6.0.3**                | En güncel 7.0, `typescript-eslint` 8.74 ile uyumsuz (`<6.1` istiyor). typescript-eslint TS 7'yi desteklediğinde yükseltilir.                                                           |
| ESLint                                    | **9.39.5**               | ESLint 10, `eslint-plugin-jsx-a11y` 6.10.2 ile uyumsuz. ESLint 9 resmi destek dışına çıktı; jsx-a11y ESLint 10'u desteklediğinde yükseltilir. Erişilebilirlik lint'i bu sapmaya değer. |
| NestJS                                    | 12.6.3                   |                                                                                                                                                                                        |
| Prisma                                    | **7.10.1**               | npm `latest` etiketi bir 8.0 sürüm adayı; promptta Prisma 7 istendiği için 7.10.1'de sabitlendi. `prisma-client` üreteci ve `@prisma/adapter-pg` kullanılır.                           |
| `effect` (Prisma'nın dolaylı bağımlılığı) | 3.22.5 (`overrides`)     | Prisma 7.10.1 `effect@3.20.0`'ı sabitliyor; bu sürümde yüksek önemde ReDoS açığı var. Aynı 3.x serisindeki yamalı sürüm zorlandı. Prisma güncellenince override kaldırılır.            |
| React / Vite / Tailwind                   | 19.3 / 8.4 / 4.3         |                                                                                                                                                                                        |
| Zod                                       | 4.6.7                    |                                                                                                                                                                                        |
| BullMQ / ioredis                          | 6.7.10 / 6.1.0           |                                                                                                                                                                                        |
| Sentry                                    | 11.20.0                  | `dataCollection` ile kişisel veri toplama tamamen kapalı (`packages/shared/src/observability`).                                                                                        |
| PostgreSQL / Redis                        | 18.7 / 8.12.0            |                                                                                                                                                                                        |
| Caddy / Garage / Keycloak                 | 2.11.9 / v2.6.0 / 26.8.2 |                                                                                                                                                                                        |

Onaylı ek paketler: `typescript-eslint`, `eslint-plugin-react-hooks`, `eslint-plugin-jsx-a11y`,
`prettier`, `vitest`, `unplugin-swc`, `nestjs-pino`/`pino`/`pino-http`, `vite-plugin-pwa`,
`@fontsource-*`. Yalnızca tip içeren `@types/express` ve geliştirme aracı `@devcontainers/cli`
de eklendi.

**`@nestjs/terminus` kullanılmadı:** sağlık uç noktaları ortak `HealthResponse` şemasıyla
(`@etkinlik/shared`) dönmeli. Terminus kendi yanıt biçimini dayattığı için küçük bir
`ReadinessService` yazıldı; bir bağımlılık eksildi.

**`uuid` paketi kullanılmadı:** UUIDv7 üreteci `packages/shared/src/ids/uuidv7.ts` içinde
RFC 9562'ye göre yazıldı ve özellik testleriyle doğrulandı.

## Sonuçlar

- Sürüm sapmaları geçicidir; Dependabot haftalık güncelleme açar, uyumluluk sağlanınca
  bu kayıt güncellenir.
