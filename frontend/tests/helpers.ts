import { type Page, expect } from '@playwright/test';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

/** Default test user */
export const TEST_USER = {
  email: 'test@example.com',
  name: 'Test User',
};

/**
 * Login via the test-only endpoint (bypasses Google OAuth).
 * Sets the JWT in localStorage and navigates to the app.
 */
export async function login(
  page: Page,
  email = TEST_USER.email,
) {
  const response = await page.request.post(`${BASE_URL}/auth/test-login`, {
    data: { email },
  });
  const { token } = await response.json();

  await page.goto('/');
  await page.evaluate((t) => localStorage.setItem('token', t), token);
  await page.goto('/');

  // Wait for the main app layout to appear (sidebar with channels)
  await expect(page.getByTestId('sidebar')).toBeVisible({ timeout: 20_000 });
}

/**
 * Register a new user via the test-only endpoint and navigate to the app.
 */
export async function register(
  page: Page,
  name: string,
  email: string,
) {
  const response = await page.request.post(`${BASE_URL}/auth/test-login`, {
    data: { email, name },
  });
  const { token } = await response.json();

  await page.goto('/');
  await page.evaluate((t) => localStorage.setItem('token', t), token);
  await page.goto('/');

  // Wait for the main app layout to appear
  await expect(page.getByTestId('sidebar')).toBeVisible({ timeout: 10_000 });
}

/**
 * Generate a unique email address for test isolation.
 */
export function uniqueEmail() {
  return `testuser-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
}

/**
 * Type a message into the Quill editor and send it.
 * Quill uses a contenteditable div — we type character by character
 * so Quill's internal text-change events fire properly.
 */
export async function sendMessage(page: Page, text: string) {
  const editor = page.locator('.ql-editor');
  await editor.click();
  await page.keyboard.type(text, { delay: 10 });
  // Press Enter to send (Quill binding)
  await page.keyboard.press('Enter');
}

/**
 * Wait for a message with the given text to appear in the message list.
 * Targets the message row container (group relative flex px-5).
 * Uses a 25s timeout to account for WebSocket join latency and message delivery.
 */
export async function waitForMessage(page: Page, text: string) {
  await expect(
    page.locator('.group.relative.flex.px-5').filter({ hasText: text })
  ).toBeVisible({ timeout: 25_000 });
}

/**
 * Wait for the WebSocket channel join to settle after navigation.
 * The socket join:channel event requires a server-side DB lookup before
 * the channel room is ready to receive message broadcasts. This ensures
 * message:send is not emitted before the server has processed join:channel.
 */
export async function waitForChannelReady(page: Page) {
  // Wait for the editor to be interactive
  await expect(page.locator('.ql-editor')).toBeVisible({ timeout: 10_000 });
  // Wait for the WebSocket to be connected and confirm the channel join via ack
  await page.evaluate(() => {
    return new Promise<void>((resolve) => {
      const timeout = setTimeout(resolve, 5000);
      const check = () => {
        const socket = (window as any).__socket;
        if (!socket?.connected) {
          setTimeout(check, 100);
          return;
        }
        // Get all channel IDs this user is a member of from the sidebar buttons
        // by reading data attributes, or re-join current channels
        const url = window.location.href;
        const match = url.match(/\/c\/(\d+)/);
        if (match) {
          const channelId = parseInt(match[1]);
          socket.emit('join:channel', channelId, () => {
            clearTimeout(timeout);
            resolve();
          });
        } else {
          clearTimeout(timeout);
          resolve();
        }
      };
      check();
    });
  });
}

/**
 * Click a channel by name in the sidebar.
 * Scopes to the sidebar and matches the channel name span to avoid strict mode
 * violations when channel names also appear in the channel header or messages.
 */
export async function clickChannel(page: Page, channelName: string) {
  const sidebar = page.getByTestId('sidebar');
  await sidebar
    .locator('button')
    .filter({ has: page.locator('span.truncate', { hasText: channelName }) })
    .first()
    .click();
}

/**
 * Assert a channel is visible in the sidebar by name.
 */
export async function expectChannelInSidebar(page: Page, channelName: string) {
  await expect(
    page.getByTestId('sidebar')
      .locator('button')
      .filter({ has: page.locator('span.truncate', { hasText: channelName }) })
      .first()
  ).toBeVisible({ timeout: 10_000 });
}
