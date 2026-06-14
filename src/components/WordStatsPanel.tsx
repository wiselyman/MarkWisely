import type { DocumentStats } from '../lib/markdown';

type WordStatsPanelProps = {
  stats: DocumentStats;
  onClose: () => void;
};

export function WordStatsPanel({ stats, onClose }: WordStatsPanelProps) {
  return (
    <aside className="word-stats-panel" aria-label="Word count">
      <button className="word-stats-close" type="button" aria-label="Close word count" onClick={onClose}>
        ×
      </button>
      <dl>
        <div>
          <dt>Words</dt>
          <dd>{stats.words.toLocaleString()}</dd>
        </div>
        <div>
          <dt>Characters</dt>
          <dd>{stats.characters.toLocaleString()}</dd>
        </div>
        <div>
          <dt>Lines</dt>
          <dd>{stats.lines.toLocaleString()}</dd>
        </div>
        <div>
          <dt>Reading</dt>
          <dd>{stats.readingMinutes} min</dd>
        </div>
      </dl>
    </aside>
  );
}
