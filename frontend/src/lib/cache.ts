/**
 * Cache abstraction layer.
 * In Electron: reads/writes via IPC to SQLite in the main process.
 * In browser: no-op (returns null).
 */

declare global {
  interface Window {
    electronAPI?: {
      isElectron: boolean;
      cache: {
        getChannels: () => Promise<any[] | null>;
        setChannels: (channels: any[]) => Promise<void>;
        getMessages: (channelId: number) => Promise<any[] | null>;
        setMessages: (channelId: number, messages: any[]) => Promise<void>;
        addMessage: (channelId: number, message: any) => Promise<void>;
        getDmConversations: () => Promise<any[] | null>;
        setDmConversations: (conversations: any[]) => Promise<void>;
        getDmMessages: (key: string) => Promise<any[] | null>;
        setDmMessages: (key: string, messages: any[]) => Promise<void>;
        clear: () => Promise<void>;
      };
    };
  }
}

const isElectron = !!window.electronAPI?.isElectron;

export async function getCachedChannels(): Promise<any[] | null> {
  if (!isElectron) return null;
  try {
    return await window.electronAPI!.cache.getChannels();
  } catch {
    return null;
  }
}

export async function cacheChannels(channels: any[]): Promise<void> {
  if (!isElectron) return;
  try {
    await window.electronAPI!.cache.setChannels(channels);
  } catch { /* ignore */ }
}

export async function getCachedMessages(channelId: number): Promise<any[] | null> {
  if (!isElectron) return null;
  try {
    const msgs = await window.electronAPI!.cache.getMessages(channelId);
    return msgs && msgs.length > 0 ? msgs : null;
  } catch {
    return null;
  }
}

export async function cacheMessages(channelId: number, messages: any[]): Promise<void> {
  if (!isElectron) return;
  try {
    await window.electronAPI!.cache.setMessages(channelId, messages);
  } catch { /* ignore */ }
}

export async function cacheNewMessage(channelId: number, message: any): Promise<void> {
  if (!isElectron) return;
  try {
    await window.electronAPI!.cache.addMessage(channelId, message);
  } catch { /* ignore */ }
}

export async function getCachedDmConversations(): Promise<any[] | null> {
  if (!isElectron) return null;
  try {
    return await window.electronAPI!.cache.getDmConversations();
  } catch {
    return null;
  }
}

export async function cacheDmConversations(conversations: any[]): Promise<void> {
  if (!isElectron) return;
  try {
    await window.electronAPI!.cache.setDmConversations(conversations);
  } catch { /* ignore */ }
}

export async function getCachedDmMessages(conversationKey: string): Promise<any[] | null> {
  if (!isElectron) return null;
  try {
    const msgs = await window.electronAPI!.cache.getDmMessages(conversationKey);
    return msgs && msgs.length > 0 ? msgs : null;
  } catch {
    return null;
  }
}

export async function cacheDmMessages(conversationKey: string, messages: any[]): Promise<void> {
  if (!isElectron) return;
  try {
    await window.electronAPI!.cache.setDmMessages(conversationKey, messages);
  } catch { /* ignore */ }
}

export async function clearCache(): Promise<void> {
  if (!isElectron) return;
  try {
    await window.electronAPI!.cache.clear();
  } catch { /* ignore */ }
}
