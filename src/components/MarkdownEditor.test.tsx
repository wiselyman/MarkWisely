import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MarkdownEditor } from './MarkdownEditor';

describe('MarkdownEditor dirty tracking', () => {
  it('does not publish a change while hydrating markdown content', async () => {
    const onChange = vi.fn();

    render(
      <MarkdownEditor
        markdown={'# Title\n\n---\n\n## Section\n\nBody text.'}
        mode="wysiwyg"
        theme="light"
        documentPath={null}
        rootUrl={null}
        showSyntaxOnFocus
        focusMode={false}
        typewriterMode={false}
        onChange={onChange}
      />,
    );

    expect(await screen.findByTestId('markdown-editor')).toBeInTheDocument();
    await waitFor(() => expect(onChange).not.toHaveBeenCalled(), { timeout: 300 });
  });
});
