import { useState, useEffect, useCallback } from 'react';
import { X, FileText, FileImage, FileArchive, Download } from 'lucide-react';
import { format } from 'date-fns';
import { getChannelFiles, getUserFiles, type ApiFileWithUser } from '@/lib/api';

interface FilesPanelProps {
  channelId?: number;
  onClose: () => void;
  title?: string;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function FileIcon({ mimetype }: { mimetype: string }) {
  if (mimetype.startsWith('image/')) return <FileImage className="h-5 w-5 text-blue-500" />;
  if (mimetype === 'application/pdf') return <FileText className="h-5 w-5 text-red-500" />;
  if (mimetype.includes('zip')) return <FileArchive className="h-5 w-5 text-yellow-600" />;
  return <FileText className="h-5 w-5 text-gray-500" />;
}

export function FilesPanel({ channelId, onClose, title }: FilesPanelProps) {
  const [files, setFiles] = useState<ApiFileWithUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchFiles = useCallback(() => {
    setIsLoading(true);
    const fetchFn = channelId ? getChannelFiles(channelId) : getUserFiles();
    fetchFn
      .then((data) => setFiles(data))
      .catch((err) => console.error('Failed to fetch files:', err))
      .finally(() => setIsLoading(false));
  }, [channelId]);

  useEffect(() => {
    fetchFiles();
  }, [fetchFiles]);

  const panelTitle = title ?? (channelId ? 'Channel files' : 'All files');

  return (
    <div data-testid="files-panel" className="flex w-[300px] flex-col border-l border-[#E0E0E0] bg-white">
      <div className="flex h-[49px] items-center justify-between border-b border-[#E0E0E0] px-4">
        <div className="flex items-center gap-1.5">
          <FileText className="h-4 w-4 text-[#616061]" />
          <span className="text-[15px] font-bold text-[#1D1C1D]">{panelTitle}</span>
        </div>
        <button
          onClick={onClose}
          className="flex h-7 w-7 items-center justify-center rounded hover:bg-[#F8F8F8]"
        >
          <X className="h-4 w-4 text-[#616061]" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="p-4 text-center text-sm text-gray-500">Loading...</div>
        ) : files.length === 0 ? (
          <div className="p-4 text-center text-sm text-gray-500">No files uploaded yet</div>
        ) : (
          files.map((file) => (
            <div key={file.id} className="border-b border-gray-100 px-4 py-3">
              {file.mimetype.startsWith('image/') ? (
                <a href={file.url} target="_blank" rel="noopener noreferrer" className="block mb-2">
                  <img
                    src={file.url}
                    alt={file.originalName}
                    className="w-full max-h-[140px] rounded object-cover"
                  />
                </a>
              ) : null}
              <div className="flex items-start gap-2">
                <div className="mt-0.5 flex-shrink-0">
                  <FileIcon mimetype={file.mimetype} />
                </div>
                <div className="flex-1 min-w-0">
                  <a
                    href={file.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block text-[13px] font-medium text-[#1264A3] hover:underline truncate"
                  >
                    {file.originalName}
                  </a>
                  <p className="text-[11px] text-[#616061]">
                    {formatBytes(file.size)} &middot; {file.user.name} &middot;{' '}
                    {format(new Date(file.createdAt), 'MMM d, yyyy')}
                  </p>
                </div>
                <a
                  href={file.url}
                  download={file.originalName}
                  className="flex-shrink-0 flex h-6 w-6 items-center justify-center rounded hover:bg-[#F8F8F8]"
                  title="Download"
                >
                  <Download className="h-3.5 w-3.5 text-[#616061]" />
                </a>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
