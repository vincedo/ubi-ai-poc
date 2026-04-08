import { describe, it, expect } from 'vitest';
import { parseJson } from '../parse-json.js';

describe('parseJson', () => {
  it('parses valid JSON object', () => {
    expect(parseJson<{ a: number }>('{"a":1}')).toEqual({ a: 1 });
  });

  it('parses valid JSON array', () => {
    expect(parseJson<number[]>('[1,2,3]')).toEqual([1, 2, 3]);
  });

  it('parses primitive values', () => {
    expect(parseJson<number>('42')).toBe(42);
    expect(parseJson<boolean>('true')).toBe(true);
    expect(parseJson<null>('null')).toBeNull();
  });

  it('throws on malformed JSON', () => {
    expect(() => parseJson('{bad}')).toThrow('Malformed JSON');
  });

  it('includes label in error message when provided', () => {
    expect(() => parseJson('{bad}', 'keywords')).toThrow('Malformed JSON in keywords');
  });

  it('omits label from error message when not provided', () => {
    expect(() => parseJson('{bad}')).toThrow(/^Malformed JSON:/);
  });

  it('throws on empty string', () => {
    expect(() => parseJson('')).toThrow('Malformed JSON');
  });
});
