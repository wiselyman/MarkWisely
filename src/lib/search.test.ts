import { describe, expect, it } from 'vitest';
import { findMarkdownMatches, replaceAllMarkdownMatches, replaceMarkdownMatch } from './search';

describe('markdown search helpers', () => {
  it('finds case-insensitive matches by default', () => {
    expect(findMarkdownMatches('Alpha alpha ALPHA', 'alpha')).toEqual([
      { index: 0, length: 5 },
      { index: 6, length: 5 },
      { index: 12, length: 5 },
    ]);
  });

  it('can search case-sensitively and replace one match', () => {
    const matches = findMarkdownMatches('你好 MarkWisely，你好', '你好', true);
    expect(matches).toEqual([
      { index: 0, length: 2 },
      { index: 14, length: 2 },
    ]);
    expect(replaceMarkdownMatch('你好 MarkWisely，你好', matches[1], '再见')).toBe('你好 MarkWisely，再见');
  });

  it('replaces all matches without shifting later offsets', () => {
    expect(replaceAllMarkdownMatches('one two one', 'one', 'three')).toBe('three two three');
  });
});
