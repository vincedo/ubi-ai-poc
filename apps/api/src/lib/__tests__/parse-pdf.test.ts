import { describe, it, expect } from 'vitest';
import { parsePdf } from '../parse-pdf.js';

describe('parsePdf', () => {
  it('splits by page marker and returns page numbers', () => {
    const input = `--- Page 1 ---\nFirst page.\n\n--- Page 2 ---\nSecond page.`;
    const result = parsePdf(input);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ text: 'First page.', pageNumber: 1 });
    expect(result[1]).toEqual({ text: 'Second page.', pageNumber: 2 });
  });

  it('splits by form feed character', () => {
    const result = parsePdf('Page one.\fPage two.');
    expect(result).toHaveLength(2);
    expect(result[0].pageNumber).toBe(1);
    expect(result[1].pageNumber).toBe(2);
  });

  it('trims whitespace from page text', () => {
    const result = parsePdf('--- Page 1 ---\n  trimmed  \n');
    expect(result[0].text).toBe('trimmed');
  });

  it('returns single page for content with no delimiters', () => {
    const result = parsePdf('Just some text.');
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ text: 'Just some text.', pageNumber: 1 });
  });

  it('returns empty array for empty content', () => {
    expect(parsePdf('')).toHaveLength(0);
    expect(parsePdf('   ')).toHaveLength(0);
  });

  it('handles multiple consecutive form feeds by filtering empty pages', () => {
    const result = parsePdf('First page.\f\f\fLast page.');
    // Form feed split → ['First page.', '', '', 'Last page.'] → page numbers assigned before filtering
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ text: 'First page.', pageNumber: 1 });
    expect(result[1]).toEqual({ text: 'Last page.', pageNumber: 4 });
  });

  it('filters out pages with only whitespace', () => {
    const input = `--- Page 1 ---\nContent here.\n\n--- Page 2 ---\n   \n\n--- Page 3 ---\nMore content.`;
    const result = parsePdf(input);
    // Page numbers reflect original position, not filtered index
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ text: 'Content here.', pageNumber: 1 });
    expect(result[1]).toEqual({ text: 'More content.', pageNumber: 3 });
  });

  it('normalizes page numbers sequentially regardless of marker values', () => {
    const input = `--- Page 1 ---\nFirst.\n\n--- Page 999 ---\nNine-ninety-nine.`;
    const result = parsePdf(input);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ text: 'First.', pageNumber: 1 });
    expect(result[1]).toEqual({ text: 'Nine-ninety-nine.', pageNumber: 2 });
  });
});
