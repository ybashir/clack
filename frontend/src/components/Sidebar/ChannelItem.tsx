import { Hash, Lock } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Channel } from '@/lib/types';

interface ChannelItemProps {
  channel: Channel;
  isActive: boolean;
  isPrivate?: boolean;
  onClick: () => void;
}

export function ChannelItem({
  channel,
  isActive,
  isPrivate,
  onClick,
}: ChannelItemProps) {
  const Icon = isPrivate ? Lock : Hash;
  const hasUnread = channel.unreadCount > 0;

  return (
    <button
      onClick={onClick}
      data-active={isActive}
      className={cn(
        'flex w-full items-center gap-2 h-[28px] text-[15px] transition-all rounded-[6px] text-left',
        'mx-2 w-[calc(100%-16px)] px-4',
        isActive
          ? 'bg-white text-slack-primary font-bold'
          : hasUnread
            ? 'text-white font-bold hover:bg-white/10'
            : 'text-white/70 font-normal hover:bg-white/10'
      )}
    >
      <Icon className="w-4 h-4 flex-shrink-0" />
      <span className="truncate">{channel.name}</span>
      {hasUnread && (
        <span className={cn(
          'text-[12px] ml-1 min-w-[20px] h-5 flex items-center justify-center rounded-full px-1.5',
          isActive ? 'bg-slack-primary text-white' : 'bg-slack-badge text-white'
        )}>
          {channel.unreadCount}
        </span>
      )}
    </button>
  );
}
