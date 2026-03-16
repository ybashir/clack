import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  cache: {
    getChannels: () => ipcRenderer.invoke('cache:get-channels'),
    setChannels: (channels: any[]) => ipcRenderer.invoke('cache:set-channels', channels),
    getMessages: (channelId: number) => ipcRenderer.invoke('cache:get-messages', channelId),
    setMessages: (channelId: number, messages: any[]) => ipcRenderer.invoke('cache:set-messages', channelId, messages),
    addMessage: (channelId: number, message: any) => ipcRenderer.invoke('cache:add-message', channelId, message),
    getDmConversations: () => ipcRenderer.invoke('cache:get-dm-conversations'),
    setDmConversations: (conversations: any[]) => ipcRenderer.invoke('cache:set-dm-conversations', conversations),
    getDmMessages: (key: string) => ipcRenderer.invoke('cache:get-dm-messages', key),
    setDmMessages: (key: string, messages: any[]) => ipcRenderer.invoke('cache:set-dm-messages', key, messages),
    clear: () => ipcRenderer.invoke('cache:clear'),
  },
  setBadgeCount: (count: number) => ipcRenderer.invoke('app:set-badge-count', count),
  focusWindow: () => ipcRenderer.invoke('app:focus-window'),
  showNotification: (title: string, body: string, route?: string) => ipcRenderer.invoke('app:show-notification', title, body, route),
});
