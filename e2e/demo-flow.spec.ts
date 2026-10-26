import { expect, test } from '@playwright/test';

test('judge flow: landing → demo → track bus → select stop → reminder → notifications → admin blocked', async ({ page, isMobile }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Never miss your bus again.' })).toBeVisible();

  await page.getByRole('button', { name: 'Explore Demo' }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByText('Demo session — fictional district, simulated buses.')).toBeVisible();
  await expect(page.getByText('DEMO LIVE SIMULATION').first()).toBeVisible();

  await page.goto('/track');
  await expect(page.getByRole('region', { name: 'Map of all buses and routes' })).toBeVisible();
  await expect(page.locator('.leaflet-marker-icon').first()).toBeVisible();

  await page.getByRole('link', { name: /^Bus 12, Route 1/ }).click();
  await expect(page).toHaveURL(/\/track\/demo-bus-12/);
  await expect(page.getByRole('heading', { name: 'Live bus tracking' })).toBeVisible();

  await page.getByRole('button', { name: /Maplewood Valley HS — Bus Loop/ }).click();
  await expect(page).toHaveURL(/stop=demo-stop-school/);

  const card = page.getByRole('region', { name: 'Arrival estimate: Maplewood Valley HS — Bus Loop' });
  await expect(card).toBeVisible();
  await expect(card.getByText(/^(\d+ min|Arriving now|Completed)$/)).toBeVisible();

  const progress = page.getByRole('progressbar', { name: 'Route progress' });
  const before = Number(await progress.getAttribute('aria-valuenow'));
  await expect.poll(async () => Number(await progress.getAttribute('aria-valuenow')), { timeout: 20_000 }).toBeGreaterThanOrEqual(before);

  const reminder = page.getByRole('radiogroup', { name: /Arrival reminder for Maplewood Valley HS/ });
  await reminder.getByRole('radio', { name: '10 min' }).click();
  await expect(page.getByText('Reminder set: 10 minutes before arrival')).toBeVisible();
  await expect(reminder.getByRole('radio', { name: '10 min' })).toHaveAttribute('aria-checked', 'true');

  await page.goto('/stops?route=demo-route-1&q=Bus%20Loop');
  await expect(page.getByLabel('Arrival reminder for Maplewood Valley HS — Bus Loop')).toHaveValue('10');

  if (isMobile) await page.getByRole('link', { name: /Alerts/ }).click();
  else await page.getByRole('navigation', { name: 'Main' }).first().getByRole('link', { name: /Notifications/ }).click();
  await expect(page.getByRole('heading', { name: 'Notifications' })).toBeVisible();
  await expect(page.getByText('Welcome to the BusBuddy demo')).toBeVisible();
  await expect(page.getByText('Demo').first()).toBeVisible();

  await page.goto('/admin');
  await expect(page).toHaveURL(/\/dashboard$/);
  const status = await page.evaluate(async () => (await fetch('/api/v1/admin/overview', { credentials: 'include' })).status);
  expect(status).toBe(403);
});

test('parent demo shows only verified students', async ({ page }) => {
  await page.goto('/demo');
  await page.getByRole('button', { name: /Explore as a parent/ }).click();
  await expect(page).toHaveURL(/\/parent$/);
  await expect(page.getByRole('tab', { name: 'Avery Rivera (demo)' })).toBeVisible();
  await expect(page.getByText('Student (hidden until verified)')).toBeVisible();
  await expect(page.getByText('Sam Okafor')).toHaveCount(0);
});
