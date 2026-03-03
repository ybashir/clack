import { useState, useEffect, useCallback } from 'react';
import { X, Pin } from 'lucide-react';
import { format } from 'date-fns';
import { getPinnedMessages, type ApiMessage } from '@/lib/api';
import { getSocket } from '@/lib/socket';
import { Avatar } from '@/components/ui/avatar';
import { renderMessageContent } from '@/lib/renderMessageContent';
import { Button } from '@/components/ui/button';

interface PinsPanelProps {
  channelId: number;
  onClose: () => void;
}

export function PinsPanel({ channelId, onClose }: PinsPanelProps) {
  const [pins, setPins] = useState<ApiMessage[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchPins = useCallback(() => {
    setIsLoading(true);
    getPinnedMessages(channelId)
      .then((data) => setPins(data))
      .catch((err) => console.error('Failed to fetch pins:', err))
      .finally(() => setIsLoading(false));
  }, [channelId]);

  useEffect(() => {
    fetchPins();
  }, [fetchPins]);

  // Listen for message:updated events — refresh pins when a message in this
  // channel is pinned or unpinned so the panel stays current without a reload.
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    const handleMessageUpdated = (msg: ApiMessage) => {
      if (msg.channelId !== channelId) return;
      // Re-fetch the canonical pin list from the server
      getPinnedMessages(channelId)
        .then((data) => setPins(data))
        .catch((err) => console.error('Failed to refresh pins:', err));
    };

    socket.on('message:updated', handleMessageUpdated);
    return () => {
      socket.off('message:updated', handleMessageUpdated);
    };
  }, [channelId]);

  return (
    <div data-testid="pins-panel" className="flex w-[300px] flex-col border-l border-slack-border bg-white">
      <div className="flex h-[49px] items-center justify-between border-b border-slack-border px-4">
        <div className="flex items-center gap-1.5">
          <Pin className="h-4 w-4 text-slack-secondary" />
          <span className="text-[15px] font-bold text-slack-primary">Pinned messages</span>
        </div>
        <Button variant="toolbar" size="icon-sm" onClick={onClose}>
          <X className="h-4 w-4 text-slack-secondary" />
        </Button>
      </div>
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="p-4 text-center text-sm text-gray-500">Loading...</div>
        ) : pins.length === 0 ? (
          <div className="p-4 text-center text-sm text-gray-500">No pinned messages yet</div>
        ) : (
          pins.map((pin) => (
            <div key={pin.id} className="border-b border-gray-100 px-4 py-3">
              <div className="flex items-center gap-2">
                <Avatar
                  src={pin.user.avatar}
                  alt={pin.user.name}
                  fallback={pin.user.name}
                  size="sm"
                />
                <span className="text-[13px] font-bold text-slack-primary">{pin.user.name}</span>
                <span className="text-[11px] text-slack-secondary">
                  {format(new Date(pin.createdAt), 'MMM d, h:mm a')}
                </span>
              </div>
              <p className="mt-1 text-[14px] text-slack-primary leading-[20px]">{renderMessageContent(pin.content)}</p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
