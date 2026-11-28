# 0016. Neden soruları, değerlendirme, arşiv ve galeri

- Durum: Kabul edildi
- Tarih: 2026-11-28 (gece; proje sahibinin "sormadan en uygun şekilde ilerle" talimatıyla)

## Bağlam

Promptun 2. bölümündeki 8., 9. ve 10. maddeler neden sorularını, değerlendirmeyi ve arşiv
sayfasını tanımlıyor. Kimlere soru sorulacağı, kimin değerlendirme yapacağı ve fotoğrafların nasıl
yönetileceği gibi ayrıntılar netleştirilmeliydi.

## Karar

- **Neden soruları:**
  - Kazanan etkinlik tamamlandığında, ona oy veren her öğrenciye açık uçlu tek bir soru sorulur.
    Bu iş `event.completed` olayına abone olarak çalışır.
  - Katılan öğrenciye "Bu etkinliğe neden katıldınız?", katılmayana "Oy verdiğiniz bu etkinliğe
    neden katılmadınız?" sorulur.
  - Bekleme listesinde kalan ya da mazereti onaylanan öğrenciye soru sorulmaz, çünkü nedeni zaten
    bilinir.
  - Soru `(etkinlik, öğrenci)` başına bir kez oluşturulur ve bir kez yanıtlanır. Başkasının
    sorusuna yanıt vermeye çalışan 404 alır, böylece sorunun var olduğu da sızdırılmaz.
  - Yanıtlar Aşama 11'deki sınıflandırma için `reason_answers.classification` alanını bekler.
- **Değerlendirme:**
  - Yalnızca katılımı doğrulanan (`attended`) öğrenci, etkinlik tamamlandıktan sonra bir kez
    1–5 puan verir; yorum yazmak isteğe bağlıdır.
  - Ortalama ve yorumları yalnızca etkinliğin danışmanı ve yönetici görür. Yorumlar **anonimdir**;
    yanıtta öğrenci kimliği yer almaz.
  - Değerlendirme talebi bildirimi Aşama 10'da eklenir.
- **Arşiv sayfası:**
  - Tamamlanan etkinlik için `GET /events/{id}/summary` döner. İçeriği: etkinlik bilgileri,
    katılımcı sayısı, ortalama puan, değerlendirme sayısı, etkinliğin oylamada yer aldığı her
    günün sonucu ve galeri.
  - Öğrenciye ayrıca `viewer` alanı döner: değerlendirebilir mi, değerlendirdi mi.
  - Yanıt ETag ile önbelleğe alınabilir. Henüz tamamlanmamış etkinlik için 409 döner.
- **Galeri:**
  - Fotoğrafları danışman ya da yönetici, takvimdeki ya da tamamlanan etkinliğe yükler.
  - Bir etkinliğe en fazla 50 fotoğraf eklenebilir. Fotoğraf eklemeler etkinlik başına danışma
    kilidiyle (advisory lock) sıraya alınır.
  - Görseller mevcut medya hattından geçer: dosya imzası doğrulanır, AVIF, WebP ve JPEG
    varyantları üretilir. Alternatif metin zorunludur.
  - Fotoğrafa açık rıza: öğrencinin `photo` rızası profilde açılıp kapatılabilir. Yükleme
    ekranındaki uyarı, danışmanın yalnızca rıza veren öğrencilerin seçilebildiği kareleri
    eklemesini ister. Yüz tanıma yapılmaz.
- **Mimari:**
  - Geri bildirim modülü (`reason_prompts`, `reason_answers`, `ratings`) oy, katılım ve etkinlik
    verilerine servisler üzerinden erişir.
  - Galeri, `event_photos` tablosunun sahibi olan etkinlik modülündedir.

## Sonuçlar

- Neden yanıtları ve değerlendirmeler Aşama 11'deki yönetici panelinin girdisidir: katılmama
  nedenleri dağılımı ve ortalama etkinlik puanı.
