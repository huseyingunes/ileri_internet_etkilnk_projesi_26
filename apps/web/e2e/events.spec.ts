import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';

const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

const event = {
  id: '01938a5d-ac96-7a4b-bcce-b302099a8057',
  title: 'Robot yarışması',
  category: 'science',
  status: 'pending_approval',
  startsAt: '2027-03-10T07:00:00Z',
  endsAt: '2027-03-10T10:00:00Z',
  location: { name: 'Mühendislik Fakültesi', latitude: 41, longitude: 29 },
  organizer: { kind: 'user', id: '01938a5d-ac96-7a4b-bcce-b302099a8058', name: 'İrem Şahin' },
  capacity: 40,
  tags: ['robotik'],
};

const detail = {
  ...event,
  description: 'Kampüs içi robot yarışması.',
  participationRequirements: '',
  advisor: {
    id: '01938a5d-ac96-7a4b-bcce-b302099a8059',
    displayName: 'Mehmet Kaya',
    role: 'advisor',
  },
  attendanceRadiusM: 100,
  qrRefreshSeconds: 25,
  createdAt: '2026-11-28T10:00:00Z',
  viewer: { canEdit: true, canReview: true, canManagePhotos: true },
};

async function mockApi(page: Page, role: 'student' | 'advisor') {
  await page.route('**/api/v1/health/live', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: '{"status":"ok","checks":{}}',
    }),
  );
  await page.route('**/api/v1/me', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: 'u',
        displayName: 'Deneme Kullanıcı',
        email: 'x@uni.example',
        role,
        communities: [],
      }),
    }),
  );
  await page.route('**/api/v1/events?**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items: [event], page: { nextCursor: null } }),
    }),
  );
  await page.route(`**/api/v1/events/${event.id}`, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(detail) }),
  );
  await page.route('**/api/v1/advisors', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items: [detail.advisor] }),
    }),
  );
}

async function expectAccessible(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  expect(results.violations).toEqual([]);
}

test('lists events and opens the detail page with client-side navigation', async ({ page }) => {
  await mockApi(page, 'student');
  await page.goto('/etkinlikler');
  await expect(page.getByRole('heading', { level: 1, name: 'Etkinlikler' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Havuz' })).toHaveAttribute('aria-current', 'page');
  await expectAccessible(page);

  await page.getByRole('link', { name: 'Robot yarışması' }).click();
  await expect(page).toHaveURL(new RegExp(`/etkinlikler/${event.id}$`));
  await expect(page.getByRole('heading', { level: 1, name: 'Robot yarışması' })).toBeVisible();
  await expect(page.locator('main')).toBeFocused();
  await expectAccessible(page);
});

test('shows Istanbul times on the detail page', async ({ page }) => {
  await mockApi(page, 'student');
  await page.goto(`/etkinlikler/${event.id}`);
  await expect(page.locator(`time[datetime="${event.startsAt}"]`)).toContainText('10:00');
});

test('offers an accessible rejection dialog to the advisor', async ({ page }) => {
  await mockApi(page, 'advisor');
  await page.goto(`/etkinlikler/${event.id}`);
  await page.getByRole('button', { name: 'Reddet' }).click();
  const dialog = page.getByRole('dialog', { name: 'Öneriyi reddet' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('textbox', { name: 'Ret gerekçesi' })).toBeVisible();
  await expectAccessible(page);
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
});

test('labels every field of the proposal form and requires an advisor for students', async ({
  page,
}) => {
  await mockApi(page, 'student');
  await page.goto('/etkinlikler/yeni');
  for (const label of [
    'Başlık',
    'Açıklama',
    'Kategori',
    'Danışman',
    'Başlangıç',
    'Bitiş',
    'Konum',
    'Kontenjan',
  ]) {
    await expect(page.getByLabel(label, { exact: true })).toBeVisible();
  }
  await expect(page.getByLabel('Danışman', { exact: true })).toHaveAttribute('required', '');
  await expect(page.getByRole('option', { name: 'Mehmet Kaya' })).toBeAttached();
  await expectAccessible(page);
});

test('shows the review queue only to advisors and admins', async ({ page }) => {
  await mockApi(page, 'student');
  await page.goto('/etkinlikler');
  await expect(page.getByRole('link', { name: 'Onaylar' })).toHaveCount(0);
});
