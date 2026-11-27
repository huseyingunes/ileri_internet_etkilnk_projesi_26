# 0004. Tek origin, CORS kapalı

- Durum: Kabul edildi
- Tarih: 2026-11-28

## Bağlam

İstemci ve API aynı kuruluşa ait. Çapraz origin istekleri CORS yapılandırması, çerez
`SameSite` istisnaları ve ek saldırı yüzeyi getirir.

## Karar

- Caddy, istemcinin statik dosyalarını sunar ve `/api/*` yolunu API'ye yönlendirir.
  Tarayıcı açısından tek origin vardır (`APP_ORIGIN`).
- API'de CORS hiçbir zaman açılmaz; entegrasyon testi `Access-Control-Allow-Origin`
  başlığının dönmediğini doğrular.
- Oturum çerezi `__Host-` önekli, `Secure; HttpOnly; SameSite=Lax` olur (Aşama 3).
- Express yalnızca loopback ve özel ağdan gelen `X-Forwarded-*` başlıklarına güvenir
  (`trust proxy: loopback, uniquelocal`).
- Veri depoları (PostgreSQL, Redis, Garage) dış dünyaya kapalı `data` ağındadır
  (`internal: true`); yalnızca API ve worker bu ağa bağlanır.

## Sonuçlar

- Yerel geliştirmede de aynı düzen kullanılır (`https://etkinlik.localhost`, Caddy iç CA'sı).
- Ayrı bir API alan adı gerekirse bu karar yeniden ele alınır.
