# 0011. Keycloak demo "üniversite SSO'su" olarak

- Durum: Kabul edildi
- Tarih: 2026-11-28

## Bağlam

Proje öğrencilere ders projesi olarak gösteriliyor ve gerçek bir üniversitede çalışmayacak.
Bağlanılacak bir üniversite kimlik sağlayıcısı ya da OIDC istemci kaydı yok. Prompt girişin
"yalnızca kurumsal hesapla" OIDC üzerinden yapılmasını istiyor. Proje sahibi demo öğrenci,
danışman ve yönetici hesaplarının rastgele oluşturulmasına izin verdi.

## Karar

- **Keycloak 26.8.2** her ortamda (yerel ve üretim) "üniversite SSO'su" rolünü üstlenir ve Caddy
  arkasında aynı origin'de `/idp` yolundan sunulur (`KC_HTTP_RELATIVE_PATH=/idp`). Böylece ayrı
  bir alan adı ya da CORS gerekmez.
- Keycloak kendi PostgreSQL veritabanını (`keycloak` rolü ve veritabanı) aynı sunucuda kullanır.
- Yönetim konsolu ve yönetim API'si (`/idp/admin/*`) Caddy'de dışarıya kapalıdır (404). CI'daki
  `tools/smoke/caddy.sh` bunu denetler. Yerelde konsol yalnızca `127.0.0.1` portundan açılır.
- **Realm dosyası** (`deploy/keycloak/realm/etkinlik-realm.json`) ve **uygulama tohum verisi**
  (`deploy/demo/seed.sql`) `tools/demo/generate.py` ile belirlenimci olarak üretilir:
  - Kurgusal 30 öğrenci, 5 danışman, 2 yönetici ve 5 topluluk.
  - Kullanıcı kimlikleri iki dosyada aynıdır.
- **Gizli değerler dosyalarda yoktur.** İstemci sırrı, demo parolası, ilk yönetici e-postası ve
  origin, Keycloak içe aktarma sırasında ortam değişkenlerinden çözülür. İlk yönetici e-postası
  yalnızca git'e girmeyen `.env` dosyasındadır; depo herkese açıktır.
- **Prompttan bilinçli sapma:** prompt "tohum veride varsayılan yönetici hesabı ve parolası
  oluşturulmaz" diyor. Demo ortamı için proje sahibinin açık izniyle demo yöneticiler realm'e
  eklendi. Parolaları depoda değil, `DEMO_USER_PASSWORD` ortam değişkenindedir. Gerçek bir
  kuruma taşınırsa demo kullanıcılar realm'den çıkarılmalı ve gerçek IdP bağlanmalıdır.
- Roller ilk girişte Keycloak'taki `etkinlik_role` özelliğinden alınır. Ardından uygulama tek
  kaynaktır: rolleri yönetici `PATCH /users/{id}` ile değiştirir. `INITIAL_ADMIN_EMAIL` ile
  eşleşen hesap ilk girişte her zaman yönetici olur ve bu durum denetim kaydına yazılır.
- API, IdP ile arka kanalda iç ağ üzerinden konuşur (`OIDC_INTERNAL_ISSUER`). Token'lardaki
  `iss` değeri ise genel adrestir (`${APP_ORIGIN}/idp/realms/etkinlik`).

## Sonuçlar

- Gerçek bir kuruma geçişte kod değişmez: `OIDC_ISSUER`, istemci bilgileri ve rol eşlemesi değişir.
  Keycloak, kurumun IdP'sine "identity brokering" ile de bağlanabilir.
- Uçtan uca giriş testi gerçek bir Keycloak konteyneriyle aynı realm dosyasını kullanır.
