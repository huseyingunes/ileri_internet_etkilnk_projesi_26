// k6 load test: the last minutes before voting closes at 23:59 (Istanbul),
// when many students vote at once (prompt section 11: voting close).
//
//   k6 run -e BASE_URL=https://etkinlik.localhost -e PREP=/w/prep.json tools/load/voting-close.js
//
// Needs today's ballot (admin daily selection) and prep.json from load-prepare.
import http from 'k6/http';
import { check, fail } from 'k6';
import exec from 'k6/execution';

const prep = JSON.parse(open(__ENV.PREP));
const base = __ENV.BASE_URL || 'https://etkinlik.localhost';

export const options = {
  insecureSkipTLSVerify: true,
  scenarios: {
    last_minutes: {
      executor: 'ramping-arrival-rate',
      startRate: 10,
      timeUnit: '1s',
      preAllocatedVUs: 100,
      maxVUs: 300,
      stages: [
        { target: 50, duration: '30s' },
        { target: 100, duration: '60s' },
        { target: 0, duration: '10s' },
      ],
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.01'],
    'http_req_duration{name:vote}': ['p(95)<400', 'p(99)<1000'],
    'http_req_duration{name:ballot}': ['p(95)<300'],
  },
};

const headers = (session) => ({
  'Content-Type': 'application/json',
  Cookie: `__Host-session=${session}`,
  Origin: base,
  'Sec-Fetch-Site': 'same-origin',
});

export function setup() {
  const res = http.get(`${base}/api/v1/ballots`, { headers: headers(prep.sessions[0]) });
  if (res.status !== 200) fail(`ballot not available: ${res.status}`);
  const categories = res.json('categories');
  const entries = Object.values(categories)
    .flat()
    .map((e) => e.id);
  if (entries.length === 0) fail('today has no ballot; run the daily selection first');
  return { entries };
}

export default function (data) {
  const index = exec.scenario.iterationInTest;
  const session = prep.sessions[index % prep.sessions.length];
  const ballot = http.get(`${base}/api/v1/ballots`, {
    headers: headers(session),
    tags: { name: 'ballot' },
  });
  check(ballot, { 'ballot 200': (r) => r.status === 200 });
  const entry = data.entries[Math.floor(Math.random() * data.entries.length)];
  const vote = http.post(`${base}/api/v1/votes`, JSON.stringify({ ballotEntryId: entry }), {
    headers: headers(session),
    tags: { name: 'vote' },
  });
  // 201 first vote, 200 idempotent repeat, 409 another entry in the same category; 429 = limit.
  check(vote, { 'vote handled': (r) => [200, 201, 409].includes(r.status) });
}
