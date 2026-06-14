import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { WordStatsPanel } from './WordStatsPanel';

describe('WordStatsPanel', () => {
  it('renders writing statistics and closes on request', () => {
    const onClose = vi.fn();
    render(
      <WordStatsPanel
        stats={{
          words: 1200,
          characters: 5400,
          lines: 80,
          readingMinutes: 6,
        }}
        onClose={onClose}
      />,
    );

    expect(screen.getByText('1,200')).toBeInTheDocument();
    expect(screen.getByText('5,400')).toBeInTheDocument();
    expect(screen.getByText('80')).toBeInTheDocument();
    expect(screen.getByText('6 min')).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Close word count'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
