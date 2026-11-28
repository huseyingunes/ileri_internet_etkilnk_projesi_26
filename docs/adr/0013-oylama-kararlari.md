# 0013. Oylama kararları

- Durum: Kabul edildi
- Tarih: 2026-11-28 (gece; proje sahibinin "sormadan en uygun şekilde ilerle" talimatıyla)

## Bağlam

Aşama 5'in açık soruları vardı: oylama sürerken oy sayıları gösterilecek mi, asgari oy
eşiğinin ve diğer ayarların varsayılan değerleri ne olacak? Ayrıca kapanışın zamanlaması ve
eşitlik kararının biçimi tasarlanmalıydı.

## Karar

- **Oy sayıları oylama sürerken gizlidir** (`showLiveVoteCounts=false`). Amaç sürü etkisini
  önlemek. Yönetici her zaman görür ve ayarı açabilir. Kapanmış günlerde sayılar herkese açıktır.
- **Varsayılan ayarlar:** asgari oy eşiği 1, katılım yarıçapı 100 m, QR yenileme süresi 25 sn.
  Ayarlar `app_settings` tablosunda doğrulanmış JSON olarak durur (`PATCH /settings`, yalnızca
  yönetici, denetim kaydına yazılır). 0 ve negatif değerler reddedilir.
- **Günlük seçim:**
  - Yalnızca ertesi gün ve sonrası için yapılır; oylama başlamışsa 409.
  - Her kategoriden tam üç etkinlik seçilir.
  - Etkinlik havuzda (`pool`) olmalı ve doğru kategoride bulunmalı.
  - Etkinliğin başlangıcı, oylama gününün bitişinden sonra olmalı.
  - Bir etkinlik aynı anda yalnızca bir açık oylamada bulunabilir.
- **Oylama girişinin kimliği**, etkinliğin herkese açık kimliğidir (`ballotEntryId`). Aynı gün bir
  etkinlik yalnızca bir kez yer alabildiği için gün ve kategori bundan çıkarılır.
- **Oy:**
  - Yalnızca bugünün (Europe/Istanbul) oylamasına verilir.
  - Aynı girişe tekrar oy verilirse 200 ile mevcut oy döner; aynı kategoride başka bir girişe
    oy 409 alır.
  - Veritabanındaki tekillik kısıtı eşzamanlı istekleri de tek kayda indirir.
  - Oy sayıları Redis'te 5 saniyelik önbellekte tutulur.
- **Kapanış:**
  - Worker'da BullMQ zamanlayıcısıyla her gece 00.30'da (İstanbul saatiyle) `voting.close`
    işi çalışır. İş ayrıca açılışta da çalışır; böylece kaçırılan günler kapatılır.
  - İş idempotenttir: her gün ve kategori yalnızca bir kez kapanır.
  - Kazanan `decideCategory` saf fonksiyonuyla belirlenir; fonksiyon özellik testleriyle
    doğrulanmıştır.
  - Kazanan etkinlik kendi planlanan tarihinde takvime girer (`scheduled`); kaybedenler havuzda
    kalır.
  - Eşitlikte eşit oy alan girişler kaydedilir ve yönetici yalnızca bunlardan birini seçebilir
    (`PUT /voting-results/{id}/tie-decision`). Bu karar denetim kaydına yazılır.

## Sonuçlar

- `voting_results` tablosuna `public_id` ve `tied_ballot_ids` sütunları eklendi (yeni göç).
- Oylama sonucu bildirimleri Aşama 10'da bu kapanış işine bağlanacak.
