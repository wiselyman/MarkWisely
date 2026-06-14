import type { DocumentStats } from '../lib/markdown';

type StatusBarProps = {
  path: string | null;
  isDirty: boolean;
  stats: DocumentStats;
  mode: string;
  message: string;
  modifiedMs?: number;
};

export function StatusBar({ path, isDirty, stats, mode, message, modifiedMs }: StatusBarProps) {
  return (
    <footer className="status-bar">
      <span className={isDirty ? 'dirty-dot active' : 'dirty-dot'} />
      <span>{isDirty ? 'Unsaved' : 'Saved'}</span>
      <span>{mode === 'source' ? 'Source' : 'Live'}</span>
      <span>{stats.words} words</span>
      <span>{stats.characters} chars</span>
      <span>{stats.lines} lines</span>
      <span>{stats.readingMinutes} min read</span>
      {modifiedMs ? <span>Modified {new Date(modifiedMs).toLocaleString()}</span> : null}
      <span className="status-path">{path ?? 'No file path'}</span>
      <span className="status-message">{message}</span>
    </footer>
  );
}
