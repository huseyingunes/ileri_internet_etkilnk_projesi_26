// k6 load test: the start of a popular event, when every student scans the
// same QR code within a minute (prompt section 11: QR verification burst).
//
//   k6 run -e BASE_URL=https://etkinlik.localhost -e PREP=/w/prep.json tools/load/qr-scan.js
//
// prep.json comes from `node dist/load-prepare.js <eventId> <students>` (see README.md).
import http from 'k6/http';
import { check } from 'k6';
import exec from 'k6/execution';

const prep = JSON.parse(open(__ENV.PREP));
const base = __ENV.BASE_URL || 'https://etkinlik.localhost';

export const options = {
  insecureSkipTLSVerify: true, // local Caddy uses its internal CA
  scenarios: {
    entry_burst: {
      executor: 'shared-iterations',
      vus: Math.min(prep.sessions.length, 200),
      iterations: prep.sessions.length,
      maxDuration: '2m',
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.01'],
    'http_req_duration{name:scan}': ['p(95)<500', 'p(99)<1500'],
    checks: ['rate>0.99'],
  },
};

export default function () {
  const index = exec.scenario.iterationInTest;
  const session = prep.sessions[index % prep.sessions.length];
  const params = {
    headers: {
      'Content-Type': 'application/json',
      Cookie: `__Host-session=${session}`,
      Origin: base,
      'Sec-Fetch-Site': 'same-origin',
    },
    tags: { name: 'scan' },
  };
  const body = JSON.stringify({
    token: prep.qrToken,
    // Deterministic spread of a few metres around the venue (no randomness needed).
    latitude: prep.location.latitude + ((index % 9) - 4) * 0.00005,
    longitude: prep.location.longitude + ((index % 7) - 3) * 0.00005,
    accuracyM: 15,
  });
  const first = http.post(`${base}/api/v1/attendance-scans`, body, params);
  check(first, {
    'scan answered 200': (r) => r.status === 200,
    'scan accepted': (r) => r.status === 200 && r.json('accepted') === true,
  });
  // A second scan of the same code must be idempotent (same result, no new row).
  const again = http.post(`${base}/api/v1/attendance-scans`, body, params);
  check(again, {
    'repeat is idempotent': (r) =>
      r.status === 200 && r.json('scannedAt') === first.json('scannedAt'),
  });
}
