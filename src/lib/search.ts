export type SearchMatch = {
  index: number;
  length: number;
};

export function findMarkdownMatches(markdown: string, query: string, caseSensitive = false): SearchMatch[] {
  if (!query) {
    return [];
  }

  const haystack = caseSensitive ? markdown : markdown.toLocaleLowerCase();
  const needle = caseSensitive ? query : query.toLocaleLowerCase();
  const matches: SearchMatch[] = [];
  let offset = 0;

  while (offset <= haystack.length) {
    const index = haystack.indexOf(needle, offset);
    if (index < 0) {
      break;
    }
    matches.push({ index, length: query.length });
    offset = index + Math.max(needle.length, 1);
  }

  return matches;
}

export function replaceMarkdownMatch(markdown: string, match: SearchMatch, replacement: string): string {
  return `${markdown.slice(0, match.index)}${replacement}${markdown.slice(match.index + match.length)}`;
}

export function replaceAllMarkdownMatches(
  markdown: string,
  query: string,
  replacement: string,
  caseSensitive = false,
): string {
  const matches = findMarkdownMatches(markdown, query, caseSensitive);
  let next = markdown;
  for (let index = matches.length - 1; index >= 0; index -= 1) {
    next = replaceMarkdownMatch(next, matches[index], replacement);
  }
  return next;
}
