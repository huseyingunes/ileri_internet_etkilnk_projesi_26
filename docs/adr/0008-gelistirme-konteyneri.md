# 0008. Yalıtılmış geliştirme konteyneri

- Durum: Kabul edildi
- Tarih: 2026-11-28

## Bağlam

Prompt, yapay zekâ ajanının yalıtılmış bir geliştirme konteynerinde çalışmasını istiyor.
Geliştirici makinesinde Node 24 kurulu; proje Node 26 LTS gerektiriyor.

## Karar

- `.devcontainer/` Trail of Bits `devcontainer-setup` şablonundan üretildi ve uyarlandı:
  Node 26 (fnm), Claude Code ve eklenti marketplace'leri (Trail of Bits, wshobson),
  docker-outside-of-docker (Testcontainers ve Compose için), GitHub CLI.
- `.devcontainer/` konteynere salt okunur bağlanır; konteyner kendi yapılandırmasını
  değiştiremez.
- `node_modules` bir Docker birimindedir; Windows dosya sistemiyle karışmaz.
- Şablonun konteyner içindeki Claude Code'u izin sormadan çalıştıran (`bypassPermissions`)
  ayarı **kaldırıldı**. İzin modu geliştiricinin kendi kararıdır.
- Ana makinedeki `.gitconfig` bağlanmaz (Windows'ta yol sorunu çıkarıyordu); VS Code Dev
  Containers git kimliğini kendisi kopyalar. Commit'ler ana makineden de atılabilir.
- npm kurulum betikleri kapalıdır (`NPM_CONFIG_IGNORE_SCRIPTS=true`).

## Sonuçlar

- Açmak için: VS Code'da "Reopen in Container" ya da
  `devcontainer up --workspace-folder .` ve `devcontainer exec --workspace-folder . <komut>`.
- Testcontainers konteyner içinden ana makinedeki Docker'a `host.docker.internal`
  üzerinden ulaşır (`TESTCONTAINERS_HOST_OVERRIDE`).
