import { parseMoneyToPence } from './money.js';
import type { OcrWord } from './ocr.js';

type BBox = { x0: number; y0: number; x1: number; y1: number };

function normalizeToken(s: string): string {
  return s.trim().toLowerCase().replace(/[^a-z0-9£$.,]/g, '');
}

function centerX(b: BBox): number {
  return (b.x0 + b.x1) / 2;
}

function isLikelyNeededHeader(w: OcrWord): boolean {
  const t = normalizeToken(w.text);
  // Match "Needed", "Need", with or without currency symbols
  return t === 'needed' || t === 'need' || t === 'need$' || t === 'needed$' || t === 'need£' || t === 'needed£';
}

function clusterByLine(words: OcrWord[], yTolerance = 12): OcrWord[][] {
  const sorted = [...words].sort((a, b) => a.bbox.y0 - b.bbox.y0);
  const lines: OcrWord[][] = [];
  for (const w of sorted) {
    const y = w.bbox.y0;
    const last = lines[lines.length - 1];
    if (!last) {
      lines.push([w]);
      continue;
    }
    const lastY = last[0]?.bbox.y0 ?? y;
    if (Math.abs(y - lastY) <= yTolerance) last.push(w);
    else lines.push([w]);
  }
  // sort within each line left-to-right
  for (const line of lines) {
    line.sort((a, b) => a.bbox.x0 - b.bbox.x0);
  }
  return lines;
}

export type NeededParseResult = {
  neededPenceValues: number[];
  rows: { name: string; neededPence: number | null; confidence: number }[];
  totalPence: number;
  debug: {
    header?: { text: string; bbox: BBox };
    columnX0?: number;
    columnX1?: number;
  };
};

export function extractNeededValuesFromWords(words: OcrWord[]): NeededParseResult {
  const candidates = words.filter((w) => isLikelyNeededHeader(w));
  const header =
    candidates.sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0))[0] ??
    candidates.sort((a, b) => (b.text?.length ?? 0) - (a.text?.length ?? 0))[0];

  if (!header) {
    return { neededPenceValues: [], rows: [], totalPence: 0, debug: {} };
  }

  const headerWidth = Math.max(10, header.bbox.x1 - header.bbox.x0);
  const pad = Math.round(headerWidth * 0.9);
  const colX0 = Math.min(header.bbox.x0, header.bbox.x1) - pad;
  const colX1 = Math.max(header.bbox.x0, header.bbox.x1) + pad;
  const minY = header.bbox.y1 + 6;

  // Consider words in rows below the header.
  const belowHeader = words.filter((w) => w.text && w.text.trim() && w.bbox.y0 >= minY);
  const allLines = clusterByLine(belowHeader);

  const rows: { name: string; neededPence: number | null; confidence: number }[] = [];

  for (const line of allLines) {
    // Name is everything to the left of the needed column for that row.
    const nameWords = line
      .filter((w) => w.bbox.x1 < colX0 - 6)
      .map((w) => w.text.trim())
      .filter(Boolean);
    const name = nameWords.join(' ').replace(/\s+/g, ' ').trim();
    
    // Skip rows with no name (likely not a data row)
    if (!name) continue;

    const neededWords = line.filter((w) => {
      const cx = centerX(w.bbox);
      return cx >= colX0 && cx <= colX1;
    });

    // Parse needed value: try joined needed-words, else scan right-to-left.
    let neededPence: number | null = null;
    if (neededWords.length > 0) {
      const neededJoined = neededWords.map((w) => w.text).join(' ');
      neededPence = parseMoneyToPence(neededJoined);
      if (neededPence === null) {
        for (let i = neededWords.length - 1; i >= 0; i--) {
          const v = parseMoneyToPence(neededWords[i]?.text ?? '');
          if (v !== null) {
            neededPence = v;
            break;
          }
        }
      }
    }
    // If no needed value found, neededPence stays null (will show as "-")

    // Calculate confidence: use needed words if present, else use name words
    const confidenceWords = neededWords.length > 0 ? neededWords : nameWords;
    const confidence = confidenceWords.length > 0
      ? Math.round(
          (confidenceWords.reduce((sum, w) => sum + (w.confidence ?? 0), 0) / confidenceWords.length) * 10,
        ) / 10
      : 0;

    rows.push({ name, neededPence, confidence });
  }

  // De-dupe by (name, needed) in case OCR produces overlapping lines.
  const seen = new Set<string>();
  const dedupedRows = rows.filter((r) => {
    const key = `${r.name.toLowerCase()}|${r.neededPence ?? 'null'}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Only include non-null values in the sum
  const neededPenceValues = dedupedRows.filter((r) => r.neededPence !== null).map((r) => r.neededPence!);

  const totalPence = neededPenceValues.reduce((sum, v) => sum + v, 0);
  return {
    neededPenceValues,
    rows: dedupedRows,
    totalPence,
    debug: {
      header: { text: header.text, bbox: header.bbox },
      columnX0: colX0,
      columnX1: colX1,
    },
  };
}

