# İşletim kılavuzu

> Aşama 0 iskeleti. Yedekleme, geri yükleme, izleme ve olay müdahalesi bölümleri
> Aşama 12'de tamamlanır.

## Gereksinimler

- Docker Engine ve Docker Compose v2
- Geliştirme için ek olarak: VS Code + Dev Containers eklentisi ya da `@devcontainers/cli`

## Geliştirme ortamı

Node 26 ve tüm araçlar dev container içindedir; ana makineye Node kurmak gerekmez.
Ayrıntı: [ADR 0008](adr/0008-gelistirme-konteyneri.md).

```sh
devcontainer up --workspace-folder .
devcontainer exec --workspace-folder . npm install
devcontainer exec --workspace-folder . npm run build -w @etkinlik/shared
devcontainer exec --workspace-folder . npm run lint
devcontainer exec --workspace-folder . npm run typecheck
devcontainer exec --workspace-folder . npm test
devcontainer exec --workspace-folder . npm run test:integration
devcontainer exec --workspace-folder . npm run test:e2e
```

## Ortam değişkenleri

`.env.example` dosyasını `.env` olarak kopyalayın ve **tüm** değerleri doldurun.
Gizli değerlerin varsayılanı yoktur; eksik değer varsa Compose da uygulama da başlamaz.

| Değişken                                                                      | Zorunlu        | Açıklama                                                                                                                                                                                           |
| ----------------------------------------------------------------------------- | -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `APP_ORIGIN`                                                                  | Evet           | Tek origin, yalnızca `https://`. Yerel: `https://etkinlik.localhost`, üretim: `https://haber10da.net`                                                                                              |
| `SITE_ADDRESS`                                                                | Evet           | `APP_ORIGIN`'in host kısmı (Caddy TLS için)                                                                                                                                                        |
| `POSTGRES_USER`, `POSTGRES_DB`                                                | Evet           | Veritabanı kullanıcısı ve adı                                                                                                                                                                      |
| `POSTGRES_PASSWORD`                                                           | Evet           | URL'de güvenli karakterler kullanın (ör. `openssl rand -hex 32`)                                                                                                                                   |
| `REDIS_PASSWORD`                                                              | Evet           | Redis parolası                                                                                                                                                                                     |
| `GARAGE_RPC_SECRET`                                                           | Evet           | Tam 64 onaltılık karakter (`openssl rand -hex 32`)                                                                                                                                                 |
| `GARAGE_ADMIN_TOKEN`                                                          | Evet           | Garage yönetim API belirteci                                                                                                                                                                       |
| `API_DB_POOL_SIZE`, `WORKER_DB_POOL_SIZE`                                     | Hayır          | Bağlantı havuzu boyutları (pozitif tam sayı; varsayılan 10 ve 5)                                                                                                                                   |
| `LOG_LEVEL`                                                                   | Hayır          | `info` (varsayılan), `debug` vb.                                                                                                                                                                   |
| `SENTRY_DSN`                                                                  | Hayır          | Boşsa Sentry kapalıdır. Kişisel veri gönderilmez.                                                                                                                                                  |
| `OIDC_CLIENT_SECRET`                                                          | Evet           | Keycloak `etkinlik-web` istemcisinin sırrı (realm içe aktarılırken de kullanılır)                                                                                                                  |
| `KEYCLOAK_DB_PASSWORD`                                                        | Evet           | Keycloak'ın PostgreSQL rolünün parolası                                                                                                                                                            |
| `KEYCLOAK_ADMIN_USER`, `KEYCLOAK_ADMIN_PASSWORD`                              | Evet           | Keycloak'ın ilk (bootstrap) yönetici hesabı                                                                                                                                                        |
| `INITIAL_ADMIN_EMAIL`                                                         | Evet           | İlk girişte uygulama yöneticisi yapılacak kurumsal e-posta                                                                                                                                         |
| `DEMO_USER_PASSWORD`                                                          | Evet           | Kurgusal demo hesapların parolası (en az 12 karakter)                                                                                                                                              |
| `SESSION_IDLE_SECONDS`, `SESSION_ABSOLUTE_SECONDS`                            | Hayır          | Oturumun boşta kalma ve toplam süresi (varsayılan 1800 / 43200; pozitif olmalı)                                                                                                                    |
| `DEV_POSTGRES_PORT`, `DEV_REDIS_PORT`, `DEV_GARAGE_PORT`, `DEV_KEYCLOAK_PORT` | Yalnızca yerel | Ana makinede `127.0.0.1`'e açılan port'lar (varsayılan 5432, 6379, 3900, 8080). Makinede başka bir PostgreSQL vb. çalışıyorsa değiştirin.                                                          |
| `SMTP_URL`, `EMAIL_FROM`                                                      | Evet           | E-posta bildirimleri. Yerelde `smtp://mailpit:1025`; gelen kutusu `http://127.0.0.1:<DEV_MAILPIT_PORT>` (varsayılan 8025).                                                                         |
| `WHATSAPP_DRIVER` ve `WHATSAPP_*`                                             | Hayır          | Varsayılan `disabled`. `cloud` için numara kimliği, erişim belirteci, uygulama gizli anahtarı ve doğrulama belirteci gerekir; şablonlar `etkinlik_<tür>` adıyla Meta'da onaylanmalıdır (ADR 0017). |

