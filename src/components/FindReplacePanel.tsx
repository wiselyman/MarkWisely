import { useEffect, useMemo, useRef, useState } from 'react';
import { findMarkdownMatches, replaceAllMarkdownMatches, replaceMarkdownMatch } from '../lib/search';
import { searchDirectory, type DirectorySearchHit } from '../lib/tauri';

type FindReplacePanelProps = {
  markdown: string;
  workspaceRoot?: string | null;
  initialCaseSensitive: boolean;
  onCaseSensitiveChange: (caseSensitive: boolean) => void;
  onChange: (markdown: string) => void;
  onOpenFile?: (path: string) => void | Promise<void>;
  onClose: () => void;
};

export function FindReplacePanel({
  markdown,
  workspaceRoot,
  initialCaseSensitive,
  onCaseSensitiveChange,
  onChange,
  onOpenFile,
  onClose,
}: FindReplacePanelProps) {
  const [query, setQuery] = useState('');
  const [replacement, setReplacement] = useState('');
  const [caseSensitive, setCaseSensitive] = useState(initialCaseSensitive);
  const [activeIndex, setActiveIndex] = useState(0);
  const [folderHits, setFolderHits] = useState<DirectorySearchHit[]>([]);
  const [folderError, setFolderError] = useState('');
  const [searchingFolder, setSearchingFolder] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const matches = useMemo(() => findMarkdownMatches(markdown, query, caseSensitive), [caseSensitive, markdown, query]);
  const activeMatch = matches[activeIndex] ?? null;

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  useEffect(() => {
    if (activeIndex >= matches.length) {
      setActiveIndex(Math.max(0, matches.length - 1));
    }
  }, [activeIndex, matches.length]);

  const go = (direction: 1 | -1) => {
    if (matches.length === 0) {
      return;
    }
    setActiveIndex((current) => (current + direction + matches.length) % matches.length);
  };

  const replaceCurrent = () => {
    if (!activeMatch) {
      return;
    }
    onChange(replaceMarkdownMatch(markdown, activeMatch, replacement));
  };

  const replaceAll = () => {
    if (!query || matches.length === 0) {
      return;
    }
    onChange(replaceAllMarkdownMatches(markdown, query, replacement, caseSensitive));
    setActiveIndex(0);
  };

  const searchFolder = async () => {
    if (!workspaceRoot || !query.trim()) {
      return;
    }
    setSearchingFolder(true);
    setFolderError('');
    try {
      setFolderHits(await searchDirectory(workspaceRoot, query, { caseSensitive, maxResults: 80 }));
    } catch (error) {
      setFolderHits([]);
      setFolderError(error instanceof Error ? error.message : String(error));
    } finally {
      setSearchingFolder(false);
    }
  };

  return (
    <section
      className="find-panel"
      aria-label="Find and replace"
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          onClose();
        }
        if (event.key === 'Enter' && event.target === inputRef.current) {
          event.preventDefault();
          go(event.shiftKey ? -1 : 1);
        }
      }}
    >
      <input
        ref={inputRef}
        aria-label="Find"
        value={query}
        placeholder="Find"
        onChange={(event) => {
          setQuery(event.target.value);
          setActiveIndex(0);
        }}
      />
      <div className="find-count" aria-live="polite">
        {query ? `${matches.length ? activeIndex + 1 : 0}/${matches.length}` : '0/0'}
      </div>
      <button type="button" aria-label="Previous match" onClick={() => go(-1)}>
        Prev
      </button>
      <button type="button" aria-label="Next match" onClick={() => go(1)}>
        Next
      </button>
      <label className="find-case-toggle">
        <input
          type="checkbox"
          checked={caseSensitive}
          onChange={(event) => {
            setCaseSensitive(event.target.checked);
            onCaseSensitiveChange(event.target.checked);
          }}
        />
        Aa
      </label>
      <input
        aria-label="Replace"
        value={replacement}
        placeholder="Replace"
        onChange={(event) => setReplacement(event.target.value)}
      />
      <button type="button" onClick={replaceCurrent} disabled={!activeMatch}>
        Replace
      </button>
      <button type="button" onClick={replaceAll} disabled={matches.length === 0}>
        All
      </button>
      <button type="button" onClick={() => void searchFolder()} disabled={!workspaceRoot || !query.trim() || searchingFolder}>
        Folder
      </button>
      <button type="button" aria-label="Close find" onClick={onClose}>
        Close
      </button>
      {(folderHits.length > 0 || folderError) && (
        <div className="find-folder-results">
          {folderError ? (
            <div className="find-folder-error">{folderError}</div>
          ) : (
            folderHits.map((hit) => (
              <button
                key={`${hit.path}-${hit.lineNumber}-${hit.column}`}
                type="button"
                title={hit.path}
                onClick={() => void onOpenFile?.(hit.path)}
              >
                <span>{hit.name}</span>
                <small>
                  {hit.lineNumber}:{hit.column}
                </small>
                <em>{hit.preview}</em>
              </button>
            ))
          )}
        </div>
      )}
    </section>
  );
}
