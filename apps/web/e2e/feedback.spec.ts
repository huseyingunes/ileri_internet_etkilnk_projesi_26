import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';

const eventId = '01938a5d-ac96-7a4b-bcce-b302099a8057';
const summary = {
  id: eventId,
  title: 'Robot yarışması',
  category: 'science',
  status: 'completed',
  startsAt: '2027-03-10T07:00:00Z',
  endsAt: '2027-03-10T10:00:00Z',
  location: { name: 'Mühendislik Fakültesi', latitude: 41, longitude: 29 },
  organizer: { kind: 'user', id: '01938a5d-ac96-7a4b-bcce-b302099a8058', name: 'İrem Şahin' },
  capacity: 40,
  tags: [],
};
const detail = {
  ...summary,
  description: 'Kampüs içi robot yarışması.',
  participationRequirements: '',
  attendanceRadiusM: 100,
  qrRefreshSeconds: 25,
  createdAt: '2026-11-28T10:00:00Z',
  confirmedCount: 30,
  waitlistCount: 0,
  viewer: { canEdit: false, canReview: false, canManagePhotos: false },
};
const json = (body: unknown) => ({
  status: 200,
  contentType: 'application/json',
  body: JSON.stringify(body),
});

async function mock(page: Page) {
  await page.route('**/api/v1/me', (r) =>
    r.fulfill(
      json({
        id: 'u',
        displayName: 'Öğrenci',
        email: 's@uni.example',
        role: 'student',
        communities: [],
      }),
    ),
  );
  await page.route(`**/api/v1/events/${eventId}`, (r) => r.fulfill(json(detail)));
}

const axe = async (page: Page) =>
  (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze())
    .violations;

test('archive of a completed event shows numbers, results and lets an attendee rate', async ({
  page,
}) => {
  await mock(page);
  let rated: unknown;
  await page.route(`**/api/v1/events/${eventId}/summary`, (r) =>
    r.fulfill(
      json({
        event: detail,
        participantCount: 27,
        averageRating: 4.25,
        ratingCount: 8,
        voting: [
          {
            id: '01938a5d-ac96-7a4b-bcce-b302099a8060',
            date: '2027-03-01',
            category: 'science',
            status: 'winner',
            totalVotes: 52,
            winner: summary,
            tiedEventIds: [],
            entries: [{ event: summary, voteCount: 31 }],
          },
        ],
        photos: [],
        viewer: { canRate: rated === undefined, rated: rated !== undefined },
      }),
    ),
  );
  await page.route(`**/api/v1/events/${eventId}/ratings`, async (r) => {
    rated = r.request().postDataJSON();
    await r.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({ score: 5, createdAt: '2027-03-10T12:00:00Z' }),
    });
  });

  await page.goto(`/etkinlikler/${eventId}`);
  await expect(page.getByRole('heading', { name: 'Etkinlik arşivi' })).toBeVisible();
  await expect(page.getByText('27', { exact: true })).toBeVisible();
  await expect(page.getByText('4,25')).toBeVisible();
  await expect(page.getByRole('table', { name: 'Oylama sonuçları' })).toContainText('31');
  expect(await axe(page)).toEqual([]);

  await page.getByRole('radio', { name: '5' }).check();
  await page.getByLabel('Yorumunuz (isteğe bağlı)').fill('Çok iyiydi.');
  await page.getByRole('button', { name: 'Değerlendirmeyi gönder' }).click();
  await expect(page.getByText('Bu etkinliği değerlendirdiniz.')).toBeVisible();
  expect(rated).toEqual({ score: 5, comment: 'Çok iyiydi.' });
});

test('student answers a "why" question', async ({ page }) => {
  await mock(page);
  let answered: unknown;
  await page.route('**/api/v1/me/reason-prompts', (r) =>
    r.fulfill(
      json({
        items:
          answered === undefined
            ? [
                {
                  id: '01938a5d-ac96-7a4b-bcce-b302099a8061',
                  event: summary,
                  kind: 'why_not_attended',
                  question: 'Oy verdiğiniz bu etkinliğe neden katılmadınız?',
                  sentAt: '2027-03-10T12:00:00Z',
                },
              ]
            : [],
      }),
    ),
  );
  await page.route('**/api/v1/reason-prompts/*/answer', async (r) => {
    answered = r.request().postDataJSON();
    await r.fulfill({ status: 204 });
  });
  await page.goto('/sorularim');
  const field = page.getByLabel('Oy verdiğiniz bu etkinliğe neden katılmadınız?');
  await expect(field).toBeVisible();
  expect(await axe(page)).toEqual([]);
  await field.fill('Sınavım vardı.');
  await page.getByRole('button', { name: 'Yanıtı gönder' }).click();
  await expect(page.getByText('Bekleyen sorunuz yok.')).toBeVisible();
  expect(answered).toEqual({ answer: 'Sınavım vardı.' });
});
