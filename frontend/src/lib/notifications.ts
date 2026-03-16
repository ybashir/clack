/**
 * Desktop notification support.
 * Uses Web Notification API (works in both Electron and browser with permission).
 * Falls back to Electron IPC native notifications if available.
 */

const isElectron = typeof window !== 'undefined' && (window as any).electronAPI?.isElectron;

let permissionGranted = false;

/** Request notification permission on app init */
export function initNotifications() {
  if (!('Notification' in window)) {
    console.log('[notifications] Notification API not available');
    return;
  }

  if (Notification.permission === 'granted') {
    permissionGranted = true;
    console.log('[notifications] Permission already granted');
  } else if (Notification.permission !== 'denied') {
    console.log('[notifications] Requesting permission...');
    Notification.requestPermission().then((p) => {
      permissionGranted = p === 'granted';
      console.log('[notifications] Permission result:', p);
    });
  } else {
    console.log('[notifications] Permission denied');
  }
}

interface NotifyOptions {
  title: string;
  body: string;
  /** Route to navigate to when clicked, e.g. '/c/42' or '/d/123' */
  route?: string;
}

/** Show a native desktop notification */
export function showNotification({ title, body, route }: NotifyOptions) {
  const truncatedBody = body.length > 100 ? body.slice(0, 100) + '...' : body;

  console.log('[notifications] showNotification called:', { title, body: truncatedBody, focused: document.hasFocus(), permissionGranted, isElectron });

  // Don't notify if window is focused
  if (document.hasFocus()) return;

  // Try Electron IPC native notification first
  if (isElectron && (window as any).electronAPI?.showNotification) {
    console.log('[notifications] Using Electron IPC notification');
    (window as any).electronAPI.showNotification(title, truncatedBody, route);
  }

  // Also try Web Notification API
  if (permissionGranted) {
    console.log('[notifications] Using Web Notification API');
    try {
      const notif = new Notification(title, { body: truncatedBody });
      notif.onclick = () => {
        window.focus();
        if (isElectron) (window as any).electronAPI?.focusWindow?.();
        if (route) {
          window.history.pushState(null, '', route);
          window.dispatchEvent(new PopStateEvent('popstate'));
        }
      };
    } catch (err) {
      console.log('[notifications] Web Notification failed:', err);
    }
  }
}

/** Update the dock badge count */
export function setBadgeCount(count: number) {
  if (!isElectron) return;
  (window as any).electronAPI?.setBadgeCount?.(count);
}

/** Strip markup for notification body */
export function plainText(content: string): string {
  return content
    .replace(/<@\d+>/g, '@someone')
    .replace(/[*_~`]/g, '')
    .replace(/<[^>]+>/g, '')
    .trim();
}
