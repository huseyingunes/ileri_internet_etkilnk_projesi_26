# 0007. Alan adı ve origin

- Durum: Kabul edildi
- Tarih: 2026-11-28

## Bağlam

Oturum çerezi (`__Host-`), CSP, OIDC dönüş adresi, QR bağlantıları ve PWA kapsamı
alan adına bağlıdır. Prompt, üretim alan adının yayından önce sabitlenmesini ve sonra
değiştirilmemesini istiyor.

## Karar

- Yerel geliştirme: `https://etkinlik.localhost` (Caddy'nin iç sertifika otoritesi).
- Üretim: doğrudan **`https://haber10da.net`** (kök alan adı; alt alan adı kullanılmaz).
- Origin uygulamaya tek bir ortam değişkeniyle verilir: `APP_ORIGIN` (yalnızca `https://`
  kabul edilir). Caddy için host kısmı `SITE_ADDRESS` olarak verilir.
- OIDC dönüş adresi `https://haber10da.net/api/v1/...` altında olacak (Aşama 3).

## Sonuçlar

- Üretime geçişte kod değişmez; yalnızca `APP_ORIGIN` ve `SITE_ADDRESS` değişir.
- Yayından sonra alan adı değişirse kurulu PWA'lar, QR bağlantıları ve OIDC kaydı
  geçersiz olur; bu yüzden değişiklik yeni bir karar kaydı gerektirir.
