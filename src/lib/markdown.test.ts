import { describe, expect, it } from 'vitest';
import { getOutline, getStats, slugify } from './markdown';

describe('markdown helpers', () => {
  it('extracts outline items with levels and line numbers', () => {
    const outline = getOutline('# Title\n\n## Section\nText\n### Deep');
    expect(outline).toEqual([
      { id: 'title-0', text: 'Title', level: 1, line: 1 },
      { id: 'section-2', text: 'Section', level: 2, line: 3 },
      { id: 'deep-4', text: 'Deep', level: 3, line: 5 },
    ]);
  });

  it('computes practical writing stats', () => {
    const stats = getStats('# Title\n\nHello **world**.\n\n```ts\nconst hidden = true\n```');
    expect(stats.words).toBe(3);
    expect(stats.lines).toBe(7);
    expect(stats.readingMinutes).toBe(1);
  });

  it('slugifies unicode headings', () => {
    expect(slugify('你好 MarkWisely!')).toBe('你好-markwisely');
  });
});
