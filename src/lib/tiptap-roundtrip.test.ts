import { describe, expect, it } from 'vitest';
import { Editor } from '@tiptap/core';
import { Link } from '@tiptap/extension-link';
import { Table } from '@tiptap/extension-table';
import { TableCell } from '@tiptap/extension-table-cell';
import { TableHeader } from '@tiptap/extension-table-header';
import { TableRow } from '@tiptap/extension-table-row';
import { TaskItem } from '@tiptap/extension-task-item';
import { TaskList } from '@tiptap/extension-task-list';
import StarterKit from '@tiptap/starter-kit';
import { Markdown } from '@tiptap/markdown';
import { FrontMatterBlock, InlineMath, MarkdownImage, MathBlock, TocBlock } from '../components/MarkdownEditor';

type EditorWithMarkdown = Editor & {
  getMarkdown: () => string;
};

describe('Tiptap Markdown round trip', () => {
  it('preserves common writing structures', () => {
    const markdown = '# Title\n\nHello **world**.\n\n- one\n- two\n\n```ts\nconst x = 1\n```';
    const editor = createEditor(markdown);

    const roundTrip = (editor as EditorWithMarkdown).getMarkdown();
    expect(roundTrip).toContain('# Title');
    expect(roundTrip).toContain('**world**');
    expect(roundTrip).toContain('- one');
    expect(roundTrip).toContain('```ts');
    editor.destroy();
  });

  it.each([
    ['task lists', '- [x] Done\n- [ ] Next', ['- [x] Done', '- [ ] Next']],
    ['links and images', '[site](https://example.com)\n\n![Alt](assets/a.png)', ['[site](https://example.com)', '![Alt](assets/a.png)']],
    ['image width', '![Alt](assets/a.png){width=320}', ['![Alt](assets/a.png){width=320}']],
    ['tables', '| A | B |\n| --- | --- |\n| 1 | 2 |', ['| A', '| B', '| 1', '| 2']],
    ['front matter', '---\ntitle: Draft\nmarkwisely-copy-images-to: assets\n---\n\n# Body', ['---', 'title: Draft', 'markwisely-copy-images-to: assets', '# Body']],
    ['display math', '$$\na^2 + b^2 = c^2\n$$', ['$$', 'a^2 + b^2 = c^2']],
    ['inline math', 'Energy is $E = mc^2$ today.', ['Energy is', '$E = mc^2$']],
    ['toc block', '# Top\n\n[TOC]\n\n## Child', ['# Top', '[TOC]', '## Child']],
    ['table alignment', '| A | B |\n| :--- | ---: |\n| 1 | 2 |', ['| :---', '---:', '| 1', '| 2']],
    ['cjk text', '# 标题\n\n你好，MarkWisely。', ['# 标题', '你好']],
  ])('preserves %s', (_name, markdown, expectedSnippets) => {
    const editor = createEditor(markdown);
    const roundTrip = (editor as EditorWithMarkdown).getMarkdown();
    for (const snippet of expectedSnippets) {
      expect(roundTrip).toContain(snippet);
    }
    editor.destroy();
  });

  it('only treats document-leading YAML as front matter', () => {
    const editor = createEditor('---\ntitle: Draft\nmarkwisely-copy-images-to: assets\n---\n\n# Body');

    expect(editor.state.doc.firstChild?.type.name).toBe('frontMatterBlock');
    editor.destroy();
  });

  it('keeps horizontal rules after content from swallowing the document', () => {
    const markdown = [
      '# 光伏清洁机器人卡机定位系统实施方案',
      '',
      '**基于 LoRaWAN + GIS 地图的机器人位置可视化与卡机告警**',
      '',
      '适用人员：项目经理 / 运维工程师 / 系统集成商',
      '',
      '---',
      '',
      '## 一、方案背景与目标',
      '',
      '### 1.1 问题描述',
      '',
      '光伏电站清洁机器人在运行过程中，偶发卡机故障。',
      '',
      '| 目标 | 说明 |',
      '|------|------|',
      '| 实时感知卡机 | 系统自动触发告警 |',
      '',
      '---',
      '',
      '## 二、系统架构',
    ].join('\n');
    const editor = createEditor(markdown);
    const nodeTypes = collectNodeTypes(editor);

    expect(nodeTypes).not.toContain('frontMatterBlock');
    expect(nodeTypes).toContain('horizontalRule');
    expect(nodeTypes).toContain('table');
    expect(collectHeadings(editor)).toEqual(
      expect.arrayContaining([
        { level: 1, text: '光伏清洁机器人卡机定位系统实施方案' },
        { level: 2, text: '一、方案背景与目标' },
        { level: 3, text: '1.1 问题描述' },
        { level: 2, text: '二、系统架构' },
      ]),
    );
    editor.destroy();
  });
});

function createEditor(markdown: string) {
  return new Editor({
    extensions: [
      StarterKit.configure({ link: false }),
      FrontMatterBlock,
      MathBlock,
      InlineMath,
      TocBlock,
      Markdown,
      Link.configure({ openOnClick: false }),
      MarkdownImage,
      TaskList,
      TaskItem.configure({ nested: true }),
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
    ],
    content: markdown,
    contentType: 'markdown',
  });
}

function collectNodeTypes(editor: Editor): string[] {
  const nodeTypes: string[] = [];
  editor.state.doc.descendants((node) => {
    nodeTypes.push(node.type.name);
  });
  return nodeTypes;
}

function collectHeadings(editor: Editor): Array<{ level: number; text: string }> {
  const headings: Array<{ level: number; text: string }> = [];
  editor.state.doc.descendants((node) => {
    if (node.type.name === 'heading') {
      headings.push({ level: node.attrs.level, text: node.textContent });
    }
  });
  return headings;
}
