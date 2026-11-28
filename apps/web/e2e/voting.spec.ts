import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';

const event = (id: string, title: string, category: string) => ({
  id,
  title,
  category,
  status: 'pool',
  startsAt: '2027-03-10T07:00:00Z',
  endsAt: '2027-03-10T10:00:00Z',
  location: { name: 'Kampüs', latitude: 41, longitude: 29 },
  organizer: { kind: 'user', id: 'u', name: 'Ayşe' },
  capacity: 40,
  tags: [],
});
const ids = [
  '01938a5d-ac96-7a4b-bcce-b302099a8061',
  '01938a5d-ac96-7a4b-bcce-b302099a8062',
  '01938a5d-ac96-7a4b-bcce-b302099a8063',
];

async function mock(page: Page, role: string) {
  await page.route('**/api/v1/me', (r) =>
    r.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: 'u',
        displayName: 'Test',
        email: 't@uni.example',
        role,
        communities: [],
      }),
    }),
  );
  await page.route('**/api/v1/ballots', (r) =>
    r.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        date: '2027-03-01',
        opensAt: '2027-02-28T21:00:00Z',
        closesAt: '2027-03-01T21:00:00Z',
        categories: {
          science: ids.map((id, i) => ({
            id,
            event: event(id, `Bilim ${i.toString()}`, 'science'),
            voteCount: null,
          })),
          culture: [],
          sports: [],
        },
        myVotes: { science: null, culture: null, sports: null },
      }),
    }),
  );
}

test('lets a student vote with the keyboard through a native radio group', async ({ page }) => {
  await mock(page, 'student');
  let voted: unknown;
  await page.route('**/api/v1/votes', async (r) => {
    voted = r.request().postDataJSON();
    await r.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({
        category: 'science',
        ballotEntryId: ids[1],
        date: '2027-03-01',
        createdAt: '2027-03-01T10:00:00Z',
      }),
    });
  });
  await page.goto('/oylama');
  const group = page.getByRole('group', { name: 'Bilim' });
  await expect(group).toBeVisible();
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
        .analyze()
    ).violations,
  ).toEqual([]);

  await group.getByRole('radio', { name: /Bilim 1/ }).check();
  await page.getByRole('button', { name: 'Bilim için oy ver' }).press('Enter');
  await expect(page.getByRole('status').filter({ hasText: 'Oyunuz kaydedildi.' })).toBeVisible();
  expect(voted).toEqual({ ballotEntryId: ids[1] });
});

test('does not offer voting to advisors', async ({ page }) => {
  await mock(page, 'advisor');
  await page.goto('/oylama');
  await expect(page.getByRole('button', { name: 'Bilim için oy ver' })).toHaveCount(0);
  await expect(page.getByRole('radio').first()).toBeDisabled();
});
