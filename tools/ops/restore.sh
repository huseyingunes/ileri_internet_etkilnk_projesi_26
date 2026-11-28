#!/usr/bin/env bash
# Restores a backup made by tools/ops/backup.sh. DESTRUCTIVE: replaces the
# current database contents and storage volumes. Stops api and worker first.
#   tools/ops/restore.sh backups/<timestamp> --yes
set -euo pipefail

source_dir="${1:?backup directory}"
if [[ "${2:-}" != "--yes" ]]; then
  echo "This replaces all data with $source_dir. Re-run with --yes to continue." >&2
  exit 2
fi
(cd "$source_dir" && sha256sum --check --quiet SHA256SUMS)
compose=(docker compose)
project="${COMPOSE_PROJECT_NAME:-etkinlik}"

"${compose[@]}" stop api worker caddy >/dev/null

echo "PostgreSQL ← $source_dir"
"${compose[@]}" exec -T postgres sh -c \
  'pg_restore --clean --if-exists --no-owner -U "$POSTGRES_USER" -d "$POSTGRES_DB"' \
  <"$source_dir/app.dump"
"${compose[@]}" exec -T postgres sh -c \
  'pg_restore --clean --if-exists --no-owner -U "$POSTGRES_USER" -d keycloak' \
  <"$source_dir/keycloak.dump"

echo "Garage volumes ← $source_dir"
"${compose[@]}" stop garage >/dev/null
for volume in garage_meta garage_data; do
  docker run --rm -v "${project}_${volume}:/data" -v "$(pwd)/$source_dir:/backup:ro" alpine:3.22 \
    sh -c "rm -rf /data/* && tar -C /data -xzf /backup/${volume}.tar.gz"
done
"${compose[@]}" start garage >/dev/null

# Bring the dashboard views in line with the restored data (cheap; harmless if current).
"${compose[@]}" exec -T postgres sh -c 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"' <<'SQL'
REFRESH MATERIALIZED VIEW analytics_event_facts;
REFRESH MATERIALIZED VIEW analytics_ballot_votes;
REFRESH MATERIALIZED VIEW analytics_winner_voters;
REFRESH MATERIALIZED VIEW analytics_non_attendance_reasons;
SQL

"${compose[@]}" start caddy api worker >/dev/null
echo "Restored. Check GET /api/v1/health/ready on APP_ORIGIN and run the data checks in docs/isletim-kilavuzu.md."
