#!/bin/sh
# Creates a separate database and role for Keycloak on first start of an empty
# data volume. For an existing volume run the same statements once by hand
# (docs/isletim-kilavuzu.md, "Keycloak").
set -eu
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  -v kc_password="$KEYCLOAK_DB_PASSWORD" <<'SQL'
CREATE ROLE keycloak LOGIN PASSWORD :'kc_password';
CREATE DATABASE keycloak OWNER keycloak;
SQL
