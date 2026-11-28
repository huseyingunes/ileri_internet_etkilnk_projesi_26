import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const token = 'eyJlIjoiMDE5MzhhNWQiLCJrIjoiZW50cnkifQ.c2lnbmF0dXJlLXZhbHVlLWJhc2U2NA';

test('verifies attendance with explained consent, removes the token from the URL and keeps coordinates out of storage', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ latitude: 41.0001, longitude: 29.0001, accuracy: 12 });
  await page.route('**/api/v1/me', (r) =>
    r.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: 'u',
        displayName: 'Öğrenci',
        email: 's@uni.example',
        role: 'student',
        communities: [],
      }),
    }),
  );
  await page.route('**/api/v1/me/consents', (r) =>
    r.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items: [{ kind: 'location', granted: false }] }),
    }),
  );
  let consented = false;
  await page.route('**/api/v1/me/consents/location', async (r) => {
    consented = true;
    await r.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });
  let scanned: Record<string, unknown> = {};
  await page.route('**/api/v1/attendance-scans', async (r) => {
    scanned = r.request().postDataJSON() as Record<string, unknown>;
    await r.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        accepted: true,
        kind: 'entry',
        scannedAt: '2027-03-10T07:01:00Z',
        distanceM: 14,
        presenceSoFarSeconds: 0,
        requiredPresenceSeconds: 3600,
      }),
    });
  });

  await page.goto(`/katilim#t=${token}`);
  await expect(page).toHaveURL(/\/katilim$/);
  await expect(page.getByRole('heading', { name: 'Konumunuz neden gerekiyor?' })).toBeVisible();
  const button = page.getByRole('button', { name: 'Konumumu paylaş ve katılımı doğrula' });
  await expect(button).toBeDisabled();
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
        .analyze()
    ).violations,
  ).toEqual([]);

  await page.getByRole('checkbox').check();
  await button.click();
  await expect(page.getByRole('status').filter({ hasText: 'Okutmanız kaydedildi.' })).toBeVisible();
  expect(consented).toBe(true);
  expect(scanned).toMatchObject({ token, latitude: 41.0001, longitude: 29.0001 });
  const stored = await page.evaluate(() =>
    [localStorage, sessionStorage]
      .flatMap((store) =>
        Array.from({ length: store.length }, (_, i) => store.getItem(store.key(i) ?? '')),
      )
      .join('|'),
  );
  expect(stored).not.toContain('41.0001');
  expect(stored).not.toContain(token);
});
