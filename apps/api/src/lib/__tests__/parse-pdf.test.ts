import { describe, it, expect } from 'vitest';
import { parsePdf } from '../parse-pdf.js';

describe('parsePdf', () => {
  it('concatenates page texts into a single string separated by newlines', () => {
    const input = `--- Page 1 ---\nFirst page.\n\n--- Page 2 ---\nSecond page.`;
    const { text } = parsePdf(input);
    expect(text).toBe('First page.\nSecond page.');
  });

  it('produces one anchor per non-empty page', () => {
    const input = `--- Page 1 ---\nFirst page.\n\n--- Page 2 ---\nSecond page.`;
    const { anchors } = parsePdf(input);
    expect(anchors).toHaveLength(2);
  });

  it('first anchor is at position 0 with pageNumber 1', () => {
    const input = `--- Page 1 ---\nFirst page.\n\n--- Page 2 ---\nSecond page.`;
    const { anchors } = parsePdf(input);
    expect(anchors[0]).toEqual({ pos: 0, pageNumber: 1 });
  });

  it('second anchor position equals length of first page text plus separator', () => {
    const input = `--- Page 1 ---\nFirst page.\n\n--- Page 2 ---\nSecond page.`;
    const { anchors } = parsePdf(input);
    // 'First page.' is 11 chars, separator is '\n' (1 char) → pos = 12
    expect(anchors[1]).toEqual({ pos: 12, pageNumber: 2 });
  });

  it('anchor pos points to the start of that page in the concatenated text', () => {
    const input = `--- Page 1 ---\nFirst page.\n\n--- Page 2 ---\nSecond page.`;
    const { text, anchors } = parsePdf(input);
    expect(text.slice(anchors[0].pos).startsWith('First page.')).toBe(true);
    expect(text.slice(anchors[1].pos).startsWith('Second page.')).toBe(true);
  });

  it('splits by form feed character', () => {
    const { anchors } = parsePdf('Page one.\fPage two.');
    expect(anchors).toHaveLength(2);
    expect(anchors[0].pageNumber).toBe(1);
    expect(anchors[1].pageNumber).toBe(2);
  });

  it('trims whitespace from page text', () => {
    const { text } = parsePdf('--- Page 1 ---\n  trimmed  \n');
    expect(text).toBe('trimmed');
  });

  it('returns single page for content with no delimiters', () => {
    const { text, anchors } = parsePdf('Just some text.');
    expect(text).toBe('Just some text.');
    expect(anchors).toHaveLength(1);
    expect(anchors[0]).toEqual({ pos: 0, pageNumber: 1 });
  });

  it('returns empty text and no anchors for empty content', () => {
    expect(parsePdf('')).toEqual({ text: '', anchors: [] });
    expect(parsePdf('   ')).toEqual({ text: '', anchors: [] });
  });

  it('skips empty pages from form feed splits and preserves correct page numbers', () => {
    const { text, anchors } = parsePdf('First page.\f\f\fLast page.');
    expect(anchors).toHaveLength(2);
    expect(anchors[0]).toEqual({ pos: 0, pageNumber: 1 });
    expect(anchors[1]).toEqual({ pos: 12, pageNumber: 4 });
    expect(text).toBe('First page.\nLast page.');
  });

  it('filters out whitespace-only pages', () => {
    const input = `--- Page 1 ---\nContent here.\n\n--- Page 2 ---\n   \n\n--- Page 3 ---\nMore content.`;
    const { anchors } = parsePdf(input);
    expect(anchors).toHaveLength(2);
    expect(anchors[0].pageNumber).toBe(1);
    expect(anchors[1].pageNumber).toBe(3);
  });

  it('normalizes page numbers sequentially regardless of marker values', () => {
    const input = `--- Page 1 ---\nFirst.\n\n--- Page 999 ---\nNine-ninety-nine.`;
    const { anchors } = parsePdf(input);
    expect(anchors[0].pageNumber).toBe(1);
    expect(anchors[1].pageNumber).toBe(2);
  });

  it('chunk spanning multiple pages gets the page number of the page where it starts', () => {
    // Verifies the anchor lookup contract
    const input = `--- Page 1 ---\nPage one content.\n\n--- Page 2 ---\nPage two content.`;
    const { anchors } = parsePdf(input);
    expect(anchors[0]).toEqual({ pos: 0, pageNumber: 1 });
    expect(anchors[1].pageNumber).toBe(2);
  });
});
