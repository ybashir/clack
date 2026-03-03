import { useRef, useEffect, useCallback, useState } from 'react';
import Quill from 'quill';
import 'quill/dist/quill.snow.css';
import {
  Plus,
  AtSign,
  Smile,
  SendHorizontal,
  X,
  FileIcon,
  ChevronDown,
  CheckCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { useMessageStore } from '@/stores/useMessageStore';
import { EmojiPicker } from '@/components/ui/emoji-picker';
import { uploadFile, getUsers, scheduleMessage, type ApiFile, type AuthUser } from '@/lib/api';
import { LinkModal } from './LinkModal';
import { ScheduleModal } from './ScheduleModal';
import { ScheduleMenu } from './ScheduleMenu';
import { FormatToolbar } from './FormatToolbar';

interface MessageInputProps {
  channelId: number;
  channelName: string;
}

export function MessageInput({ channelId, channelName }: MessageInputProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const quillRef = useRef<Quill | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [canSend, setCanSend] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<ApiFile[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [showMentionDropdown, setShowMentionDropdown] = useState(false);
  const [mentionUsers, setMentionUsers] = useState<AuthUser[]>([]);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionStartIndex, setMentionStartIndex] = useState<number | null>(null);
  const [mentionSelectedIndex, setMentionSelectedIndex] = useState(0);
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const [linkText, setLinkText] = useState('');
  const linkSavedRangeRef = useRef<{ index: number; length: number } | null>(null);
  const mentionDropdownRef = useRef<HTMLDivElement>(null);
  const emojiButtonRef = useRef<HTMLButtonElement>(null);

  // Schedule message state
  const [showScheduleMenu, setShowScheduleMenu] = useState(false);
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [scheduleConfirm, setScheduleConfirm] = useState<string | null>(null);
  const [isScheduling, setIsScheduling] = useState(false);
  const scheduleMenuRef = useRef<HTMLDivElement>(null);

  const { sendMessage, sendError, clearSendError } = useMessageStore();

  const serializeDelta = useCallback((quill: Quill): string => {
    const delta = quill.getContents();
    let result = '';
    let inCodeBlock = false;
    let codeBlockLines: string[] = [];

    const flushCodeBlock = () => {
      result += '```\n' + codeBlockLines.join('\n') + '\n```';
      codeBlockLines = [];
      inCodeBlock = false;
    };

    for (const op of delta.ops) {
      if (typeof op.insert !== 'string') continue;
      const attrs = op.attributes || {};
      const text = op.insert;

      if (attrs['code-block']) {
        // Quill emits code-block lines ending with '\n'
        const lines = text.split('\n');
        if (!inCodeBlock) inCodeBlock = true;
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          // Last segment after final '\n' may be empty — signals end of block
          if (i === lines.length - 1 && line === '') {
            flushCodeBlock();
          } else {
            codeBlockLines.push(line);
          }
        }
      } else {
        if (inCodeBlock) flushCodeBlock();
        if (attrs['blockquote']) {
          // Prefix each line with '> '
          const lines = text.split('\n');
          for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (i < lines.length - 1) {
              result += '> ' + line + '\n';
            } else if (line !== '') {
              result += '> ' + line;
            }
          }
        } else if (attrs['code']) {
          // Inline code: wrap in backticks
          result += '`' + text + '`';
        } else {
          result += text;
        }
      }
    }

    if (inCodeBlock) flushCodeBlock();

    return result.trim();
  }, []);

  const handleSend = useCallback(async () => {
    const quill = quillRef.current;
    if (!quill) return;
    const text = serializeDelta(quill);
    if (!text && pendingFiles.length === 0) return;
    const content = text || ' ';
    const fileIds = pendingFiles.map((f) => f.id);
    quill.setText('');
    setPendingFiles([]);
    setCanSend(false);
    await sendMessage(channelId, content, fileIds.length > 0 ? fileIds : undefined);
  }, [channelId, sendMessage, pendingFiles, serializeDelta]);

  const handleSchedule = useCallback(
    async (scheduledAt: Date) => {
      const quill = quillRef.current;
      if (!quill) return;
      const text = serializeDelta(quill);
      if (!text) return;

      setIsScheduling(true);
      try {
        await scheduleMessage(channelId, text, scheduledAt);
        quill.setText('');
        setPendingFiles([]);
        setCanSend(false);
        setShowScheduleMenu(false);
        setShowScheduleModal(false);

        // Show confirmation briefly
        const formatted = scheduledAt.toLocaleString(undefined, {
          month: 'short',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
        });
        setScheduleConfirm(`Scheduled for ${formatted}`);
        setTimeout(() => setScheduleConfirm(null), 4000);
      } catch (err) {
        console.error('Failed to schedule message:', err);
      } finally {
        setIsScheduling(false);
      }
    },
    [channelId, serializeDelta],
  );

  // Close schedule menu on outside click
  useEffect(() => {
    if (!showScheduleMenu) return;
    const handleClick = (e: MouseEvent) => {
      if (scheduleMenuRef.current && !scheduleMenuRef.current.contains(e.target as Node)) {
        setShowScheduleMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showScheduleMenu]);

  const handleSendRef = useRef(handleSend);
  handleSendRef.current = handleSend;
  const mentionActiveRef = useRef(false);
  mentionActiveRef.current = showMentionDropdown;

  useEffect(() => {
    if (!editorRef.current || quillRef.current) return;

    const quill = new Quill(editorRef.current, {
      theme: 'snow',
      modules: {
        toolbar: false,
        keyboard: {
          bindings: {
            enter: {
              key: 'Enter',
              handler: () => {
                // Don't send if mention dropdown is open
                if (mentionActiveRef.current) return true;
                handleSendRef.current();
                return false;
              },
            },
            escape: {
              key: 'Escape',
              handler: () => {
                if (mentionActiveRef.current) {
                  setShowMentionDropdown(false);
                  return false;
                }
                return true;
              },
            },
          },
        },
      },
      placeholder: `Message #${channelName}`,
    });

    quill.on('text-change', () => {
      setCanSend(quill.getText().trim().length > 0);
      // Detect @mention trigger
      const selection = quill.getSelection();
      if (!selection) return;
      const cursorPos = selection.index;
      const text = quill.getText(0, cursorPos);
      const atIndex = text.lastIndexOf('@');
      if (atIndex >= 0) {
        const beforeAt = atIndex > 0 ? text[atIndex - 1] : ' ';
        const query = text.slice(atIndex + 1);
        // Only trigger if @ is at start or preceded by whitespace, and query has no spaces
        if ((atIndex === 0 || /\s/.test(beforeAt)) && !/\s/.test(query)) {
          setMentionStartIndex(atIndex);
          setMentionQuery(query);
          setShowMentionDropdown(true);
          setMentionSelectedIndex(0);
          return;
        }
      }
      setShowMentionDropdown(false);
    });

    quillRef.current = quill;
  }, [channelName]);

  useEffect(() => {
    if (quillRef.current) {
      quillRef.current.root.dataset.placeholder = `Message #${channelName}`;
    }
  }, [channelName]);

  const handleEmojiSelect = useCallback((emoji: { native: string }) => {
    const quill = quillRef.current;
    if (!quill) return;
    const range = quill.getSelection(true);
    quill.insertText(range.index, emoji.native);
    quill.setSelection(range.index + emoji.native.length);
    setShowEmojiPicker(false);
    quill.focus();
  }, []);

  // Fetch users for mention autocomplete
  useEffect(() => {
    if (!showMentionDropdown) {
      setMentionUsers([]);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const users = await getUsers(mentionQuery || undefined);
        if (!cancelled) setMentionUsers(users);
      } catch {
        // ignore
      }
    }, 150);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [showMentionDropdown, mentionQuery]);

  const insertMention = useCallback(
    (user: AuthUser) => {
      const quill = quillRef.current;
      if (!quill || mentionStartIndex === null) return;
      const mentionText = `@${user.name}`;
      // Delete the @query text and insert mention
      const deleteLength = mentionQuery.length + 1; // +1 for @
      quill.deleteText(mentionStartIndex, deleteLength);
      quill.insertText(mentionStartIndex, mentionText + ' ');
      quill.setSelection(mentionStartIndex + mentionText.length + 1);
      setShowMentionDropdown(false);
      setMentionQuery('');
      setMentionStartIndex(null);
      quill.focus();
    },
    [mentionStartIndex, mentionQuery],
  );

  const handleMentionButtonClick = () => {
    const quill = quillRef.current;
    if (!quill) return;
    const range = quill.getSelection(true);
    quill.insertText(range.index, '@');
    quill.setSelection(range.index + 1);
    quill.focus();
  };

  const handleLinkSave = useCallback(() => {
    const quill = quillRef.current;
    const range = linkSavedRangeRef.current;
    if (!quill || !linkUrl.trim()) {
      setShowLinkModal(false);
      return;
    }
    const url = linkUrl.trim().startsWith('http') ? linkUrl.trim() : `https://${linkUrl.trim()}`;
    if (range && range.length > 0) {
      // Apply link to existing selection
      quill.formatText(range.index, range.length, 'link', url);
    } else {
      // Insert new linked text at cursor
      const insertText = linkText.trim() || url;
      const insertAt = range ? range.index : quill.getLength() - 1;
      quill.insertText(insertAt, insertText, 'link', url);
      quill.setSelection(insertAt + insertText.length);
    }
    setShowLinkModal(false);
    setLinkUrl('');
    setLinkText('');
    linkSavedRangeRef.current = null;
    quill.focus();
  }, [linkUrl, linkText]);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsUploading(true);
    try {
      for (const file of Array.from(files)) {
        const uploaded = await uploadFile(file);
        setPendingFiles((prev) => [...prev, uploaded]);
      }
    } catch (err) {
      console.error('Failed to upload file:', err);
    } finally {
      setIsUploading(false);
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const removePendingFile = (fileId: number) => {
    setPendingFiles((prev) => prev.filter((f) => f.id !== fileId));
  };

  const applyFormat = (format: string, value?: string) => {
    const quill = quillRef.current;
    if (!quill) return;

    if (format === 'link') {
      const range = quill.getSelection();
      if (range) {
        const currentFormat = quill.getFormat(range);
        if (currentFormat.link) {
          quill.format('link', false);
        } else {
          // Save the selection range so we can apply the link after modal closes
          linkSavedRangeRef.current = { index: range.index, length: range.length };
          // Pre-fill display text from selected text
          const selectedText = range.length > 0 ? quill.getText(range.index, range.length) : '';
          setLinkText(selectedText);
          setLinkUrl('');
          setShowLinkModal(true);
        }
      }
      return;
    }

    if (value) {
      const range = quill.getSelection();
      if (range) {
        const currentFormat = quill.getFormat(range);
        quill.format(format, currentFormat[format] === value ? false : value);
      }
    } else {
      const range = quill.getSelection();
      if (range) {
        const currentFormat = quill.getFormat(range);
        quill.format(format, !currentFormat[format]);
      }
    }
    quill.focus();
  };

  const handleCustomSchedule = () => {
    setShowScheduleMenu(false);
    setShowScheduleModal(true);
  };

  const hasContent = canSend || pendingFiles.length > 0;

  return (
    <div className="relative px-5 pb-6 pt-4 bg-white">
      <div className="slawk-editor rounded-[8px] border border-slack-border-light">
        {/* Formatting Toolbar */}
        <FormatToolbar onApplyFormat={applyFormat} />

        {/* File preview area */}
        {pendingFiles.length > 0 && (
          <div
            data-testid="file-preview"
            className="flex flex-wrap gap-2 px-3 py-2 border-b border-slack-border-light"
          >
            {pendingFiles.map((file) => (
              <div
                key={file.id}
                className="relative flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm"
              >
                {file.mimetype.startsWith('image/') ? (
                  <img
                    src={file.url}
                    alt={file.originalName}
                    className="h-10 w-10 rounded object-cover"
                  />
                ) : (
                  <FileIcon className="h-5 w-5 text-gray-500" />
                )}
                <span className="max-w-[120px] truncate text-[13px] text-slack-primary">
                  {file.originalName}
                </span>
                <button
                  onClick={() => removePendingFile(file.id)}
                  className="ml-1 flex h-5 w-5 items-center justify-center rounded-full bg-gray-200 hover:bg-gray-300"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Upload progress indicator */}
        {isUploading && (
          <div className="px-3 py-1 text-xs text-gray-500">Uploading...</div>
        )}

        {/* Quill Editor */}
        <div ref={editorRef} />

        {/* Mention Dropdown */}
        {showMentionDropdown && mentionUsers.length > 0 && (
          <div
            data-testid="mention-dropdown"
            ref={mentionDropdownRef}
            className="absolute bottom-full left-0 mb-1 w-[280px] max-h-[200px] overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg z-50"
          >
            {mentionUsers.map((user, index) => (
              <button
                key={user.id}
                onClick={() => insertMention(user)}
                className={cn(
                  'flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-slack-link hover:text-white',
                  index === mentionSelectedIndex ? 'bg-slack-link text-white' : 'text-slack-primary',
                )}
              >
                <div className="flex h-6 w-6 items-center justify-center rounded bg-slack-purple text-white text-xs font-medium flex-shrink-0">
                  {user.name.charAt(0).toUpperCase()}
                </div>
                <span className="truncate font-medium">{user.name}</span>
              </button>
            ))}
          </div>
        )}

        {/* Emoji Picker */}
        {showEmojiPicker && (
          <div className="absolute bottom-full left-0 mb-2 z-50">
            <EmojiPicker
              onEmojiSelect={handleEmojiSelect}
              onClickOutside={() => setShowEmojiPicker(false)}
            />
          </div>
        )}

        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          accept="image/*,.pdf,.txt,.json,.zip"
          onChange={handleFileSelect}
        />

        {/* Bottom Toolbar */}
        <div className="flex items-center justify-between px-[6px] py-1">
          <div className="flex items-center">
            <Button
              data-testid="attach-file-button"
              variant="toolbar"
              size="icon-sm"
              onClick={() => fileInputRef.current?.click()}
              title="Attach file"
            >
              <Plus className="h-[18px] w-[18px]" />
            </Button>
            <Button
              ref={emojiButtonRef}
              variant="toolbar"
              size="icon-sm"
              onClick={() => setShowEmojiPicker(!showEmojiPicker)}
            >
              <Smile className="h-[18px] w-[18px]" />
            </Button>
            <Button
              data-testid="mention-button"
              variant="toolbar"
              size="icon-sm"
              onClick={handleMentionButtonClick}
            >
              <AtSign className="h-[18px] w-[18px]" />
            </Button>
          </div>

          {/* Send button group with schedule dropdown */}
          <div className="flex items-center relative" ref={scheduleMenuRef}>
            <button
              data-testid="send-button"
              onClick={handleSend}
              disabled={!hasContent}
              className={cn(
                'flex h-7 items-center justify-center rounded-l px-2 transition-colors',
                hasContent
                  ? 'bg-slack-btn text-white hover:bg-slack-btn-hover'
                  : 'text-gray-400',
              )}
            >
              <SendHorizontal className="h-4 w-4" />
            </button>
            {/* Schedule dropdown arrow */}
            <button
              data-testid="schedule-button"
              onClick={() => hasContent && setShowScheduleMenu((v) => !v)}
              disabled={!hasContent}
              className={cn(
                'flex h-7 w-5 items-center justify-center rounded-r border-l transition-colors',
                hasContent
                  ? 'bg-slack-btn text-white hover:bg-slack-btn-hover border-slack-btn-hover'
                  : 'text-gray-300 border-gray-300',
              )}
              title="Schedule message"
            >
              <ChevronDown className="h-3 w-3" />
            </button>

            {/* Schedule dropdown menu */}
            {showScheduleMenu && (
              <ScheduleMenu
                onSchedule={handleSchedule}
                onCustom={handleCustomSchedule}
                isScheduling={isScheduling}
              />
            )}
          </div>
        </div>
      </div>

      <p className="mt-1 text-xs text-gray-500">
        <kbd className="rounded bg-gray-100 px-1 py-0.5 text-[10px] font-medium">Enter</kbd>{' '}
        to send,{' '}
        <kbd className="rounded bg-gray-100 px-1 py-0.5 text-[10px] font-medium">
          Shift + Enter
        </kbd>{' '}
        for new line
      </p>

      {/* Send error banner */}
      {sendError && (
        <div className="mt-2 flex items-center justify-between rounded-md bg-red-50 border border-red-200 px-3 py-2 text-[13px] text-red-700">
          <span>{sendError}</span>
          <button onClick={clearSendError} className="ml-2 text-red-500 hover:text-red-700">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Schedule confirmation banner */}
      {scheduleConfirm && (
        <div
          data-testid="schedule-confirm"
          className="mt-2 flex items-center gap-2 rounded-md bg-slack-success px-3 py-2 text-[13px] text-slack-btn font-medium"
        >
          <CheckCircle className="h-4 w-4 flex-shrink-0" />
          {scheduleConfirm}
        </div>
      )}

      {/* Custom schedule modal */}
      {showScheduleModal && (
        <ScheduleModal
          onSchedule={handleSchedule}
          onClose={() => setShowScheduleModal(false)}
          isScheduling={isScheduling}
        />
      )}

      {/* Link Modal */}
      {showLinkModal && (
        <LinkModal
          linkUrl={linkUrl}
          linkText={linkText}
          onLinkUrlChange={setLinkUrl}
          onLinkTextChange={setLinkText}
          onSave={handleLinkSave}
          onClose={() => setShowLinkModal(false)}
        />
      )}
    </div>
  );
}
