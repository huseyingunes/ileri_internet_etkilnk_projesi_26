# 0018. Yönetici paneli, materialized view'lar ve neden sınıflandırması

- Durum: Kabul edildi
- Tarih: 2026-11-28 (gece; proje sahibinin "sormadan en uygun şekilde ilerle" talimatıyla)

## Bağlam

Promptun 2. bölümündeki 13. madde yönetici panelinin göstereceği göstergeleri sayıyor. Prompt
analitik için toplu SQL ve materialized view kullanılmasını istiyor. Açık soru şuydu: yapay zekâ
sınıflandırması gelene kadar katılmama nedenlerinin dağılımı nasıl üretilecek?

## Karar

- **Raporlama katmanı:**
  - Dört materialized view vardır: `analytics_event_facts`, `analytics_ballot_votes`,
    `analytics_winner_voters` ve `analytics_non_attendance_reasons`. Bunlar birden çok modülün
    tablosunu **bilerek** birleştirir.
  - "Bir modül başka modülün tablosuna erişmez" kuralının tek istisnası budur. Görünümler salt
    okunurdur ve yalnızca analitik modülü onları okur.
  - Görünümlerde serbest metin yoktur; neden yanıtları yalnızca etiket sayısı olarak yer alır.
- **Tazeleme:**
  - Worker her 15 dakikada `REFRESH MATERIALIZED VIEW CONCURRENTLY` çalıştırır. Her görünümün
    tekil indeksi olduğu için panel tazeleme sırasında da okunabilir.
  - Göstergeler en fazla 15 dakika eski olabilir; bunu sayfa açıklaması belirtir.
- **Göstergeler:**
  - Kayıtlı öğrenci sayısı.
  - Gerçekleşen etkinlik sayısı.
  - Oy verenlerin katılım oranı: kazanan etkinliğe oy verip gelenler / oy verenler. Bekleme
    listesinde kalanlar ve mazereti onaylananlar paydaya girmez.
  - Ortalama etkinlik puanı: bütün değerlendirmelerin ortalaması (etkinlik ortalamalarının
    ortalaması değil).
  - Kategori bazında oy ve katılım sayıları.
  - Katılmama nedenleri dağılımı.
  - Toplulukların başarısı: gerçekleşen etkinlik, kazanılan oylama ve ortalama puan.
  - Saatlere göre katılım: etkinlik başlangıç saati, İstanbul saatiyle.
  - Göstergeler sezon (akademik yıl) ve kategoriye göre süzülebilir.
- **Yetki:** yönetici her şeyi görür. Danışman yalnızca danışmanı olduğu etkinlikleri görür;
  kayıtlı öğrenci sayısı ise geneldir.
- **Neden sınıflandırması (açık soru kararı):**
  - Yapay zekâ gelene kadar `@etkinlik/shared` içindeki anahtar kelime sınıflandırıcı
    (`classifyReason`) kullanılır. Etiketler: ders veya sınav, zaman çakışması, sağlık, ulaşım,
    unuttum, ilgi kaybı, iş veya aile, hava durumu, diğer.
  - Sınıflandırıcı deterministiktir, açıklanabilir ve dış servise veri göndermez (KVKK).
  - Worker yeni yanıtları tazelemeden önce sınıflandırır ve sonucu
    `reason_answers.classification` alanına yazar. İleride bir LLM sınıflandırıcı aynı alanı
    dolduran bir adaptör olarak eklenebilir; prompt bunu ilk sürümün dışında bırakıyor.
- **İstemci:**
  - Panel ve Recharts ayrı bir parça (chunk) olarak yüklenir; öğrenciler bu kodu indirmez.
  - Her grafiğin yanında aynı veriyi taşıyan bir tablo vardır. SVG ekran okuyuculardan ve klavye
    odağından gizlenir.
  - Renkler tasarım token'larından gelir (`--color-chart-1` ve `--color-chart-2`). Palet,
    dataviz doğrulayıcısından geçti: CVD ΔE 24,7 ve kontrast ≥ 3:1. Lejant metni metin rengini
    kullanır.

## Sonuçlar

- Analitik sorguları uygulama tablolarını kilitlemez ve canlı sorgulardan bağımsız ölçeklenir.
- Yeni bir gösterge, yeni bir görünüm ya da sütun göçüyle eklenir. Görünüm değişikliği
  `DROP/CREATE` gerektirir ve bakım penceresinde yapılır.
