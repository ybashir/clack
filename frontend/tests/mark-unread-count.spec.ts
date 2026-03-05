import { test, expect } from '@playwright/test';
import { register, uniqueEmail, sendMessage, waitForMessage, clickChannel, waitForChannelReady } from './helpers';

test.describe('Mark as unread count', () => {
  test('marking a message as unread shows correct count including subsequent messages', async ({ page }) => {
    const email = uniqueEmail();
    await register(page, 'Unread Tester', email, 'password123');
    await clickChannel(page, 'general');
    await waitForChannelReady(page);

    // Send 4 messages so we can mark the 2nd one as unread (expecting count = 3)
    const prefix = `unread-${Date.now()}`;
    const msgs = [`${prefix}-msg1`, `${prefix}-msg2`, `${prefix}-msg3`, `${prefix}-msg4`];
    for (const msg of msgs) {
      await sendMessage(page, msg);
      await waitForMessage(page, msg);
    }

    // Mark msg2 as unread — that means msg2 + msg3 + msg4 = 3 unread
    const msg2El = page.locator('.group.relative.flex.px-5').filter({ hasText: msgs[1] });
    await msg2El.hover();

    // Click "more" button in hover toolbar
    const hoverToolbar = page.locator('.absolute.-top-4.right-5');
    await hoverToolbar.locator('button').last().click();

    // Click "Mark as unread"
    await page.getByText('Mark as unread').click();

    // Navigate to a different channel to see the badge
    await clickChannel(page, 'random');
    await page.waitForTimeout(500);

    // The sidebar badge for #general should show 3 (not 1)
    const sidebar = page.getByTestId('sidebar');
    const generalBtn = sidebar
      .locator('button')
      .filter({ has: page.locator('span.truncate', { hasText: 'general' }) })
      .first();
    const badge = generalBtn.locator('span').filter({ hasText: /^\d+$/ }).last();
    await expect(badge).toHaveText('3', { timeout: 5_000 });
  });
});
