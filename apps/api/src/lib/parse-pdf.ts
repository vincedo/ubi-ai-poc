export interface PdfAnchor {
  pos: number;        // character offset in the concatenated text
  pageNumber: number;
}

export interface PdfDocument {
  text: string;
  anchors: PdfAnchor[];
}

const PAGE_MARKER_RE = /^--- Page \d+ ---$/m;

export function parsePdf(content: string): PdfDocument {
  if (!content.trim()) return { text: '', anchors: [] };

  const raw = PAGE_MARKER_RE.test(content)
    ? content.split(PAGE_MARKER_RE).slice(1)
    : content.split('\f');

  let text = '';
  const anchors: PdfAnchor[] = [];

  raw.forEach((pageText, i) => {
    const trimmed = pageText.trim();
    if (!trimmed) return;

    const separator = text.length > 0 ? '\n' : '';
    anchors.push({ pos: text.length + separator.length, pageNumber: i + 1 });
    text += separator + trimmed;
  });

  return { text, anchors };
}
