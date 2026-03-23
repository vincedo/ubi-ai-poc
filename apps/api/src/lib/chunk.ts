import sbd from 'sbd';

export type Citation =
  | { timestamp: string; pageNumber?: never }
  | { pageNumber: number; timestamp?: never };

export interface Chunk {
  text: string;
  citation: Citation;
  chunkIndex: number;
}

export interface ChunkOptions {
  chunkSize: number;
  chunkOverlap: number;
  sentenceAwareSplitting: boolean;
}

export function chunkText(
  text: string,
  citation: Citation,
  startIndex = 0,
  options: ChunkOptions = { chunkSize: 2000, chunkOverlap: 400, sentenceAwareSplitting: false },
): Chunk[] {
  const { chunkSize, chunkOverlap, sentenceAwareSplitting } = options;
  const chunks: Chunk[] = [];
  let pos = 0;

  while (pos < text.length) {
    let end = Math.min(pos + chunkSize, text.length);

    if (sentenceAwareSplitting && end < text.length) {
      const window = text.slice(pos, end);
      const sentenceList = sbd.sentences(window);
      if (sentenceList.length > 1) {
        // Include all sentences except the last (which may be incomplete).
        // Reconstruct the text from complete sentences to find the boundary.
        let boundaryPos = 0;
        for (let i = 0; i < sentenceList.length - 1; i++) {
          boundaryPos = window.indexOf(sentenceList[i], boundaryPos) + sentenceList[i].length;
        }
        if (boundaryPos > 0) {
          end = pos + boundaryPos;
        }
      }
      // If only one sentence found, fall back to exact character split
    }

    chunks.push({
      text: text.slice(pos, end),
      citation,
      chunkIndex: startIndex + chunks.length,
    });

    const step = chunkSize - chunkOverlap;
    pos += step > 0 ? step : end - pos;
  }

  return chunks;
}
