import { test, expect } from '@playwright/test';
import { login, clickChannel, waitForChannelReady } from './helpers';

test.describe('Channel name dropdown', () => {
  test('clicking channel name opens members panel', async ({ page }) => {
    await login(page, 'alice@slawk.dev', 'password123');
    await clickChannel(page, 'general');
    await waitForChannelReady(page);

    // Click the channel name button in the header
    await page.getByTestId('channel-name-button').click();

    // Members panel should appear
    await expect(page.getByTestId('members-panel')).toBeVisible({ timeout: 5000 });
  });
});
