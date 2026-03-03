import { forwardRef } from 'react';
import { cn } from '@/lib/utils';
import type { AuthUser } from '@/lib/api';

interface MentionDropdownProps {
  users: AuthUser[];
  selectedIndex: number;
  onSelect: (user: AuthUser) => void;
}

export const MentionDropdown = forwardRef<HTMLDivElement, MentionDropdownProps>(
  function MentionDropdown({ users, selectedIndex, onSelect }, ref) {
    if (users.length === 0) return null;

    return (
      <div
        data-testid="mention-dropdown"
        ref={ref}
        className="absolute bottom-full left-0 mb-1 w-[280px] max-h-[200px] overflow-y-auto rounded-lg border border-slack-border bg-white shadow-lg z-50"
      >
        {users.map((user, index) => (
          <button
            key={user.id}
            onClick={() => onSelect(user)}
            className={cn(
              'flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-slack-link hover:text-white',
              index === selectedIndex ? 'bg-slack-link text-white' : 'text-slack-primary',
            )}
          >
            <div className="flex h-6 w-6 items-center justify-center rounded bg-slack-purple text-white text-xs font-medium flex-shrink-0">
              {user.name.charAt(0).toUpperCase()}
            </div>
            <span className="truncate font-medium">{user.name}</span>
          </button>
        ))}
      </div>
    );
  },
);
