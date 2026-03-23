export interface PdfPage {
  text: string;
  pageNumber: number;
}

const PAGE_MARKER_RE = /^--- Page \d+ ---$/m;

export function parsePdf(content: string): PdfPage[] {
  if (!content.trim()) return [];

  const raw = PAGE_MARKER_RE.test(content)
    ? content.split(PAGE_MARKER_RE).slice(1)
    : content.split('\f');

  return raw
    .map((chunk, i) => ({ text: chunk.trim(), pageNumber: i + 1 }))
    .filter((page) => page.text.length > 0);
}
