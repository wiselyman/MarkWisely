import { useEffect, useMemo, useState } from 'react';
import type { OutlineItem } from '../lib/markdown';

type OutlinePanelProps = {
  outline: OutlineItem[];
  mode: 'nested' | 'flat';
  onChangeMode: (mode: 'nested' | 'flat') => void;
};

export function OutlinePanel({ outline, mode, onChangeMode }: OutlinePanelProps) {
  const [query, setQuery] = useState('');
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const [activeIndex, setActiveIndex] = useState(0);
  const visibleOutline = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    const searched = normalizedQuery
      ? outline.filter((item) => item.text.toLocaleLowerCase().includes(normalizedQuery))
      : outline;
    return mode === 'flat' ? searched.map((item) => ({ ...item, level: 1 })) : filterCollapsed(searched, collapsed);
  }, [collapsed, mode, outline, query]);

  useEffect(() => {
    const scroller = document.querySelector('.wysiwyg-scroll');
    if (!scroller) {
      return;
    }

    const updateActiveHeading = () => {
      const headings = Array.from(
        document.querySelectorAll<HTMLElement>(
          '.ProseMirror h1, .ProseMirror h2, .ProseMirror h3, .ProseMirror h4, .ProseMirror h5, .ProseMirror h6',
        ),
      );
      if (headings.length === 0) {
        setActiveIndex(0);
        return;
      }
      const center = scroller.getBoundingClientRect().top + scroller.clientHeight * 0.36;
      let nextIndex = 0;
      headings.forEach((heading, index) => {
        if (heading.getBoundingClientRect().top <= center) {
          nextIndex = index;
        }
      });
      setActiveIndex(nextIndex);
    };

    updateActiveHeading();
    scroller.addEventListener('scroll', updateActiveHeading, { passive: true });
    return () => scroller.removeEventListener('scroll', updateActiveHeading);
  }, [outline]);

  return (
    <section className="outline-panel">
      <div className="panel-header">
        <span>Outline</span>
      </div>
      <div className="outline-tools">
        <input
          aria-label="Filter outline"
          value={query}
          placeholder="Search"
          onChange={(event) => setQuery(event.target.value)}
        />
        <button type="button" onClick={() => onChangeMode(mode === 'nested' ? 'flat' : 'nested')}>
          {mode === 'nested' ? 'Nest' : 'Flat'}
        </button>
      </div>
      {outline.length === 0 ? (
        <div className="empty-panel">No headings.</div>
      ) : (
        <nav className="outline-list" aria-label="Document outline">
          {visibleOutline.map((item) => (
            <button
              key={`${item.id}-${item.line}`}
              className={`outline-row ${outline[activeIndex]?.line === item.line ? 'active' : ''}`}
              style={{ paddingLeft: 8 + (item.level - 1) * 14 }}
              type="button"
              title={`Line ${item.line}`}
              onClick={() => scrollToHeading(item.text)}
            >
              {mode === 'nested' && hasChild(outline, item) && (
                <span
                  className="outline-disclosure"
                  role="presentation"
                  onClick={(event) => {
                    event.stopPropagation();
                    setCollapsed((current) => toggleCollapsed(current, item.id));
                  }}
                >
                  {collapsed.has(item.id) ? '+' : '-'}
                </span>
              )}
              {item.text}
            </button>
          ))}
        </nav>
      )}
    </section>
  );
}

function filterCollapsed(outline: OutlineItem[], collapsed: Set<string>): OutlineItem[] {
  const visible: OutlineItem[] = [];
  const hiddenLevels: number[] = [];
  for (const item of outline) {
    while (hiddenLevels.length > 0 && item.level <= hiddenLevels[hiddenLevels.length - 1]) {
      hiddenLevels.pop();
    }
    if (hiddenLevels.length > 0) {
      continue;
    }
    visible.push(item);
    if (collapsed.has(item.id)) {
      hiddenLevels.push(item.level);
    }
  }
  return visible;
}

function hasChild(outline: OutlineItem[], item: OutlineItem): boolean {
  const index = outline.findIndex((candidate) => candidate.id === item.id);
  return index >= 0 && outline[index + 1]?.level > item.level;
}

function toggleCollapsed(current: Set<string>, id: string): Set<string> {
  const next = new Set(current);
  if (next.has(id)) {
    next.delete(id);
  } else {
    next.add(id);
  }
  return next;
}

function scrollToHeading(text: string) {
  const headings = Array.from(document.querySelectorAll('.ProseMirror h1, .ProseMirror h2, .ProseMirror h3, .ProseMirror h4, .ProseMirror h5, .ProseMirror h6'));
  const target = headings.find((heading) => heading.textContent?.trim() === text);
  target?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}
