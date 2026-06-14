import { Clock3 } from 'lucide-react';
import { deriveNameFromPath } from '../lib/document';

type RecentFilesProps = {
  files: string[];
  activePath: string | null;
  onOpenFile: (path: string) => void | Promise<void>;
};

export function RecentFiles({ files, activePath, onOpenFile }: RecentFilesProps) {
  return (
    <section className="recent-section">
      <div className="panel-header compact">
        <span>Recent</span>
      </div>
      {files.length === 0 ? (
        <div className="empty-panel">No recent files.</div>
      ) : (
        <div className="recent-list">
          {files.map((path) => (
            <button
              key={path}
              className={`recent-row ${path === activePath ? 'active' : ''}`}
              onClick={() => void onOpenFile(path)}
              type="button"
              title={path}
            >
              <Clock3 size={14} />
              <span>{deriveNameFromPath(path)}</span>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
