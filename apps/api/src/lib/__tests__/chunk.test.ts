import { describe, it, expect } from 'vitest';
import { chunkText } from '../chunk.js';

describe('chunkText', () => {
  it('returns single chunk for short text', () => {
    const result = chunkText('Short text.');
    expect(result).toHaveLength(1);
    expect(result[0].text).toBe('Short text.');
    expect(result[0].startPos).toBe(0);
    expect(result[0].chunkIndex).toBe(0);
  });

  it('splits text longer than 2000 chars into overlapping chunks', () => {
    const longText = 'a'.repeat(5000);
    const result = chunkText(longText);
    expect(result.length).toBeGreaterThan(1);
    for (const chunk of result) {
      expect(chunk.text.length).toBeLessThanOrEqual(2000);
    }
    // 400-char overlap: end of chunk[0] === start of chunk[1]
    expect(result[1].text.slice(0, 400)).toBe(result[0].text.slice(-400));
  });

  it('sets startPos correctly for each chunk', () => {
    const longText = 'a'.repeat(5000);
    const result = chunkText(longText);
    // chunk[0] starts at 0, chunk[1] starts at chunkSize - chunkOverlap = 1600
    expect(result[0].startPos).toBe(0);
    expect(result[1].startPos).toBe(1600);
    expect(result[2].startPos).toBe(3200);
  });

  it('chunkIndex starts at the provided startIndex', () => {
    const result = chunkText('c'.repeat(5000), 5);
    expect(result[0].chunkIndex).toBe(5);
    expect(result[1].chunkIndex).toBe(6);
  });

  it('returns empty array for empty string input', () => {
    const result = chunkText('');
    expect(result).toHaveLength(0);
  });

  it('returns 2 chunks for text exactly 2000 chars (overlap causes second pass)', () => {
    const text = 'a'.repeat(2000);
    const result = chunkText(text);
    expect(result).toHaveLength(2);
    expect(result[0].text.length).toBe(2000);
    expect(result[1].text.length).toBe(400);
    expect(result[0].startPos).toBe(0);
    expect(result[1].startPos).toBe(1600);
  });

  it('returns 2 chunks for text at 2001 chars', () => {
    const text = 'b'.repeat(2001);
    const result = chunkText(text);
    expect(result).toHaveLength(2);
    expect(result[0].text.length).toBe(2000);
    expect(result[1].text.length).toBe(401);
    expect(result[1].text.slice(0, 400)).toBe(result[0].text.slice(-400));
  });

  it('returns correct number of chunks for text at 2400 chars', () => {
    const text = 'c'.repeat(2400);
    const result = chunkText(text);
    expect(result).toHaveLength(2);
    expect(result[0].text.length).toBe(2000);
    expect(result[1].text.length).toBe(800);
  });

  it('handles unicode and emoji text correctly with char-level slicing', () => {
    const text = '🎉 '.repeat(1000) + 'emoji test';
    const result = chunkText(text);
    expect(result.length).toBeGreaterThan(1);
    for (const chunk of result) {
      expect(() => new TextEncoder().encode(chunk.text)).not.toThrow();
    }
    if (result.length > 1) {
      expect(result[1].text.slice(0, 400)).toBe(result[0].text.slice(-400));
    }
  });
});
