export type OutlineItem = {
  id: string;
  text: string;
  level: number;
  line: number;
};

export type DocumentStats = {
  words: number;
  characters: number;
  lines: number;
  readingMinutes: number;
};

export function getOutline(markdown: string): OutlineItem[] {
  return markdown
    .split(/\r?\n/)
    .map((line, index) => {
      const match = /^(#{1,6})\s+(.+?)\s*#*$/.exec(line);
      if (!match) {
        return null;
      }
      const text = match[2].trim();
      return {
        id: slugify(`${text}-${index}`),
        text,
        level: match[1].length,
        line: index + 1,
      };
    })
    .filter((item): item is OutlineItem => item !== null);
}

export function getStats(markdown: string): DocumentStats {
  const text = markdown
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]*`/g, ' ')
    .replace(/!\[[^\]]*]\([^)]*\)/g, ' ')
    .replace(/\[[^\]]*]\([^)]*\)/g, ' ')
    .replace(/[#>*_\-[\]()`|]/g, ' ');
  const wordMatches = text.match(/[\p{L}\p{N}]+/gu) ?? [];
  const characters = markdown.replace(/\s/g, '').length;
  return {
    words: wordMatches.length,
    characters,
    lines: markdown.length === 0 ? 1 : markdown.split(/\r?\n/).length,
    readingMinutes: Math.max(1, Math.ceil(wordMatches.length / 220)),
  };
}

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '');
}
