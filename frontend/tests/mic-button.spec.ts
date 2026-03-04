import { test, expect } from '@playwright/test';
import { register, uniqueEmail, clickChannel } from './helpers';

test.describe('Microphone button in composer', () => {
  test('main composer shows a microphone button', async ({ page }) => {
    const email = uniqueEmail();
    await register(page, 'MicUser', email, 'password123');

    await clickChannel(page, 'general');
    await page.waitForTimeout(500);

    const micBtn = page.getByTestId('mic-button');
    await expect(micBtn).toBeVisible({ timeout: 5000 });
  });

  test('thread composer shows a microphone button', async ({ page }) => {
    const email = uniqueEmail();
    await register(page, 'MicThread', email, 'password123');

    await clickChannel(page, 'general');
    await page.waitForTimeout(500);

    // Find a message and open its thread
    const messageRow = page.locator('.group.relative.flex.px-5').first();
    await expect(messageRow).toBeVisible({ timeout: 10000 });
    await messageRow.hover();
    const replyButton = messageRow.locator('button').filter({ has: page.locator('.lucide-message-square') });
    await replyButton.click();

    const threadPanel = page.getByTestId('thread-panel');
    await expect(threadPanel).toBeVisible({ timeout: 5000 });

    const threadMicBtn = page.getByTestId('thread-mic-button');
    await expect(threadMicBtn).toBeVisible({ timeout: 5000 });
  });
});
