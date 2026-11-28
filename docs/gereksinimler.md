# Gereksinimler

> Kaynak: [docs/kaynak/gelistirme-promptu.md](kaynak/gelistirme-promptu.md), bölüm 2 ve 3.
> Bu belge ürün gereksinimlerinin ve iş kurallarının tek kaynağıdır. Sürüm öncesi
> `spec-to-code-compliance` denetimi kodu bu belgeyle karşılaştırır. Bir gereksinim
> değişirse önce bu belge, gerekiyorsa bir karar kaydı (`docs/adr/`) güncellenir.

## 2. Ürün gereksinimleri

Sistem; bilim, kültür ve spor etkinliklerinin öğrenci oylarıyla seçilmesini, başvuruların alınmasını, katılımın doğrulanmasını, puanlanmasını ve değerlendirilmesini sağlar.

### Roller ve yetkiler

| Yetki                           | Öğrenci | Danışman                   | Yönetici |
| ------------------------------- | ------- | -------------------------- | -------- |
| Etkinlik oluşturma              | Evet    | Evet                       | Evet     |
| Öğrenci etkinliklerini onaylama | Hayır   | Evet                       | Evet     |
| Etkinlikleri oylama             | Evet    | Hayır                      | Hayır    |
| Etkinliklere başvurma           | Evet    | Hayır                      | Hayır    |
| Günlük oylamaları belirleme     | Hayır   | Hayır                      | Evet     |
| Etkinlik değerlendirme          | Evet    | Hayır                      | Hayır    |
| Etkinlik fotoğraflarını yönetme | Hayır   | Evet                       | Evet     |
| İstatistikleri görüntüleme      | Kişisel | Yetkili olduğu etkinlikler | Tümü     |
| Sistem yönetimi                 | Hayır   | Hayır                      | Evet     |

### Temel kavramlar

- Kategoriler: Bilim, Kültür, Spor.
- Öğrenci toplulukları bağımsız varlıklardır; üyeleri ve danışmanları vardır.
- Etkinlik alanları: ad, açıklama, kategori, düzenleyen kişi veya topluluk, tarih, başlangıç ve bitiş saati, konum ve koordinatlar, kontenjan, kapak görseli, anahtar kelimeler, ilgili danışman, katılım koşulları.

### Akışlar

1. Etkinlik önerisi: Öğrenci, danışman veya yönetici etkinlik oluşturur. Öğrencinin etkinliği danışman onayından sonra, diğerleri doğrudan havuza girer.
2. Günlük seçim: Yönetici, onaylı havuzdan ertesi gün için her kategoriden üç, toplam dokuz etkinlik seçer.
3. Oylama: Öğrenci her kategoride en fazla bir etkinliğe oy verir. Süre bitince her kategoride en çok oyu alan kazanır ve kendi planlanan tarihinde takvime eklenir. Kazanamayanlar havuzda kalır ve yeniden oylanabilir.
4. Başvuru: Öğrenci takvimdeki etkinliğe başvurur ve başvurusunu iptal edebilir. Kontenjan dolunca bekleme listesi oluşur. Oy vermek ile başvurmak birbirinden bağımsızdır.
5. Katılım doğrulama: Etkinlik alanında dinamik QR, konum ve süre ile yapılır (bölüm 10).
6. Puanlama: Etkinlik bitip katılım doğrulandıktan sonra puanlar güncellenir (bölüm 3). Öğrenci puan geçmişini ve hangi etkinlikten kaç puan aldığını görür.
7. Liderlik tablosu: Her akademik yıl en yüksek puanlı 10 öğrenci listelenir; geçmiş yıllar arşivlenir. Öğrenci kendi sırasını, puanını ve katılım istatistiklerini görür.
8. Neden soruları: Etkinlikten sonra, kazanan etkinliğe oy vermiş öğrencilere açık uçlu tek soru sorulur. Katılana "Bu etkinliğe neden katıldınız?", katılmayana "Oy verdiğiniz bu etkinliğe neden katılmadınız?" sorulur.
9. Değerlendirme: Katılımı doğrulanan her öğrenci etkinliğe 1–5 puan ve yorum verir. Ortalama puanı ve yorumları ilgili danışman ile yönetici görür.
10. Arşiv: Gerçekleşen her etkinliğin sayfasında bilgiler, fotoğraf galerisi, katılımcı sayısı, oylama sonuçları ve ortalama puan bulunur. Fotoğrafı danışman ve yönetici yükler.
11. Bildirimler: Oylama sonucu, başvuru onayı, yaklaşan etkinlik hatırlatması, değerlendirme talebi ve kazanılan ya da kaybedilen puan bildirilir. Bildirim, öğrencinin iletişim iznine ve tercihine göre gönderilir.
12. İlgi alanları: Öğrenci ilgi alanlarını seçer; profil geçmiş oy, katılım ve değerlendirmelerle güncellenir. Oylamaya açılan etkinliğin anahtar kelimeleri öğrencinin ilgi alanlarıyla eşleşirse oylamaya davet bildirimi gider.
13. Yönetici paneli: Kayıtlı öğrenci sayısı, gerçekleşen etkinlik sayısı, oy verenlerin katılım oranı, ortalama etkinlik puanı, kategori bazında oy ve katılım sayıları, katılmama nedenleri dağılımı, toplulukların başarısı ve saatlere göre katılım gösterilir.

