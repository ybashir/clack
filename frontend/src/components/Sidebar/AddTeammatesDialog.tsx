import { useState, useEffect } from 'react';
import { useChannelActions } from '@/hooks/useChannelActions';
import { Button } from '@/components/ui/button';
import type { AuthUser } from '@/lib/api';

interface AddTeammatesDialogProps {
  open: boolean;
  onClose: () => void;
  onSelectUser: (user: AuthUser) => void;
}

export function AddTeammatesDialog({
  open,
  onClose,
  onSelectUser,
}: AddTeammatesDialogProps) {
  const [teammateSearch, setTeammateSearch] = useState('');
  const { teammates, searchTeammates } = useChannelActions();

  // Load all teammates when dialog opens
  useEffect(() => {
    if (open) {
      setTeammateSearch('');
      searchTeammates('');
    }
  }, [open, searchTeammates]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-[480px] rounded-lg bg-white p-6 shadow-xl">
        <h2 className="text-[22px] font-bold text-slack-primary mb-2">Direct message</h2>
        <p className="text-[14px] text-gray-500 mb-4">Find or start a conversation</p>
        <input
          data-testid="teammate-search"
          type="text"
          value={teammateSearch}
          onChange={(e) => {
            setTeammateSearch(e.target.value);
            searchTeammates(e.target.value);
          }}
          placeholder="Search by name..."
          autoFocus
          className="w-full rounded border border-gray-300 px-3 py-2 text-[15px] text-slack-primary outline-none focus:border-slack-link focus:ring-1 focus:ring-slack-link mb-3"
        />
        {teammates.length === 0 ? (
          <p className="text-center text-gray-500 py-4">No other users found</p>
        ) : (
          <div className="max-h-[300px] overflow-y-auto space-y-1">
            {teammates.map((u) => (
              <button
                key={u.id}
                onClick={() => onSelectUser(u)}
                className="flex w-full items-center gap-3 rounded px-3 py-2 hover:bg-gray-50 text-left"
              >
                <div className="flex h-8 w-8 items-center justify-center rounded bg-slack-purple text-white text-sm font-medium">
                  {u.name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <p className="text-[14px] font-medium text-slack-primary">{u.name}</p>
                </div>
              </button>
            ))}
          </div>
        )}
        <div className="mt-4 flex justify-end">
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}
