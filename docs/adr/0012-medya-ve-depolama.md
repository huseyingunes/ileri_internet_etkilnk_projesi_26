# 0012. Görsel işleme ve nesne depolama kütüphaneleri

- Durum: Kabul edildi
- Tarih: 2026-11-28 (gece; proje sahibinin "sormadan en uygun şekilde ilerle" talimatıyla)

## Bağlam

Aşama 4, kapak görselleri ve fotoğraflardan AVIF/WebP ve birkaç boyutta türev üretilmesini ve
görsellerin Garage'da (S3 uyumlu, özel kova) saklanmasını istiyor. Bunun için promptta adı
geçmeyen kütüphaneler gerekiyor.

## Karar

- **`sharp` 0.35.5** (libvips): Görsel türü dosya imzasından doğrulanır, istemcinin bildirdiği
  türe güvenilmez. EXIF yönü uygulanır ve çıktıda **meta veri tutulmaz** (GPS gibi kişisel
  veriler silinir). 320, 640 ve 1280 piksel genişlikte AVIF ve WebP türevleri üretilir;
  görseller büyütülmez. Piksel sınırı 40 MP, dosya boyutu sınırı 10 MB.
- **`@aws-sdk/client-s3`**: Garage'a S3 API ile erişir (`forcePathStyle`), her çağrıda zaman
  aşımı vardır. Kova özeldir; görseller `GET /api/v1/media/{id}/variants/{genişlik}.{biçim}`
  üzerinden API'den sunulur. Türevler değişmediği için tarayıcı bir yıl önbelleğe alabilir.
- **Dosya yükleme:** NestJS'in kendi `multer` bağımlılığı kullanılır; yeni paket eklenmedi.
  Bellekte işlenir, tek dosya ve 10 MB sınırı vardır.
- **Depolama portu:** `ObjectStorage` arayüzü iki adaptörle gelir: `S3Storage` ve
  `MemoryStorage` (testler ve Garage'sız yerel geliştirme için). `STORAGE_DRIVER=memory`
  üretimde reddedilir.
- **Türev üretimi:** Worker'da `media.process` BullMQ işiyle çalışır ve idempotenttir (hazır
  görsel yeniden işlenmez). Görsellere erişilebilirlik için `alt` metni eklenebilir (yeni göç).
- **Öneri formu için `GET /advisors`:** Öğrencinin danışman seçebilmesi için eklendi. Yalnızca ad
  ve rol döner; sözleşmeye işlendi.

## Sonuçlar

- `sharp` yerel (native) bir modüldür; ön derlenmiş `@img/sharp-*` paketleriyle gelir ve kurulum
  betiği gerektirmez (`ignore-scripts` ile uyumlu).
- Garage erişim anahtarı `garage key create` ile oluşturulur ve `.env` dosyasında
  `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` olarak verilir.