İlk sürümün kapsamı dışında: açık uçlu cevapların yapay zekâ ile sınıflandırılması. Yalnızca arayüzü tanımlanır; uygulaması sonraki aşamadır.

## 3. İş kuralları ve puanlama

Her öğrenci 1500 puanla başlar. Puanlar aşağıdaki sabit tabloyla değişir; değerler yönetici panelinden değiştirilebilir.

| Durum (kategori bazında)                                | Varsayılan puan |
| ------------------------------------------------------- | --------------- |
| Oy verdiği etkinlik kazandı ve katıldı                  | +20             |
| Oy verdiği etkinlik kazandı ama katılmadı               | −20             |
| Oy kullanmadı ama kazanan etkinliğe katıldı             | +10             |
| Başka etkinliğe oy verdi ve kazanan etkinliğe katıldı   | +30             |
| Başka etkinliğe oy verdi ve kazanan etkinliğe katılmadı | 0               |
| Oy kullanmadı ve katılmadı                              | 0               |

### İş kuralları

- Oylama her gün 00.00–23.59 arasında, Europe/Istanbul saatine göre yapılır.
- Öğrenci istediği kategoride oy kullanır; üç kategoride de oy vermek zorunda değildir.
- Eşitlikte kazananı yönetici belirler.
- Etkinliğin gerçekleşmesi için asgari oy eşiği tanımlanabilir; eşiğin altında kalan kategoride kazanan çıkmaz.
- Danışmanın onayladığı mazerette puan düşülmez.
- İptal edilen etkinlik puanları etkilemez.
- Oy verdiği hâlde kontenjan nedeniyle katılamayan öğrenci puan kaybetmez.
- Her akademik yıl başında puanlar 1500'e döner; geçmiş yılların sıralamaları saklanır.
- Gerçek Elo algoritması kullanılmaz; parametrik sabit puanlama yeterlidir.
- Giriş yalnızca üniversitenin kurumsal hesabıyla yapılır.

### Veri modeli kararları (Aşama 1, 2026-11-28)

- **Akademik yıl (sezon)** her yıl 1 Eylül'de başlar ve bir sonraki yılın 31 Ağustos'unda biter. Sezonu sistem otomatik açar; kapanış bir worker işidir.
- **Roller tektir:** her kullanıcının yalnızca bir rolü vardır (öğrenci, danışman ya da yönetici). Öğrenci aynı zamanda danışman olamaz.
- **Etkinliği öneren** ya bir kişi ya da bir topluluktur; ikisi birden olamaz.
- **Etkinlikler birden fazla güne yayılabilir.** Başlangıç ve bitiş tam zaman damgası olarak tutulur. Çok günlü etkinlikte "sürenin %50'si" kuralının nasıl uygulanacağı Aşama 7'den önce netleştirilecektir.

### Açık sorular ve kararlar

| Soru                                                                                            | Aşama | Durum                                                                                                                                                                                                        |
| ----------------------------------------------------------------------------------------------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Üretim alan adı nedir?                                                                          | 0     | **Karar verildi:** yerelde `https://etkinlik.localhost`, üretimde doğrudan `https://haber10da.net` (alt alan adı yok). Bkz. [ADR 0007](adr/0007-alan-adi-ve-origin.md).                                      |
| Üniversitenin kimlik sağlayıcısı hangisi ve OIDC istemci bilgileri hazır mı?                    | 3     | **Karar verildi:** gerçek bir kurum yok (ders projesi). Keycloak `/idp` altında demo SSO olarak çalışır; demo kullanıcılar kurgusaldır. Bkz. [ADR 0011](adr/0011-keycloak-demo-sso.md).                      |
| Oylama sürerken oy sayıları öğrencilere gösterilecek mi?                                        | 5     | **Karar verildi:** hayır, kapanana kadar gizli; yönetici ayarla açabilir. Bkz. [ADR 0013](adr/0013-oylama-kararlari.md).                                                                                     |
| Asgari oy eşiği, konum yarıçapı ve QR yenileme süresinin varsayılanları ne olacak?              | 5, 7  | **Karar verildi:** 1 oy, 100 m, 25 sn; yönetici panelinden değiştirilebilir. Bkz. [ADR 0013](adr/0013-oylama-kararlari.md).                                                                                  |
| Birden fazla güne yayılan etkinlikte "sürenin en az %50'si" kuralı nasıl hesaplanacak?          | 7     | **Karar verildi:** başlangıç–bitiş saatleri her gün tekrar eden pencere sayılır; günlük bulunma süreleri toplanır ve pencerelerin toplamının yarısı gerekir. Bkz. [ADR 0014](adr/0014-katilim-dogrulama.md). |
| WhatsApp Business hesabı ve onaylı şablonlar hazır mı? E-posta hangi sağlayıcıyla gönderilecek? | 10    | Açık                                                                                                                                                                                                         |
| Yapay zekâ sınıflandırması gelene kadar katılmama nedenleri dağılımı nasıl üretilecek?          | 11    | Açık                                                                                                                                                                                                         |
