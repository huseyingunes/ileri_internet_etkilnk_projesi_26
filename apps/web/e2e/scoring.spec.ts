import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';

const event = {
  id: '01938a5d-0000-7000-8000-000000000001',
  title: 'Robotik atölyesi',
  category: 'science',
  status: 'completed',
  startsAt: '2027-03-10T07:00:00Z',
  endsAt: '2027-03-10T09:00:00Z',
  location: { name: 'Amfi 1', latitude: 41, longitude: 29 },
  organizer: { kind: 'community', id: '01938a5d-0000-7000-8000-000000000002', name: 'Robotik' },
  capacity: 40,
  tags: [],
};
const summary = {
  season: '2026-2027',
  points: 1520,
  rank: 3,
  attendedCount: 1,
  votedCount: 2,
  attendanceRateAfterVoting: 1,
};

async function mock(page: Page, role: 'student' | 'admin') {
  const json = (body: unknown) => ({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(body),
  });
  await page.route('**/api/v1/me', (r) =>
    r.fulfill(
      json({ id: 'u', displayName: 'Kullanıcı', email: 'u@uni.example', role, communities: [] }),
    ),
  );
  await page.route('**/api/v1/me/score?*', (r) => r.fulfill(json(summary)));
  await page.route('**/api/v1/me/score-entries?*', (r) =>
    r.fulfill(
      json({
        items: [
          {
            event,
            ruleCode: 'voted_winner_attended',
            points: 20,
            createdAt: '2027-03-10T10:00:00Z',
          },
        ],
        page: { nextCursor: null },
      }),
    ),
  );
  await page.route('**/api/v1/seasons', (r) =>
    r.fulfill(
      json({
        items: [
          { name: '2026-2027', startsOn: '2026-09-01', endsOn: '2027-08-31', status: 'active' },
          { name: '2025-2026', startsOn: '2025-09-01', endsOn: '2026-08-31', status: 'closed' },
        ],
      }),
    ),
  );
  await page.route('**/api/v1/leaderboard?*', (r) =>
    r.fulfill(
      json({
        season: {
          name: '2026-2027',
          startsOn: '2026-09-01',
          endsOn: '2027-08-31',
          status: 'active',
        },
        entries: Array.from({ length: 10 }, (_, i) => ({
          rank: i + 1,
          student: {
            id: `s${String(i)}`,
            displayName: `Öğrenci ${String(i + 1)}`,
            role: 'student',
          },
          points: 1600 - i * 10,
          attendedCount: 5 - Math.floor(i / 2),
        })),
        ...(role === 'student' ? { me: summary } : {}),
      }),
    ),
  );
  await page.route('**/api/v1/score-rules', (r) =>
    r.fulfill(
      json({
        items: [
          ['voted_winner_attended', 20],
          ['voted_winner_absent', -20],
          ['no_vote_attended', 10],
          ['voted_other_attended', 30],
          ['voted_other_absent', 0],
          ['no_vote_absent', 0],
        ].map(([code, points]) => ({ code, points, validFrom: '2026-11-28T00:00:00Z' })),
      }),
    ),
  );
}

const axe = async (page: Page) =>
  (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze())
    .violations;

test('student sees points, history and the leaderboard with their own standing', async ({
  page,
}) => {
  await mock(page, 'student');
  await page.goto('/puanim');
  await expect(page.getByRole('heading', { name: 'Puanım', level: 1 })).toBeVisible();
  await expect(page.getByText('1520')).toBeVisible();
  await expect(
    page.getByRole('row', {
      name: /Robotik atölyesi.*Oy verdiği etkinlik kazandı ve katıldı.*\+20/,
    }),
  ).toBeVisible();
  expect(await axe(page)).toEqual([]);

  await page.getByRole('link', { name: 'Liderlik' }).click();
  await expect(page.getByRole('heading', { name: 'Liderlik tablosu' })).toBeVisible();
  await expect(page.getByRole('row')).toHaveCount(11);
  await expect(page.getByRole('heading', { name: 'Sizin durumunuz' })).toBeVisible();
  await expect(page.getByLabel('Sezon (akademik yıl)')).toBeVisible();
  expect(await axe(page)).toEqual([]);
});

test('admin edits a point value with the keyboard', async ({ page }) => {
  await mock(page, 'admin');
  let sent: unknown;
  await page.route('**/api/v1/score-rules/no_vote_attended', async (r) => {
    sent = r.request().postDataJSON();
    await r.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        code: 'no_vote_attended',
        points: 15,
        validFrom: '2026-11-29T00:00:00Z',
      }),
    });
  });
  await page.goto('/puan-tablosu');
  const row = page.getByRole('row', { name: /Oy kullanmadı ama kazanan etkinliğe katıldı/ });
  const input = row.getByLabel('Puan');
  await input.fill('15');
  await input.press('Enter');
  await expect(row.getByText('Kaydedildi.', { exact: false })).toBeVisible();
  expect(sent).toEqual({ points: 15 });
  expect(await axe(page)).toEqual([]);
});
