#!/usr/bin/env bash
# Backup of everything that is not reproducible from the repository:
#   1. PostgreSQL (application data and the Keycloak database) as custom-format dumps
#   2. the Garage data and metadata volumes (uploaded images, data exports)
# Run on the host from the repository root:  tools/ops/backup.sh [target-dir]
# The target directory should live on another disk or be copied off-site.
set -euo pipefail

target="${1:-backups}/$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$target"
chmod 700 "$target"
compose=(docker compose)

echo "PostgreSQL → $target"
"${compose[@]}" exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' \
  >"$target/app.dump"
"${compose[@]}" exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" -d keycloak -Fc' \
  >"$target/keycloak.dump"

echo "Garage volumes → $target (brief pause of the storage container keeps the copy consistent)"
project="${COMPOSE_PROJECT_NAME:-etkinlik}"
"${compose[@]}" stop garage >/dev/null
trap '"${compose[@]}" start garage >/dev/null' EXIT
for volume in garage_meta garage_data; do
  docker run --rm -v "${project}_${volume}:/data:ro" -v "$(pwd)/$target:/backup" alpine:3.22 \
    tar -C /data -czf "/backup/${volume}.tar.gz" .
done
"${compose[@]}" start garage >/dev/null
trap - EXIT

# Integrity: every dump must list its contents; checksums detect later corruption.
for dump in "$target"/*.dump; do
  "${compose[@]}" exec -T postgres pg_restore --list >/dev/null <"$dump"
done
(cd "$target" && sha256sum ./* >SHA256SUMS)
echo "Done: $target"
