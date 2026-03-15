import { test, expect } from '@playwright/test';
import { login, register, uniqueEmail } from './helpers';

test.describe('Authentication', () => {
  test('new user can register and sees the sidebar', async ({ page }) => {
    const email = uniqueEmail();
    await register(page, 'New Tester', email);

    // Should be on the main app with sidebar visible
    await expect(page.getByTestId('sidebar')).toBeVisible();
    // Should see channel list (general should exist by default)
    await expect(page.getByTestId('sidebar').locator('button').filter({ has: page.locator('span.truncate', { hasText: 'general' }) }).first()).toBeVisible();
  });

  test('existing seed user can login and sees the sidebar', async ({ page }) => {
    await login(page, 'alice@clack.dev');

    // Should be on the main app with the sidebar visible
    await expect(page.getByTestId('sidebar')).toBeVisible();
    await expect(page.getByTestId('sidebar').locator('button').filter({ has: page.locator('span.truncate', { hasText: 'general' }) }).first()).toBeVisible();
  });

  test('after successful login, user sees channels page', async ({ page }) => {
    // Register a fresh user first, then verify app loads
    const email = uniqueEmail();
    await register(page, 'Login Tester', email);

    // The Clack workspace header should be visible
    await expect(page.locator('text=Clack')).toBeVisible();

    // Sidebar channel list should be visible
    await expect(page.getByTestId('sidebar')).toBeVisible();

    // At least the #general channel should be present
    await expect(page.getByTestId('sidebar').locator('button').filter({ has: page.locator('span.truncate', { hasText: 'general' }) }).first()).toBeVisible();

    // The message input area should be visible for the active channel
    await expect(page.locator('.ql-editor')).toBeVisible({ timeout: 10_000 });
  });
});
