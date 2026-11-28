import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

async function mockHealth(page: Page, status: number) {
  await page.route('**/api/v1/health/live', (route) =>
    route.fulfill({
      status,
      contentType: 'application/json',
      body: JSON.stringify(
        status === 200
          ? { status: 'ok', checks: {} }
          : { code: 'INTERNAL_ERROR', message: 'x', fieldErrors: [], requestId: 'r' },
      ),
    }),
  );
}

async function mockSession(page: Page, signedIn: boolean) {
  await page.route('**/api/v1/me', (route) =>
    route.fulfill(
      signedIn
        ? {
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              id: '01938a5d-ac96-7a4b-bcce-b302099a8057',
              displayName: 'Ayşe Yılmaz',
              email: 'ayse.yilmaz1@ogr.uni.example',
              role: 'student',
              communities: [],
            }),
          }
        : {
            status: 401,
            contentType: 'application/json',
            body: JSON.stringify({
              code: 'UNAUTHENTICATED',
              message: 'x',
              fieldErrors: [],
              requestId: 'r',
            }),
          },
    ),
  );
}

async function expectNoAxeViolations(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  expect(results.violations).toEqual([]);
}

test.describe('application shell', () => {
  test.beforeEach(async ({ page }) => {
    await mockSession(page, false);
  });

  test('renders in Turkish and reports a healthy server', async ({ page }) => {
    await mockHealth(page, 200);
    await page.goto('/');

    await expect(page.locator('html')).toHaveAttribute('lang', 'tr');
    await expect(page).toHaveTitle('Etkinlik Platformu');
    await expect(page.getByRole('heading', { level: 1, name: 'Hoş geldiniz' })).toBeVisible();
    await expect(page.getByRole('status')).toHaveText('Sunucu çalışıyor.');
    await expectNoAxeViolations(page);
  });

  test('shows an accessible error with a retry button when the API is down', async ({ page }) => {
    await mockHealth(page, 503);
    await page.goto('/');

    await expect(page.getByRole('status')).toHaveText('Sunucuya şu anda ulaşılamıyor.');
    const retry = page.getByRole('button', { name: 'Yeniden dene' });
    await expect(retry).toBeVisible();

    const box = await retry.boundingBox();
    expect(box?.width ?? 0).toBeGreaterThanOrEqual(44);
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
    await expectNoAxeViolations(page);
  });

  test('is keyboard operable: skip link moves focus to the main content', async ({ page }) => {
    await mockHealth(page, 200);
    await page.goto('/');

    await page.keyboard.press('Tab');
    const skipLink = page.getByRole('link', { name: 'Ana içeriğe geç' });
    await expect(skipLink).toBeFocused();
    await expect(skipLink).toBeVisible();

    await page.keyboard.press('Enter');
    await expect(page.locator('main')).toBeFocused();
  });

  test('takes colours and fonts from design-system tokens', async ({ page }) => {
    await mockHealth(page, 200);
    await page.goto('/');

    const styles = await page.evaluate(() => {
      const body = getComputedStyle(document.body);
      const heading = document.querySelector('h1');
      return {
        background: body.backgroundColor,
        foreground: body.color,
        font: body.fontFamily,
        headingColor: heading === null ? '' : getComputedStyle(heading).color,
      };
    });
    expect(styles.background).toBe('rgb(248, 250, 252)'); // --color-background
    expect(styles.foreground).toBe('rgb(15, 23, 42)'); // --color-foreground
    expect(styles.headingColor).toBe('rgb(15, 23, 42)');
    expect(styles.font).toContain('Plus Jakarta Sans');
  });

  test('has no horizontal scroll at phone width', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await mockHealth(page, 200);
    await page.goto('/');

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test('stays usable in landscape with 200% text size', async ({ page }) => {
    await page.setViewportSize({ width: 812, height: 375 });
    await mockHealth(page, 503);
    await page.goto('/');
    await page.addStyleTag({ content: 'html { font-size: 200%; }' });

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
    const retry = page.getByRole('button', { name: 'Yeniden dene' });
    await retry.scrollIntoViewIfNeeded();
    await expect(retry).toBeInViewport();
  });

  test('links a web app manifest for installation', async ({ page, request }) => {
    await mockHealth(page, 200);
    await page.goto('/');

    const href = await page.locator('link[rel="manifest"]').getAttribute('href');
    expect(href).not.toBeNull();
    const manifest: unknown = await (await request.get(href ?? '')).json();
    expect(manifest).toMatchObject({
      name: 'Etkinlik Platformu',
      lang: 'tr',
      display: 'standalone',
    });
  });
});

test.describe('account', () => {
  test('offers server-side login that returns to the current page', async ({ page }) => {
    await mockHealth(page, 200);
    await mockSession(page, false);
    await page.goto('/?sekme=oylar');

    const login = page.getByRole('link', { name: 'Giriş yap', exact: true });
    await expect(login).toHaveAttribute(
      'href',
      `/api/v1/auth/login?returnTo=${encodeURIComponent('/?sekme=oylar')}`,
    );
    await expectNoAxeViolations(page);
  });

  test('shows the signed-in user and a keyboard-operable logout button', async ({ page }) => {
    await mockHealth(page, 200);
    await mockSession(page, true);
    await page.route('**/api/v1/auth/logout', (route) => route.fulfill({ status: 204 }));
    await page.goto('/');

    const logout = page.getByRole('button', { name: 'Çıkış yap' });
    await expect(logout).toBeVisible();
    const box = await logout.boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
    await expectNoAxeViolations(page);

    await logout.focus();
    const loggedOut = page.waitForRequest('**/api/v1/auth/logout');
    await page.keyboard.press('Enter');
    expect((await loggedOut).method()).toBe('POST');
  });

  test('announces a failed login', async ({ page }) => {
    await mockHealth(page, 200);
    await mockSession(page, false);
    await page.goto('/?giris=hata');

    await expect(page.getByRole('alert')).toContainText('Giriş tamamlanamadı.');
    const login = page.getByRole('link', { name: 'Giriş yap', exact: true });
    await expect(login).toHaveAttribute(
      'href',
      `/api/v1/auth/login?returnTo=${encodeURIComponent('/')}`,
    );
    await expectNoAxeViolations(page);
  });
});
