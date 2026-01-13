import { parseMoneyToPence } from './money.js';
import type { OcrWord } from './ocr.js';

type BBox = { x0: number; y0: number; x1: number; y1: number };

function normalizeToken(s: string): string {
  // More lenient normalization - keep more characters that might be in headers
  return s.trim().toLowerCase().replace(/[^a-z0-9£$.,\s]/g, '');
}

function centerX(b: BBox): number {
  return (b.x0 + b.x1) / 2;
}

function isLikelyNeededHeader(w: OcrWord): boolean {
  const t = normalizeToken(w.text);
  // More flexible matching for "Needed" header - handle OCR variations
  const normalized = t.replace(/\s+/g, ''); // Remove spaces
  return (
    normalized === 'needed' || 
    normalized === 'need' || 
    normalized.includes('needed') || 
    normalized.includes('need') ||
    // Handle common OCR mistakes
    normalized === 'needed' || // double 'd'
    normalized.startsWith('need') && normalized.length <= 7 // "need" with possible OCR errors
  );
}

function clusterByLine(words: OcrWord[], yTolerance = 15): OcrWord[][] {
  // Increased yTolerance to handle slightly misaligned rows
  const sorted = [...words].sort((a, b) => a.bbox.y0 - b.bbox.y0);
  const lines: OcrWord[][] = [];
  for (const w of sorted) {
    const y = w.bbox.y0;
    const last = lines[lines.length - 1];
    if (!last) {
      lines.push([w]);
      continue;
    }
    // Use average Y position of line for better clustering
    const lastY = last.reduce((sum, word) => sum + word.bbox.y0, 0) / last.length;
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
  const pad = Math.round(headerWidth * 1.2); // Increased padding to catch slightly misaligned values
  const colX0 = Math.min(header.bbox.x0, header.bbox.x1) - pad;
  const colX1 = Math.max(header.bbox.x0, header.bbox.x1) + pad;
  const minY = header.bbox.y1 + 4; // Reduced gap to catch rows closer to header

  // Consider words in rows below the header.
  const belowHeader = words.filter((w) => w.text && w.text.trim() && w.bbox.y0 >= minY);
  const allLines = clusterByLine(belowHeader);

  const rows: { name: string; neededPence: number | null; confidence: number }[] = [];

  for (const line of allLines) {
    // Name is everything to the left of the needed column for that row.
    // More lenient filtering to catch names that might be slightly overlapping
    const nameWords = line
      .filter((w) => centerX(w.bbox) < colX0 - 3) // Use centerX for better alignment
      .map((w) => w.text.trim())
      .filter(Boolean);
    const name = nameWords.join(' ').replace(/\s+/g, ' ').trim();
    
    // Skip rows with no name (likely not a data row)
    // But allow rows with just numbers/currency in name position (might be misread)
    if (!name || name.length < 1) continue;

    // Look for money values in the needed column area, with more lenient matching
    const neededWords = line.filter((w) => {
      const cx = centerX(w.bbox);
      return cx >= colX0 && cx <= colX1;
    });

    // Also check words slightly to the right of the column (in case of misalignment)
    const rightWords = line.filter((w) => {
      const cx = centerX(w.bbox);
      return cx > colX1 && cx <= colX1 + 50; // Allow 50px to the right
    });
    
    // Combine both sets, prioritizing column words
    const allNeededWords = [...neededWords, ...rightWords];

    // Parse needed value: try multiple strategies
    let neededPence: number | null = null;
    if (allNeededWords.length > 0) {
      // Strategy 1: Join all words in the column
      const neededJoined = allNeededWords.map((w) => w.text).join(' ');
      neededPence = parseMoneyToPence(neededJoined);
      
      // Strategy 2: Try each word individually (right-to-left, as money is usually right-aligned)
      if (neededPence === null) {
        for (let i = allNeededWords.length - 1; i >= 0; i--) {
          const v = parseMoneyToPence(allNeededWords[i]?.text ?? '');
          if (v !== null) {
            neededPence = v;
            break;
          }
        }
      }
      
      // Strategy 3: Try joining just the last few words (often the currency symbol and number are separate)
      if (neededPence === null && allNeededWords.length >= 2) {
        const lastTwo = allNeededWords.slice(-2).map((w) => w.text).join(' ');
        neededPence = parseMoneyToPence(lastTwo);
      }
    }
    
    // Strategy 4: If still nothing, check the entire line for any money value
    if (neededPence === null) {
      const wholeLine = line.map((w) => w.text).join(' ');
      neededPence = parseMoneyToPence(wholeLine);
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

