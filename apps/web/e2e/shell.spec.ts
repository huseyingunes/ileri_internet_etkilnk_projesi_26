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

async function expectNoAxeViolations(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  expect(results.violations).toEqual([]);
}

test.describe('application shell', () => {
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
