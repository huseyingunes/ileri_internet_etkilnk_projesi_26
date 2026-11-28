#!/usr/bin/env bash
# Smoke test for the built Caddy image: private Keycloak admin paths and the
# security headers. Upstreams are not running, so only edge behaviour is checked.
# Usage: tools/smoke/caddy.sh <image>
set -euo pipefail
image="${1:?image}"
name="caddy-smoke-$$"
docker run -d --name "$name" -p 127.0.0.1:18443:443 \
  -e SITE_ADDRESS=localhost -e API_UPSTREAM=127.0.0.1:9 -e IDP_UPSTREAM=127.0.0.1:9 \
  -e APP_ORIGIN=https://localhost "$image" >/dev/null
trap 'docker rm -f "$name" >/dev/null' EXIT
for _ in $(seq 1 30); do
  curl -ksf -o /dev/null https://localhost:18443/ && break
  sleep 1
done

fail=0
expect_status() {
  local path="$1" want="$2" got
  got=$(curl -ks -o /dev/null -w '%{http_code}' "https://localhost:18443$path")
  if [ "$got" != "$want" ]; then echo "FAIL $path: $got (want $want)"; fail=1; else echo "ok   $path -> $got"; fi
}
expect_header() {
  local header="$1"
  if curl -ksI https://localhost:18443/ | grep -qi "^$header:"; then echo "ok   header $header"; else echo "FAIL missing $header"; fail=1; fi
}

expect_status /idp/admin 404
expect_status /idp/admin/master/console/ 404
expect_status /idp/admin/realms/etkinlik/users 404
expect_status / 200
for header in Content-Security-Policy Content-Security-Policy-Report-Only Strict-Transport-Security \
  X-Content-Type-Options Referrer-Policy Permissions-Policy Cross-Origin-Opener-Policy Reporting-Endpoints; do
  expect_header "$header"
done
exit "$fail"
