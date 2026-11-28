# 0019. Sertleştirme: KVKK talepleri, yedekleme, yük testi

- Durum: Kabul edildi
- Tarih: 2026-11-28 (gece; proje sahibinin "sormadan en uygun şekilde ilerle" talimatıyla)

## Bağlam

Aşama 12 kapsamında şunlar vardı: "verilerimi indir" ve "verilerimi sil" akışları, yedek alma ve
geri yükleme, yük testi (k6), mutasyon testi (mewt), güvenlik taramaları ve işletim kılavuzu.

## Karar

- **Verilerimi indir ve sil:**
  - Talep API'de oluşur ve worker'da işlenir. Aynı türde açık talep varsa yeni talep açılmaz,
    mevcut talep döner (idempotent). Uç nokta kullanıcı başına saatte 5 istekle sınırlıdır.
  - Kişisel veri tutan her modülün, kendi tablolarını dışa aktaran ve silen bir katkıcısı
    (`PersonalDataContributor`) vardır. Bu katkıcılar `modules/privacy/contributors.ts`
    dosyasında, birlikte incelenebilsin diye **tek yerde** durur. Kişinin verisinin tamamını
    görmek gerektiği için bu, analitikten sonraki ikinci belgeli istisnadır.
  - **Dışa aktarma:** sonuç tek bir JSON dosyasıdır ve özel kovaya `exports/<talep>.json` olarak
    yazılır. Dosyayı yalnızca talep sahibi, oturumu açıkken indirebilir; başkası 404 alır ve
    yanıt önbelleğe alınmaz. Dosyada konum koordinatı yoktur, çünkü sistem koordinat saklamaz.
  - **Silme (anonimleştirme):**
    - Kullanıcı satırı silinmez. Ad, e-posta, OIDC kimliği, öğrenci numarası ve telefon
      silinir ya da anonim değerlerle değiştirilir; hesap pasifleşir, rızalar geri alınır,
      oturumlar kapanır.
    - Kişinin yazdığı metinler (mazeret, neden yanıtı, değerlendirme yorumu) silinir.
    - Bildirimler, tercihler ve ilgi alanları silinir.
    - Değiştirilemez kayıtlar (puan defteri, denetim kaydı) ve istatistik değerleri (oy, puan)
      kalır, ama artık kimseyle ilişkilendirilemez. Prompttaki kural budur.
    - Aynı kurumsal hesapla yeniden giriş yapılırsa yeni ve boş bir hesap oluşur.
- **Yedekleme:**
  - `tools/ops/backup.sh` uygulama ve Keycloak veritabanlarının `pg_dump -Fc` dökümünü alır.
  - Garage birimleri, depolama kısa süre durdurularak tutarlı biçimde arşivlenir.
  - Her döküm `pg_restore --list` ile denetlenir ve SHA-256 özetleri yazılır.
  - `tools/ops/restore.sh` geri yükler. Yıkıcı olduğu için `--yes` ister ve önce özetleri
    doğrular.
  - Geri yükleme tatbikatı bu PR'da çalıştırıldı: yerel yığının dökümü boş bir PostgreSQL'e
    yüklendi.
- **Yük testi:** `tools/load/qr-scan.js` (etkinlik başı QR yoğunluğu) ve
  `tools/load/voting-close.js` (oylama kapanışı), eşikleriyle birlikte eklendi.
  - `apps/api/src/load-prepare.ts` yalnızca yerel ya da hazırlık ortamında öğrenci, oturum ve QR
    belirteci üretir; üretimde çalışmaz.
  - Betikler `k6 inspect` ile doğrulandı. Gerçek yük koşusu, hazırlık ortamında yapılacak bir
    işletim adımıdır; sonuçları bu ADR'ye eklenmelidir.
- **Mutasyon testi (mewt):** bu gece **yapılmadı**.
  - mewt bir Rust aracıdır ve geliştirme konteynerinde yüklü değil. Gece özerkliğinde yeni araç
    zinciri kurmak yerine sahibin onayına bırakıldı.
  - Hedef modüller hazır: `@etkinlik/shared` içindeki saf kurallar (puanlama, katılım, oylama,
    neden sınıflandırma) ile `auth.guard` ve `role-policy`. Bunlar özellik testleriyle
    kapsanıyor.
- **Trusted Types:** rapor modunda kalır. Uygulama kodu `innerHTML` kullanmaz; lint ve Semgrep
  bunu engeller. Yaptırım moduna geçiş için önce birkaç gün ihlal raporu toplanmalıdır.
  - Raporlar `/api/v1/security-reports` adresine gelir.
  - Recharts ve qrcode HTML enjekte etmez. QR görseli `data:` adresiyle gösterilir.

## Sonuçlar

- KVKK talepleri uçtan uca test edildi (`privacy.int.test.ts`).
- İşletim kılavuzunda yedekleme, geri yükleme, yük testi ve veri talepleri bölümleri var.
- Açık işler sürüm öncesine bırakıldı: mewt ile mutasyon testi, hazırlık ortamında k6 koşusu ve
  sonuçları, Trusted Types yaptırımı. Ayrıca prompt, sürüm öncesinde `spec-to-code-compliance`,
  `insecure-defaults` ve `sharp-edges` tam taramalarını istiyor.
