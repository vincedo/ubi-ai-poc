import { describe, it, expect } from 'vitest';
import { parseVtt } from '../parse-vtt.js';

const BASIC_VTT = `WEBVTT

00:00:01.000 --> 00:00:04.500
Some spoken text here.

00:00:05.000 --> 00:00:09.000
More spoken text.`;

describe('parseVtt', () => {
  it('concatenates cue texts into a single string', () => {
    const { text } = parseVtt(BASIC_VTT);
    expect(text).toBe('Some spoken text here. More spoken text.');
  });

  it('produces one anchor per cue', () => {
    const { anchors } = parseVtt(BASIC_VTT);
    expect(anchors).toHaveLength(2);
  });

  it('first anchor is at position 0 with the correct timestamp', () => {
    const { anchors } = parseVtt(BASIC_VTT);
    expect(anchors[0]).toEqual({ pos: 0, timestamp: '00:00:01' });
  });

  it('second anchor position equals length of first cue text plus separator', () => {
    const { anchors } = parseVtt(BASIC_VTT);
    // 'Some spoken text here.' is 22 chars, separator is 1 space → pos = 23
    expect(anchors[1]).toEqual({ pos: 23, timestamp: '00:00:05' });
  });

  it('anchor pos points to the start of that cue in the concatenated text', () => {
    const { text, anchors } = parseVtt(BASIC_VTT);
    expect(text.slice(anchors[0].pos).startsWith('Some spoken text here.')).toBe(true);
    expect(text.slice(anchors[1].pos).startsWith('More spoken text.')).toBe(true);
  });

  it('skips NOTE blocks', () => {
    const vtt = `WEBVTT\n\nNOTE chapter\n\n00:00:01.000 --> 00:00:04.000\nText.`;
    const { anchors } = parseVtt(vtt);
    expect(anchors).toHaveLength(1);
  });

  it('skips STYLE blocks', () => {
    const vtt = `WEBVTT\n\nSTYLE\n::cue { color: white }\n\n00:00:01.000 --> 00:00:04.000\nText.`;
    const { anchors } = parseVtt(vtt);
    expect(anchors).toHaveLength(1);
  });

  it('skips cues with empty text', () => {
    const vtt = `WEBVTT\n\n00:00:01.000 --> 00:00:04.000\n`;
    const { text, anchors } = parseVtt(vtt);
    expect(text).toBe('');
    expect(anchors).toHaveLength(0);
  });

  it('skips blocks where first line does not match timestamp format', () => {
    const vtt = `WEBVTT\n\nnot-a-timestamp\nSome text.`;
    const { anchors } = parseVtt(vtt);
    expect(anchors).toHaveLength(0);
  });

  it('drops milliseconds from timestamp', () => {
    const vtt = `WEBVTT\n\n01:23:45.678 --> 01:23:50.000\nText.`;
    expect(parseVtt(vtt).anchors[0].timestamp).toBe('01:23:45');
  });

  it('joins multi-line cue text with a space', () => {
    const vtt = `WEBVTT\n\n00:00:01.000 --> 00:00:04.000\nLine one.\nLine two.`;
    expect(parseVtt(vtt).text).toBe('Line one. Line two.');
  });

  it('returns empty text and no anchors for empty string input', () => {
    const result = parseVtt('');
    expect(result.text).toBe('');
    expect(result.anchors).toHaveLength(0);
  });

  it('returns empty text and no anchors for WEBVTT header only', () => {
    const result = parseVtt('WEBVTT');
    expect(result.text).toBe('');
    expect(result.anchors).toHaveLength(0);
  });

  it('parses correctly with multiple consecutive blank lines between cues', () => {
    const vtt = `WEBVTT\n\n\n\n00:00:01.000 --> 00:00:04.000\nFirst cue.\n\n\n\n00:00:05.000 --> 00:00:09.000\nSecond cue.`;
    const { text, anchors } = parseVtt(vtt);
    expect(anchors).toHaveLength(2);
    expect(text).toBe('First cue. Second cue.');
  });

  it('parses cue with numeric identifier line before timestamp', () => {
    const vtt = `WEBVTT\n\n1\n00:00:01.000 --> 00:00:04.000\nText with ID.`;
    const { text, anchors } = parseVtt(vtt);
    expect(anchors).toHaveLength(1);
    expect(anchors[0]).toEqual({ pos: 0, timestamp: '00:00:01' });
    expect(text).toBe('Text with ID.');
  });

  it('chunk spanning multiple cues gets the timestamp of the cue where it starts', () => {
    // This verifies the anchor lookup contract: a chunk starting at pos 0 should
    // be attributed to the first cue, even if it extends into subsequent cues.
    const vtt = `WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nFirst cue.\n\n00:01:00.000 --> 00:01:02.000\nSecond cue.`;
    const { anchors } = parseVtt(vtt);
    // A chunk starting at pos 0 → anchor at pos 0 → timestamp '00:00:01'
    expect(anchors[0]).toEqual({ pos: 0, timestamp: '00:00:01' });
    // A chunk starting at pos >= anchors[1].pos → timestamp '00:01:00'
    expect(anchors[1].timestamp).toBe('00:01:00');
  });
});