## Yığını çalıştırma

```sh
# Yerel (Keycloak dahil, veri depoları 127.0.0.1'e açık)
docker compose -f compose.yaml -f compose.dev.yaml up -d --build

# Üretim biçimi
docker compose up -d --build
```

Yerelde tarayıcının `https://etkinlik.localhost` sertifikasına güvenmesi için Caddy'nin
iç kök sertifikası bir kez sisteme eklenir:

```sh
docker compose cp caddy:/data/caddy/pki/authorities/local/root.crt ./caddy-root.crt
# Ardından caddy-root.crt dosyasını işletim sisteminin güvenilen kök sertifikalarına ekleyin.
```

## Keycloak ve demo kullanıcılar

Bu ders projesinde gerçek bir üniversite SSO'su yoktur. Bu yüzden Keycloak, `https://<alan-adı>/idp`
altında kimlik sağlayıcı olarak çalışır ([ADR 0011](adr/0011-keycloak-demo-sso.md)).

- **İlk kurulum:** PostgreSQL veri birimi boşsa `deploy/postgres/initdb/10-keycloak.sh`, Keycloak
  rolünü ve veritabanını kendisi oluşturur. **Mevcut bir birimde** bir kez elle oluşturun:

  ```sh
  docker compose exec -T postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v kc_password="$KEYCLOAK_DB_PASSWORD"' <<'SQL'
  CREATE ROLE keycloak LOGIN PASSWORD :'kc_password';
  CREATE DATABASE keycloak OWNER keycloak;
  SQL
  ```

  `KEYCLOAK_DB_PASSWORD` değişkenini `postgres` servisine Compose verir.

- **Realm:** `deploy/keycloak/realm/etkinlik-realm.json` ilk açılışta içe aktarılır (`--import-realm`;
  realm zaten varsa atlanır).
- **Demo verisini yeniden üretmek için:** `python tools/demo/generate.py`. Realm dosyası ve
  `deploy/demo/seed.sql` birlikte değişir.
- **Uygulama tohum verisi** (demo kullanıcılar ve topluluklar; idempotent), göçlerden sonra:

  ```sh
  docker compose exec -T postgres sh -c 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"' < deploy/demo/seed.sql
  ```

- **Giriş:** demo hesapların kullanıcı adları realm dosyasındadır (ör. öğrenciler
  `ad.soyadN@ogr.uni.example`). Parolası `.env` dosyasındaki `DEMO_USER_PASSWORD`'dür. İlk yönetici
  `yonetici` kullanıcısıdır ve e-postası `INITIAL_ADMIN_EMAIL`'dir.
