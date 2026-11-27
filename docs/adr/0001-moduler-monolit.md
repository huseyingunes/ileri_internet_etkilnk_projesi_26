# 0001. Modüler monolit

- Durum: Kabul edildi
- Tarih: 2026-11-28

## Bağlam

Platform tek bir üniversite için, tek sunucuda çalışacak. Ekip küçük; kimlik, oylama,
başvuru, katılım ve puanlama gibi alanlar birbirine sıkı iş kurallarıyla bağlı
(ör. puanlama oy ve katılım sonucuna dayanır). Mikroservis, Kubernetes ve mesaj
aracıları (Kafka, RabbitMQ) kapsam dışında bırakıldı.

## Karar

Uygulama tek kod tabanlı, tek dağıtımlı bir **modüler monolit** olarak yazılır.

- `apps/api` iki giriş noktası sunar: HTTP API (`src/main.ts`) ve worker (`src/worker.ts`).
  İkisi aynı imajdan çalışır.
- Modüller: kimlik ve yetki, topluluklar, etkinlik, oylama, başvuru, katılım doğrulama,
  puanlama ve liderlik, geri bildirim, bildirim, ilgi alanı, arşiv ve medya, analitik.
- Bir modül başka bir modülün tablolarına doğrudan erişmez; yalnızca o modülün dışa açtığı
  servis arayüzünü kullanır.
- Modül içi katmanlar: controller → uygulama servisi → alan kuralları → depo ve adaptör.
  Bağımlılık içe doğrudur.
- Alan kuralları (puanlama, süre hesabı, kazanan belirleme) çerçeveden bağımsız saf
  fonksiyonlardır; gerektiğinde `packages/shared` içinde yer alır.
- Dış servisler (kimlik sağlayıcı, WhatsApp, e-posta, nesne depolama, LLM) arayüz
  arkasındadır; test ve yerel geliştirmede bellek içi sahteleri kullanılır.

## Sonuçlar

- Tek dağıtım, tek veritabanı ve transaction'lar sayesinde kontenjan ve puan defteri
  tutarlılığı kolay sağlanır.
- Modül sınırları derleyici tarafından değil kurallar ve kod incelemesiyle korunur;
  ileride bir lint kuralıyla (modüller arası içe aktarma yasağı) desteklenebilir.
- Zamanlanmış ve uzun işler BullMQ ile worker sürecine taşınır; HTTP gecikmesi etkilenmez.
