import { readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const targetDir = path.join(root, 'src-tauri', 'target');
const reportPath = path.join(root, 'BUNDLE_SIZE_REPORT.md');

const entries = [];

async function walk(dir) {
  let children = [];
  try {
    children = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const child of children) {
    const fullPath = path.join(dir, child.name);
    if (child.isDirectory()) {
      await walk(fullPath);
      continue;
    }
    if (!fullPath.includes(`${path.sep}bundle${path.sep}`)) {
      continue;
    }
    const info = await stat(fullPath);
    entries.push({
      path: path.relative(root, fullPath),
      size: info.size,
    });
  }
}

await walk(targetDir);
entries.sort((a, b) => b.size - a.size || a.path.localeCompare(b.path));

const lines = [
  '# MarkWisely Bundle Size Report',
  '',
  `Generated: ${new Date().toISOString()}`,
  '',
];

if (entries.length === 0) {
  lines.push('No Tauri bundle files were found.');
} else {
  lines.push('| File | Size |');
  lines.push('| --- | ---: |');
  for (const entry of entries) {
    lines.push(`| \`${entry.path}\` | ${formatBytes(entry.size)} |`);
  }
}

lines.push('');
await writeFile(reportPath, `${lines.join('\n')}\n`);
console.log(lines.join('\n'));

function formatBytes(bytes) {
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(unitIndex === 0 ? 0 : 2)} ${units[unitIndex]}`;
}
