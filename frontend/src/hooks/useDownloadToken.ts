import { useSyncExternalStore } from 'react';
import { onDownloadTokenChange, getDownloadTokenVersion } from '@/lib/api';

/**
 * React hook that re-renders when the download token changes.
 * Use this in components that render <img> or <a> tags with file download URLs.
 */
export function useDownloadToken(): number {
  return useSyncExternalStore(onDownloadTokenChange, getDownloadTokenVersion);
}
