# 0015. Puanlama, sezon ve mazeret kararları

- Durum: Kabul edildi
- Tarih: 2026-11-28 (gece; proje sahibinin "sormadan en uygun şekilde ilerle" talimatıyla)

## Bağlam

Promptun 3. bölümündeki puan tablosu durumları tanımlıyor. Ancak bazı uç durumlarda tablonun
nasıl uygulanacağı açık değildi: kimin puanlanacağı, puanın hangi sezona yazılacağı, geç onaylanan
mazeretin nasıl işleneceği ve sıralamada eşitliğin nasıl çözüleceği.

## Karar

- **Puanlanan etkinlik:**
  - Yalnızca günlük oylamayı kazanıp **tamamlanan** etkinlik puanlanır.
  - Yöneticinin oylama dışında takvime aldığı etkinlik puan doğurmaz. İptal edilen etkinlik
    hiçbir zaman tamamlanmadığı için puanı etkilemez.
- **Kim puanlanır:**
  - O gün o kategoride oy kullananlar.
  - Etkinliğe başvurup katılım kaydı oluşanlar.
  - Ne oy veren ne başvuran öğrenci etkilenmez. "Oy kullanmadı ve katılmadı" kuralı yalnızca
    başvurup gelmeyen öğrenciye uygulanır. Böylece yönetici bu kurala sıfırdan farklı bir değer
    verse bile bütün öğrencilerin puanı değişmez.
- **Muafiyetler:**
  - Bekleme listesinde kalan öğrenci (`blocked_by_capacity`) ve mazereti onaylanan öğrenci puan
    kaybetmez; bu öğrencilere hiçbir kural uygulanmaz.
- **Sıfır puanlı kurallar** deftere yazılmaz; puan geçmişi yalnızca puanı değiştiren hareketleri
  gösterir.
- **Defter:**
  - Defter değiştirilemez (trigger ile korunur). Toplam puan, sezonun başlangıç puanına (1500)
    defterdeki hareketlerin toplamı eklenerek hesaplanır.
  - `(öğrenci, etkinlik, kural)` tekilliği ve `ON CONFLICT DO NOTHING` çift puanlamayı engeller.
    Bu yüzden iş tekrar çalışsa da sonuç değişmez.
- **Puan kuralları:**
  - Kurallar sürümlüdür. Değişiklik mevcut sürümü kapatır (`valid_to`) ve yeni sürüm ekler.
  - Değişiklik yalnızca bundan sonra puanlanacak etkinlikleri etkiler. Her hareket, kullandığı
    kural sürümüne bağlıdır.
  - Değişiklik denetim kaydına yazılır.
- **Mazeret:**
  - Onaylı başvurusu olan öğrenci, etkinlik bitene kadar ve bitişten sonraki 7 gün içinde
    mazeret bildirebilir.
  - Mazereti etkinliğin danışmanı ya da yönetici bir kez değerlendirir. Onay ya da ret denetim
    kaydına yazılır.
  - Puanlamadan önce onaylanan mazerette puan düşülmez.
  - Puanlamadan sonra onaylanırsa deftere, kaybedilen puan kadar bir `excuse_reversal` (telafi)
    hareketi yazılır. Defterdeki eski hareket silinmez. Katılım durumu `excused` olur.
- **Sezon:**
  - Akademik yıl 1 Eylül – 31 Ağustos arasıdır (İstanbul takvimi). Sezon gerektiğinde, ilk
    kullanımda ve her gece 00.10'daki worker işinde otomatik açılır.
  - Eski sezon kapanırken ilk 10 öğrenci `leaderboard_snapshots` tablosuna arşivlenir. Kapalı
    sezonların tablosu bu arşivden sunulur.
  - Puan hareketi, etkinlik puanlandığı andaki aktif sezona yazılır. Kesinleştirme etkinlik
    bitiminden birkaç dakika sonra çalıştığı için bu, etkinliğin sezonuyla aynıdır.
- **Sıralama:**
  - Öğrenciler puana göre, puan eşitse katıldığı etkinlik sayısına, o da eşitse kayıt sırasına
    göre sıralanır.
  - Aynı puanlı öğrenciler farklı sıra numarası alır, çünkü arşiv tablosunda sıra tekildir.
  - Liderlik tablosu ETag ile önbelleğe alınabilir.
- **Mimari:**
  - Puanlama modülü oy ve katılım verilerine yalnızca `VotingService` ve `AttendanceService`
    üzerinden erişir.
  - Mazeretler puanlama modülündedir, çünkü tek etkileri puanadır. Katılım durumunu
    `AttendanceService.markExcused` ile değiştirir.

## Sonuçlar

- Puan toplamının defter toplamına eşitliği, çift puanlama olmaması ve muafiyetler, saf fonksiyonlar
  (`@etkinlik/shared` `rules/scoring.ts`) üzerinde özellik testleriyle doğrulanır.
- Bildirimler (puan kazanıldı ya da kaybedildi) Aşama 10'da bu deftere bağlanır.
