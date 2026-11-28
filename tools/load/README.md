# Yük testleri (k6)

Promptun 11. bölümündeki iki yoğunluk senaryosu:

| Betik             | Senaryo                                                         | Eşikler                                                               |
| ----------------- | --------------------------------------------------------------- | --------------------------------------------------------------------- |
| `qr-scan.js`      | Etkinlik başında herkes aynı QR kodunu bir dakika içinde okutur | Hata oranı < %1, p95 < 500 ms, p99 < 1,5 sn; tekrar okutma idempotent |
| `voting-close.js` | Oylamanın son dakikalarında saniyede 100 oya çıkan yük          | Hata oranı < %1, oy p95 < 400 ms, oy pusulası p95 < 300 ms            |

Yalnızca **yerel ya da hazırlık (staging)** ortamında çalıştırılır. Hazırlık betiği
`NODE_ENV=production` iken çalışmaz.

## Hazırlık

1. Takvimde, şu an süren bir etkinlik seçin (QR testi için). Voting testi için bugünün günlük
   seçimini yönetici panelinden yapın.
2. Öğrenci oturumlarını, konum rızasını, onaylı başvuruları ve QR belirtecini oluşturun:

   ```sh
   docker compose exec -T api node dist/load-prepare.js <etkinlik-public-id> 500 600 > prep.json
   ```

   Hız sınırları kullanıcı başınadır. Oylama testinde en az 1000 öğrenci hazırlayın; aksi
   hâlde aynı oturumların tekrar oy vermesi 429 yanıtına yol açar.

3. Testi çalıştırın:

   ```sh
   docker run --rm -i --network host -v "$PWD:/w" -w /w grafana/k6 run \
     -e BASE_URL=https://etkinlik.localhost -e PREP=/w/prep.json tools/load/qr-scan.js
   ```

`PREP` mutlak yol olmalıdır (k6 `open()` göreli yolu betiğin klasörüne göre çözer). `prep.json` dosyası oturum belirteçleri içerir. Depoya eklenmez, test bitince silinir.
Belirteçler oturum süresi dolunca (`SESSION_IDLE_SECONDS`) kendiliğinden geçersizleşir.
