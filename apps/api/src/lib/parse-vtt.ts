export interface VttAnchor {
  pos: number;       // character offset in the concatenated text
  timestamp: string; // "HH:MM:SS"
}

export interface VttDocument {
  text: string;
  anchors: VttAnchor[];
}

const TIMESTAMP_RE = /^(\d{2}:\d{2}:\d{2})\.\d{3} --> /;
const SKIP_BLOCK_RE = /^(NOTE|STYLE)(\s|$)/;

export function parseVtt(vtt: string): VttDocument {
  const blocks = vtt.split(/\n\n+/).slice(1); // drop WEBVTT header

  let text = '';
  const anchors: VttAnchor[] = [];

  for (const block of blocks) {
    const lines = block.split('\n').map((l) => l.trim());
    if (SKIP_BLOCK_RE.test(lines[0])) continue;

    let match = TIMESTAMP_RE.exec(lines[0]);
    let textStartIndex = 1;
    if (!match && lines.length > 1) {
      match = TIMESTAMP_RE.exec(lines[1]);
      textStartIndex = 2;
    }
    if (!match) continue;

    const cueText = lines.slice(textStartIndex).filter(Boolean).join(' ');
    if (!cueText) continue;

    const separator = text.length > 0 ? ' ' : '';
    anchors.push({ pos: text.length + separator.length, timestamp: match[1] });
    text += separator + cueText;
  }

  return { text, anchors };
}
