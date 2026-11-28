import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const json = (body: unknown) => ({
  status: 200,
  contentType: 'application/json',
  body: JSON.stringify(body),
});

test('dashboard shows tiles, charts with data tables and filters by category', async ({ page }) => {
  await page.route('**/api/v1/me', (r) =>
    r.fulfill(
      json({
        id: 'u',
        displayName: 'Yönetici',
        email: 'a@uni.example',
        role: 'admin',
        communities: [],
      }),
    ),
  );
  await page.route('**/api/v1/seasons', (r) =>
    r.fulfill(
      json({
        items: [
          { name: '2026-2027', startsOn: '2026-09-01', endsOn: '2027-08-31', status: 'active' },
        ],
      }),
    ),
  );
  const requested: string[] = [];
  await page.route('**/api/v1/analytics/overview?*', async (r) => {
    requested.push(new URL(r.request().url()).search);
    await r.fulfill(
      json({
        season: '2026-2027',
        registeredStudents: 30,
        completedEvents: 4,
        voterAttendanceRate: 0.75,
        averageRating: 4.2,
        byCategory: [
          { category: 'science', votes: 40, attendees: 22 },
          { category: 'culture', votes: 25, attendees: 12 },
          { category: 'sports', votes: 18, attendees: 9 },
        ],
        nonAttendanceReasons: [
          { label: 'Ders veya sınav', count: 5 },
          { label: 'Zaman çakışması', count: 3 },
        ],
        communities: [
          {
            community: { id: 'c1', name: 'Robotik Topluluğu' },
            completedEvents: 2,
            wins: 2,
            averageRating: 4.5,
          },
        ],
        attendanceByHour: [
          { hour: 10, attendees: 20 },
          { hour: 14, attendees: 23 },
        ],
      }),
    );
  });

  await page.goto('/panel');
  await expect(page.getByRole('heading', { name: 'Yönetici paneli' })).toBeVisible();
  await expect(page.getByText('%75')).toBeVisible();
  await expect(
    page.getByRole('table', { name: 'Kategori bazında oy ve katılımcı sayıları' }),
  ).toContainText('40');
  await expect(page.getByRole('table', { name: 'Katılmama nedenlerinin dağılımı' })).toContainText(
    'Ders veya sınav',
  );
  await expect(page.getByRole('table', { name: /başlangıç saatine göre/ })).toContainText('14.00');
  await expect(page.getByRole('row', { name: /Robotik Topluluğu/ })).toBeVisible();
  await expect(page.locator('.recharts-surface').first()).toBeVisible();
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
        .analyze()
    ).violations,
  ).toEqual([]);

  await page.getByRole('combobox', { name: 'Kategori' }).selectOption('sports');
  await expect.poll(() => requested.at(-1)).toContain('category=sports');
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});
