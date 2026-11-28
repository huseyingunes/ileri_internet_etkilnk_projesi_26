import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';

const json = (body: unknown) => ({
  status: 200,
  contentType: 'application/json',
  body: JSON.stringify(body),
});

const TYPES = [
  'vote_result',
  'vote_invitation',
  'application_confirmed',
  'application_promoted',
  'event_reminder',
  'rating_request',
  'reason_request',
  'points_changed',
];

async function mock(page: Page) {
  let read = false;
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
  await page.route('**/api/v1/me/notifications?*', (r) =>
    r.fulfill(
      json({
        items: [
          {
            id: '01938a5d-ac96-7a4b-bcce-b302099a8070',
            type: 'application_confirmed',
            title: 'Başvurunuz onaylandı',
            body: '"Robot yarışması" etkinliğine başvurunuz onaylandı.',
            link: '/etkinlikler/01938a5d-ac96-7a4b-bcce-b302099a8057',
            ...(read ? { readAt: '2027-03-10T12:00:00Z' } : {}),
            createdAt: '2027-03-10T11:00:00Z',
          },
        ],
        unreadCount: read ? 0 : 1,
        page: { nextCursor: null },
      }),
    ),
  );
  await page.route('**/api/v1/me/notifications/*', async (r) => {
    read = true;
    await r.fulfill({ status: 204 });
  });
}

const axe = async (page: Page) =>
  (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze())
    .violations;

test('bell shows unread notifications and the list marks them read', async ({ page }) => {
  await mock(page);
  await page.goto('/');
  const bell = page.getByRole('link', { name: 'Bildirimler, 1 okunmamış' });
  await expect(bell).toBeVisible();
  await bell.click();
  await expect(page.getByRole('heading', { name: 'Bildirimler', level: 1 })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Başvurunuz onaylandı' })).toBeVisible();
  expect(await axe(page)).toEqual([]);
  await page.getByRole('button', { name: 'Okundu olarak işaretle' }).click();
  await expect(page.getByRole('link', { name: 'Bildirimler', exact: true })).toBeVisible();
  const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  const width = await page.evaluate(() => window.innerWidth);
  expect(scrollWidth).toBeLessThanOrEqual(width);
});

test('profile manages consents, channel preferences and interests', async ({ page }) => {
  await mock(page);
  await page.route('**/api/v1/me/consents', (r) =>
    r.fulfill(
      json({
        items: [
          { kind: 'location', granted: true, textVersion: '2026-11' },
          { kind: 'whatsapp', granted: false, textVersion: '2026-11' },
          { kind: 'photo', granted: false, textVersion: '2026-11' },
        ],
      }),
    ),
  );
  let prefs: unknown;
  await page.route('**/api/v1/me/notification-preferences', async (r) => {
    if (r.request().method() === 'PUT') {
      prefs = r.request().postDataJSON();
      await r.fulfill(json(prefs));
      return;
    }
    await r.fulfill(
      json({
        items: ['email', 'whatsapp'].flatMap((channel) =>
          TYPES.map((type) => ({ channel, type, enabled: channel === 'email' })),
        ),
      }),
    );
  });
  let interests: unknown;
  await page.route('**/api/v1/me/interests', async (r) => {
    if (r.request().method() === 'PUT') interests = r.request().postDataJSON();
    await r.fulfill(json({ selected: ['robotik'], inferred: ['astronomi'] }));
  });

  await page.goto('/profil');
  await expect(page.getByRole('heading', { name: 'Profil ve bildirimler' })).toBeVisible();
  await expect(page.getByRole('checkbox', { name: /Konum/ })).toBeChecked();
  await expect(page.getByText('#astronomi')).toBeVisible();
  expect(await axe(page)).toEqual([]);

  await page.getByRole('checkbox', { name: 'Yaklaşan etkinlik hatırlatması: E-posta' }).uncheck();
  await page.getByRole('button', { name: 'Tercihleri kaydet' }).click();
  await expect(page.getByText('Bildirim tercihleriniz kaydedildi.')).toBeVisible();
  const items = (prefs as { items: { channel: string; type: string; enabled: boolean }[] }).items;
  expect(items).toHaveLength(16);
  expect(items.find((i) => i.channel === 'email' && i.type === 'event_reminder')?.enabled).toBe(
    false,
  );

  await page.getByLabel('Seçtiğiniz ilgi alanları').fill('Robotik, satranç, robotik');
  await page.getByRole('button', { name: 'İlgi alanlarını kaydet' }).click();
  await expect(page.getByText('İlgi alanlarınız kaydedildi.')).toBeVisible();
  expect(interests).toEqual({ selected: ['robotik', 'satranç'] });
});
