import { describe, it, expect } from 'vitest';
import { chunkText } from '../chunk.js';

// 500 tokens ≈ 2000 chars; 100 token overlap ≈ 400 chars
describe('chunkText', () => {
  it('returns single chunk for short text', () => {
    const result = chunkText('Short text.', { timestamp: '00:01:00' });
    expect(result).toHaveLength(1);
    expect(result[0].text).toBe('Short text.');
    expect(result[0].citation).toEqual({ timestamp: '00:01:00' });
    expect(result[0].chunkIndex).toBe(0);
  });

  it('splits text longer than 2000 chars into overlapping chunks', () => {
    const longText = 'a'.repeat(5000);
    const result = chunkText(longText, { pageNumber: 1 });
    expect(result.length).toBeGreaterThan(1);
    // Each chunk body is at most 2000 chars
    for (const chunk of result) {
      expect(chunk.text.length).toBeLessThanOrEqual(2000);
    }
    // 400-char overlap: end of chunk[0] === start of chunk[1]
    expect(result[1].text.slice(0, 400)).toBe(result[0].text.slice(-400));
  });

  it('all chunks carry the same citation', () => {
    const result = chunkText('b'.repeat(5000), { pageNumber: 3 });
    for (const chunk of result) {
      expect(chunk.citation).toEqual({ pageNumber: 3 });
    }
  });

  it('chunkIndex starts at the provided startIndex', () => {
    const result = chunkText('c'.repeat(5000), { timestamp: '00:03:00' }, 5);
    expect(result[0].chunkIndex).toBe(5);
    expect(result[1].chunkIndex).toBe(6);
  });

  it('returns empty array for empty string input', () => {
    const result = chunkText('', { timestamp: '00:00:00' });
    expect(result).toHaveLength(0);
  });

  it('returns 2 chunks for text exactly 2000 chars (overlap causes second pass)', () => {
    const text = 'a'.repeat(2000);
    const result = chunkText(text, { pageNumber: 1 });
    // pos=0 → chunk[0..2000], then pos=1600 < 2000 → chunk[1600..2000]
    expect(result).toHaveLength(2);
    expect(result[0].text.length).toBe(2000);
    expect(result[1].text.length).toBe(400);
  });

  it('returns 2 chunks for text at 2001 chars', () => {
    const text = 'b'.repeat(2001);
    const result = chunkText(text, { pageNumber: 2 });
    expect(result).toHaveLength(2);
    // First chunk is full 2000 chars
    expect(result[0].text.length).toBe(2000);
    // Second chunk is overlap + 1 remaining char
    expect(result[1].text.length).toBe(401);
    // Last 400 chars of first chunk should equal first 400 chars of second
    expect(result[1].text.slice(0, 400)).toBe(result[0].text.slice(-400));
  });

  it('returns correct number of chunks for text at 2400 chars (one overlap boundary)', () => {
    const text = 'c'.repeat(2400);
    const result = chunkText(text, { timestamp: '00:05:00' });
    // 2400 chars: first chunk [0-2000], second chunk starts at 1600 [1600-2400]
    expect(result).toHaveLength(2);
    expect(result[0].text.length).toBe(2000);
    expect(result[1].text.length).toBe(800);
  });

  it('handles unicode and emoji text correctly with char-level slicing', () => {
    // Mix of ASCII, multi-byte UTF-8, and emoji
    const text = '🎉 '.repeat(1000) + 'emoji test'; // ~6000 chars with emojis
    const result = chunkText(text, { pageNumber: 1 });
    expect(result.length).toBeGreaterThan(1);
    // Verify all chunks are valid strings (no truncated UTF-8)
    for (const chunk of result) {
      expect(() => new TextEncoder().encode(chunk.text)).not.toThrow();
    }
    // Verify overlap is maintained
    if (result.length > 1) {
      expect(result[1].text.slice(0, 400)).toBe(result[0].text.slice(-400));
    }
  });
});
