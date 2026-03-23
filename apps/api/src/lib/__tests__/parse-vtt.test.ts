import { describe, it, expect } from 'vitest';
import { parseVtt } from '../parse-vtt.js';

const BASIC_VTT = `WEBVTT

00:00:01.000 --> 00:00:04.500
Some spoken text here.

00:00:05.000 --> 00:00:09.000
More spoken text.`;

describe('parseVtt', () => {
  it('extracts cue text and start timestamp', () => {
    const result = parseVtt(BASIC_VTT);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ text: 'Some spoken text here.', timestamp: '00:00:01' });
    expect(result[1]).toEqual({ text: 'More spoken text.', timestamp: '00:00:05' });
  });

  it('skips NOTE blocks', () => {
    const vtt = `WEBVTT\n\nNOTE chapter\n\n00:00:01.000 --> 00:00:04.000\nText.`;
    expect(parseVtt(vtt)).toHaveLength(1);
  });

  it('skips STYLE blocks', () => {
    const vtt = `WEBVTT\n\nSTYLE\n::cue { color: white }\n\n00:00:01.000 --> 00:00:04.000\nText.`;
    expect(parseVtt(vtt)).toHaveLength(1);
  });

  it('skips cues with empty text', () => {
    const vtt = `WEBVTT\n\n00:00:01.000 --> 00:00:04.000\n`;
    expect(parseVtt(vtt)).toHaveLength(0);
  });

  it('skips blocks where first line does not match timestamp format', () => {
    const vtt = `WEBVTT\n\nnot-a-timestamp\nSome text.`;
    expect(parseVtt(vtt)).toHaveLength(0);
  });

  it('drops milliseconds from timestamp', () => {
    const vtt = `WEBVTT\n\n01:23:45.678 --> 01:23:50.000\nText.`;
    expect(parseVtt(vtt)[0].timestamp).toBe('01:23:45');
  });

  it('joins multi-line cue text with a space', () => {
    const vtt = `WEBVTT\n\n00:00:01.000 --> 00:00:04.000\nLine one.\nLine two.`;
    expect(parseVtt(vtt)[0].text).toBe('Line one. Line two.');
  });

  it('returns empty array for empty string input', () => {
    const result = parseVtt('');
    expect(result).toHaveLength(0);
  });

  it('returns empty array for WEBVTT header only', () => {
    const result = parseVtt('WEBVTT');
    expect(result).toHaveLength(0);
  });

  it('parses correctly with multiple consecutive blank lines between cues', () => {
    const vtt = `WEBVTT\n\n\n\n00:00:01.000 --> 00:00:04.000\nFirst cue.\n\n\n\n00:00:05.000 --> 00:00:09.000\nSecond cue.`;
    const result = parseVtt(vtt);
    expect(result).toHaveLength(2);
    expect(result[0].text).toBe('First cue.');
    expect(result[1].text).toBe('Second cue.');
  });

  it('skips cue with numeric identifier line before timestamp (identifier on first line)', () => {
    // Cue identifiers like "1" on a line before the timestamp are valid VTT syntax
    // but our regex only matches lines starting with HH:MM:SS format, so it will skip this block
    const vtt = `WEBVTT\n\n1\n00:00:01.000 --> 00:00:04.000\nText with ID.`;
    const result = parseVtt(vtt);
    // The block starts with "1", which doesn't match TIMESTAMP_RE, so it's skipped
    expect(result).toHaveLength(0);
  });
});
