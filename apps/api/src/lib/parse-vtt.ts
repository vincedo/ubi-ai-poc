export interface VttCue {
  text: string;
  timestamp: string;
}

const TIMESTAMP_RE = /^(\d{2}:\d{2}:\d{2})\.\d{3} --> /;
const SKIP_BLOCK_RE = /^(NOTE|STYLE)(\s|$)/;

export function parseVtt(vtt: string): VttCue[] {
  const blocks = vtt.split(/\n\n+/).slice(1); // drop WEBVTT header

  return blocks.flatMap((block) => {
    const lines = block.split('\n').map((l) => l.trim());
    if (SKIP_BLOCK_RE.test(lines[0])) return [];

    const match = TIMESTAMP_RE.exec(lines[0]);
    if (!match) return [];

    const text = lines.slice(1).filter(Boolean).join(' ');
    if (!text) return [];

    return [{ text, timestamp: match[1] }];
  });
}
