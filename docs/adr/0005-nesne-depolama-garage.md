# 0005. Nesne depolama: Garage

- Durum: Kabul edildi
- Tarih: 2026-11-28

## Bağlam

Kapak görselleri ve etkinlik fotoğrafları S3 uyumlu bir depoda tutulacak. MinIO kapsam
dışında bırakıldı. Promptta Garage seçildi; uygun olmazsa karar kaydıyla SeaweedFS'e
geçilebilir.

## Karar

- Tek düğümlü **Garage v2.6.0** (`replication_factor = 1`) kullanılır.
- Yapılandırma `deploy/garage/garage.toml` içindedir. Gizli değerler (`rpc_secret`, yönetim
  belirteci) dosyada değil, `GARAGE_RPC_SECRET` ve `GARAGE_ADMIN_TOKEN` ortam değişkenlerindedir.
- Kovalar varsayılan olarak özeldir; Garage'ın web sitesi barındırma özelliği açılmaz.
  Görseller istemciye API'nin ürettiği kısa ömürlü imzalı adreslerle sunulur (Aşama 4).
- Garage yalnızca iç `data` ağındadır; yerel geliştirmede S3 port'u `127.0.0.1:3900`'e açılır.

## Sonuçlar

- İlk kurulumda düğüm yerleşimi (layout), kova ve erişim anahtarı elle oluşturulur
  (`docs/isletim-kilavuzu.md`). Aşama 4'te bu adım bir kurulum betiğine taşınır.
- Tek düğümde veri kopyası yoktur; yedekleme gecelik yedek planının parçasıdır (Aşama 12).
