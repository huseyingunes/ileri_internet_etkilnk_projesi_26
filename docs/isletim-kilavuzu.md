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

| Değişken                                                                      | Zorunlu        | Açıklama                                                                                                                                  |
| ----------------------------------------------------------------------------- | -------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `APP_ORIGIN`                                                                  | Evet           | Tek origin, yalnızca `https://`. Yerel: `https://etkinlik.localhost`, üretim: `https://haber10da.net`                                     |
| `SITE_ADDRESS`                                                                | Evet           | `APP_ORIGIN`'in host kısmı (Caddy TLS için)                                                                                               |
| `POSTGRES_USER`, `POSTGRES_DB`                                                | Evet           | Veritabanı kullanıcısı ve adı                                                                                                             |
| `POSTGRES_PASSWORD`                                                           | Evet           | URL'de güvenli karakterler kullanın (ör. `openssl rand -hex 32`)                                                                          |
| `REDIS_PASSWORD`                                                              | Evet           | Redis parolası                                                                                                                            |
| `GARAGE_RPC_SECRET`                                                           | Evet           | Tam 64 onaltılık karakter (`openssl rand -hex 32`)                                                                                        |
| `GARAGE_ADMIN_TOKEN`                                                          | Evet           | Garage yönetim API belirteci                                                                                                              |
| `API_DB_POOL_SIZE`, `WORKER_DB_POOL_SIZE`                                     | Hayır          | Bağlantı havuzu boyutları (pozitif tam sayı; varsayılan 10 ve 5)                                                                          |
| `LOG_LEVEL`                                                                   | Hayır          | `info` (varsayılan), `debug` vb.                                                                                                          |
| `SENTRY_DSN`                                                                  | Hayır          | Boşsa Sentry kapalıdır. Kişisel veri gönderilmez.                                                                                         |
| `KEYCLOAK_ADMIN_USER`, `KEYCLOAK_ADMIN_PASSWORD`                              | Yalnızca yerel | `compose.dev.yaml` içindeki Keycloak için                                                                                                 |
| `DEV_POSTGRES_PORT`, `DEV_REDIS_PORT`, `DEV_GARAGE_PORT`, `DEV_KEYCLOAK_PORT` | Yalnızca yerel | Ana makinede `127.0.0.1`'e açılan port'lar (varsayılan 5432, 6379, 3900, 8080). Makinede başka bir PostgreSQL vb. çalışıyorsa değiştirin. |

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

Kova özeldir; web sitesi erişimi açılmaz. Erişim anahtarları Aşama 4'te ortam
değişkenlerine eklenecektir.

## HSTS

`deploy/caddy/Caddyfile` HSTS'i kısa süreyle (`max-age=300`) başlatır. Üretim bir süre
sorunsuz çalıştıktan sonra kademeli olarak artırılır: 1 gün → 1 hafta → 1 yıl
(`includeSubDomains` yalnızca tüm alt alan adları HTTPS ise).

## Kapanış

API ve worker `SIGTERM` alınca yeni iş kabul etmez, süren istekleri ve işleri bitirir.
`SHUTDOWN_TIMEOUT_MS` (varsayılan 25 sn) aşılırsa süreç kendini sonlandırır. Compose
`stop_grace_period` değerleri bu süreden uzundur (API 30 sn, worker 60 sn).