- **Yönetim konsolu** Caddy'de kapalıdır (`/idp/admin` → 404). Yerelde
  `http://127.0.0.1:<DEV_KEYCLOAK_PORT>/idp/admin` adresinden ya da konteyner içinde
  `/opt/keycloak/bin/kcadm.sh` ile erişilir.

## Göçler

Şema değişiklikleri `apps/api/prisma/migrations/<zaman>_<ad>/migration.sql` dosyalarındaki SQL ile yapılır.
Her göçün yanında bir `down.sql` geri alma betiği bulunur ([ADR 0009](adr/0009-sql-gocleri.md)).
API açılışta göç uygulamaz. Adımlar:

1. **Yedek al:**

   ```sh
   docker compose exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > yedek-$(date +%Y%m%d-%H%M).dump
   ```

2. **Göçü uygula:**

   ```sh
   docker compose --profile tools run --rm migrate
   ```

3. **Doğrula:** `GET /api/v1/health/ready` 200 dönmeli. Göçün PR'ında yazılı veri doğrulama sorgularını çalıştırın.
4. **Geri alma gerekirse:** önce uygulamayı durdurun (`docker compose stop api worker`), sonra:

   ```sh
   docker compose exec -T postgres sh -c 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"' < apps/api/prisma/migrations/<göç>/down.sql
   ```

   Veri kaybı olduysa yedekten geri yükleyin: `pg_restore --clean --if-exists`.

Kurallar:

- Göçler geriye uyumlu yazılır: önce ekle, sonra kaldır.
- Canlı tabloda indeks `CREATE INDEX CONCURRENTLY` ile oluşturulur; bu komut transaction içinde çalışmadığı için ayrı bir göç dosyasına konur.
- `schema.prisma` elle düzenlenmez; göç uygulandıktan sonra `npx prisma db pull` ile üretilir. Entegrasyon testi şema ile veritabanı arasında sapma olmadığını doğrular.

## Sağlık uç noktaları

| Uç nokta                           | Anlamı                                           |
| ---------------------------------- | ------------------------------------------------ |
| `GET /api/v1/health/live`          | API süreci ayakta (bağımlılıklara bakmaz)        |
| `GET /api/v1/health/ready`         | PostgreSQL ve Redis erişilebilir; değilse `503`  |
| worker `:3001/live`, `:3001/ready` | Yalnızca Compose ağı içinden; Caddy yönlendirmez |

Compose sağlık denetimleri bu uç noktaları kullanır; Caddy, API hazır olmadan başlamaz.

## Garage ilk kurulum (tek seferlik)

```sh
docker compose exec garage /garage status            # düğüm kimliğini gösterir
docker compose exec garage /garage layout assign -z dc1 -c 10G <düğüm-kimliği>
docker compose exec garage /garage layout apply --version 1
docker compose exec garage /garage bucket create etkinlik-media
docker compose exec garage /garage key create etkinlik-api
docker compose exec garage /garage bucket allow --read --write etkinlik-media --key etkinlik-api
```

Kova özeldir; web sitesi erişimi açılmaz. Anahtarı `.env` dosyasına ekleyin:

```sh
docker compose exec garage /garage key info etkinlik-api --show-secret
# Key ID → S3_ACCESS_KEY_ID, Secret key → S3_SECRET_ACCESS_KEY
```

## HSTS

`deploy/caddy/Caddyfile` HSTS'i kısa süreyle (`max-age=300`) başlatır. Üretim bir süre
sorunsuz çalıştıktan sonra kademeli olarak artırılır: 1 gün → 1 hafta → 1 yıl
(`includeSubDomains` yalnızca tüm alt alan adları HTTPS ise).

## Kapanış

API ve worker `SIGTERM` alınca yeni iş kabul etmez, süren istekleri ve işleri bitirir.
`SHUTDOWN_TIMEOUT_MS` (varsayılan 25 sn) aşılırsa süreç kendini sonlandırır. Compose
`stop_grace_period` değerleri bu süreden uzundur (API 30 sn, worker 60 sn).
