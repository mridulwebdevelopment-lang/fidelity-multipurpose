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
  
  // Direct matches
  if (normalized === 'needed' || normalized === 'need') return true;
  
  // Contains "need" (handles variations like "needed", "needing", etc.)
  if (normalized.includes('need')) return true;
  
  // Handle common OCR mistakes: O->0, I->1, l->1, etc.
  const ocrVariations = normalized
    .replace(/0/g, 'o')
    .replace(/1/g, 'i')
    .replace(/5/g, 's');
  if (ocrVariations.includes('need')) return true;
  
  // Very lenient: if it's 4-7 chars and contains 'n' and 'd', might be "needed"
  if (normalized.length >= 4 && normalized.length <= 7) {
    const hasN = normalized.includes('n');
    const hasD = normalized.includes('d') || normalized.includes('0'); // 0 might be O
    if (hasN && hasD) return true;
  }
  
  return false;
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
  // Multi-pass parsing: Try multiple strategies and combine results
  
  console.log('[Parse] Total words from OCR:', words.length);
  const candidates = words.filter((w) => isLikelyNeededHeader(w));
  console.log('[Parse] Header candidates found:', candidates.length, candidates.map(c => `${c.text} (conf: ${c.confidence})`));
  
  const header =
    candidates.sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0))[0] ??
    candidates.sort((a, b) => (b.text?.length ?? 0) - (a.text?.length ?? 0))[0];

  if (!header) {
    console.log('[Parse] No "Needed" header found, using fallback parser...');
    // Fallback: if we can't find the "Needed" header, infer the needed column by locating
    // the densest vertical cluster of money-like tokens (right-side amounts column).
    const moneyWords = words
      .map((w) => ({ w, p: parseMoneyToPence(w.text) }))
      .filter((x) => x.p !== null);

    console.log('[Parse] Fallback: Found', moneyWords.length, 'money words');
    if (moneyWords.length < 2) {
      console.log('[Parse] Fallback: Not enough money words, returning empty');
      return { neededPenceValues: [], rows: [], totalPence: 0, debug: {} };
    }

    // Bucket by X center to find the most common "money column"
    const bucketSize = 40;
    const buckets = new Map<number, { count: number; xs: number[] }>();
    for (const { w } of moneyWords) {
      const cx = centerX(w.bbox);
      const key = Math.round(cx / bucketSize) * bucketSize;
      const cur = buckets.get(key) ?? { count: 0, xs: [] };
      cur.count += 1;
      cur.xs.push(cx);
      buckets.set(key, cur);
    }

    const best = [...buckets.entries()].sort((a, b) => b[1].count - a[1].count)[0];
    if (!best) {
      console.log('[Parse] Fallback: Could not find money column cluster');
      return { neededPenceValues: [], rows: [], totalPence: 0, debug: {} };
    }
    console.log('[Parse] Fallback: Found money column at X ~', best[0], 'with', best[1].count, 'values');

    const xs = best[1].xs.sort((a, b) => a - b);
    const medianCx = xs[Math.floor(xs.length / 2)] ?? best[0];
    const colX0 = medianCx - 120;
    const colX1 = medianCx + 120;

    const allLines = clusterByLine(words.filter((w) => w.text && w.text.trim()), 15);
    const allRows: { name: string; neededPence: number | null; confidence: number }[] = parseRowsFromLines(
      allLines,
      colX0,
      colX1,
    );

    // De-dupe by (name, needed)
    const seen = new Set<string>();
    const dedupedRows = allRows.filter((r) => {
      const key = `${r.name.toLowerCase()}|${r.neededPence ?? 'null'}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    const neededPenceValues = dedupedRows.filter((r) => r.neededPence !== null).map((r) => r.neededPence!);
    const totalPence = neededPenceValues.reduce((sum, v) => sum + v, 0);

    return {
      neededPenceValues,
      rows: dedupedRows,
      totalPence,
      debug: { columnX0: colX0, columnX1: colX1 },
    };
  }

  console.log('[Parse] Found header:', header.text, 'at confidence', header.confidence);
  console.log('[Parse] Found header:', header.text, 'at confidence', header.confidence);
  const headerWidth = Math.max(10, header.bbox.x1 - header.bbox.x0);
  const pad = Math.round(headerWidth * 1.2);
  const colX0 = Math.min(header.bbox.x0, header.bbox.x1) - pad;
  const colX1 = Math.max(header.bbox.x0, header.bbox.x1) + pad;
  const minY = header.bbox.y1 + 4;
  console.log('[Parse] Column bounds: X', colX0, 'to', colX1, ', Y >=', minY);
  console.log('[Parse] Column bounds: X', colX0, 'to', colX1, ', Y >=', minY);

  // Consider words in rows below the header.
  const belowHeader = words.filter((w) => w.text && w.text.trim() && w.bbox.y0 >= minY);
  
  // Try multiple clustering strategies with different tolerances
  const clusteringStrategies = [
    { tolerance: 15, name: 'normal' },
    { tolerance: 20, name: 'loose' },
    { tolerance: 10, name: 'tight' },
  ];
  
  const allRows: { name: string; neededPence: number | null; confidence: number }[] = [];
  
  // Pass 1: Try with different clustering tolerances
  for (const strategy of clusteringStrategies) {
    const allLines = clusterByLine(belowHeader, strategy.tolerance);
    const rows = parseRowsFromLines(allLines, colX0, colX1);
    allRows.push(...rows);
  }
  
  // Pass 2: Try with wider column detection
  const widerColX0 = colX0 - 20;
  const widerColX1 = colX1 + 20;
  const allLinesWide = clusterByLine(belowHeader, 15);
  const rowsWide = parseRowsFromLines(allLinesWide, widerColX0, widerColX1);
  allRows.push(...rowsWide);
  
  // Pass 3: Try with tighter column detection
  const tighterColX0 = colX0 + 10;
  const tighterColX1 = colX1 - 10;
  const allLinesTight = clusterByLine(belowHeader, 12);
  const rowsTight = parseRowsFromLines(allLinesTight, tighterColX0, tighterColX1);
  allRows.push(...rowsTight);
  
  // Combine and deduplicate all rows from multiple passes
  const rows: { name: string; neededPence: number | null; confidence: number }[] = [];

function parseRowsFromLines(
  allLines: OcrWord[][],
  colX0: number,
  colX1: number
): { name: string; neededPence: number | null; confidence: number }[] {
  const rows: { name: string; neededPence: number | null; confidence: number }[] = [];
  
  for (const line of allLines) {
    // Name is everything to the left of the needed column for that row.
    const nameWords = line
      .filter((w) => centerX(w.bbox) < colX0 - 3)
      .map((w) => w.text.trim())
      .filter(Boolean);
    const name = nameWords.join(' ').replace(/\s+/g, ' ').trim();
    
    // Skip rows with no name (likely not a data row)
    if (!name || name.length < 1) continue;

    // Look for money values in the needed column area
    const neededWords = line.filter((w) => {
      const cx = centerX(w.bbox);
      return cx >= colX0 && cx <= colX1;
    });

    // Also check words slightly to the right of the column
    const rightWords = line.filter((w) => {
      const cx = centerX(w.bbox);
      return cx > colX1 && cx <= colX1 + 50;
    });
    
    // Combine both sets
    const allNeededWords = [...neededWords, ...rightWords];

    // Parse needed value: try multiple strategies
    let neededPence: number | null = null;
    if (allNeededWords.length > 0) {
      // Strategy 1: Join all words in the column
      const neededJoined = allNeededWords.map((w) => w.text).join(' ');
      neededPence = parseMoneyToPence(neededJoined);
      
      // Strategy 2: Try each word individually (right-to-left)
      if (neededPence === null) {
        for (let i = allNeededWords.length - 1; i >= 0; i--) {
          const v = parseMoneyToPence(allNeededWords[i]?.text ?? '');
          if (v !== null) {
            neededPence = v;
            break;
          }
        }
      }
      
      // Strategy 3: Try joining just the last few words
      if (neededPence === null && allNeededWords.length >= 2) {
        const lastTwo = allNeededWords.slice(-2).map((w) => w.text).join(' ');
        neededPence = parseMoneyToPence(lastTwo);
      }
      
      // Strategy 4: Try first few words
      if (neededPence === null && allNeededWords.length >= 2) {
        const firstTwo = allNeededWords.slice(0, 2).map((w) => w.text).join(' ');
        neededPence = parseMoneyToPence(firstTwo);
      }
    }
    
    // Strategy 5: Check the entire line for any money value
    if (neededPence === null) {
      const wholeLine = line.map((w) => w.text).join(' ');
      neededPence = parseMoneyToPence(wholeLine);
    }

    // Calculate confidence
    const confidenceWords = neededWords.length > 0 ? neededWords : nameWords;
    const confidence = confidenceWords.length > 0
      ? Math.round(
          (confidenceWords.reduce((sum, w) => sum + (w.confidence ?? 0), 0) / confidenceWords.length) * 10,
        ) / 10
      : 0;

    rows.push({ name, neededPence, confidence });
  }
  
  return rows;
}

  // Combine and deduplicate all rows from multiple passes
  // Use a map to merge similar rows, keeping the one with highest confidence or best value
  const rowMap = new Map<string, { name: string; neededPence: number | null; confidence: number }>();
  
  for (const row of allRows) {
    // Create a key based on normalized name (fuzzy matching)
    const normalizedName = row.name.toLowerCase().trim().replace(/\s+/g, ' ');
    const key = `${normalizedName}|${row.neededPence ?? 'null'}`;
    
    const existing = rowMap.get(key);
    if (!existing) {
      rowMap.set(key, row);
    } else {
      // Keep the row with higher confidence, or if same confidence, prefer one with a value
      if (row.confidence > existing.confidence || 
          (row.confidence === existing.confidence && row.neededPence !== null && existing.neededPence === null)) {
        rowMap.set(key, row);
      }
    }
  }
  
  // Also check for similar names (fuzzy match) - if names are very similar, merge them
  const finalRows: { name: string; neededPence: number | null; confidence: number }[] = [];
  const processed = new Set<string>();
  
  for (const [key, row] of rowMap.entries()) {
    if (processed.has(key)) continue;
    
    // Check for similar rows (same Y position range, similar name)
    const similarRows = Array.from(rowMap.entries()).filter(([k, r]) => {
      if (k === key) return true;
      const name1 = row.name.toLowerCase().trim();
      const name2 = r.name.toLowerCase().trim();
      // Check if names are similar (one contains the other or very close)
      const similarity = name1.length > 0 && name2.length > 0 && 
        (name1.includes(name2) || name2.includes(name1) || 
         Math.abs(name1.length - name2.length) <= 2);
      return similarity && (r.neededPence === row.neededPence || 
                           (r.neededPence !== null && row.neededPence !== null));
    });
    
    // Pick the best row from similar ones
    const bestRow = similarRows
      .map(([_, r]) => r)
      .sort((a, b) => {
        if (a.confidence !== b.confidence) return b.confidence - a.confidence;
        if (a.neededPence !== null && b.neededPence === null) return -1;
        if (a.neededPence === null && b.neededPence !== null) return 1;
        return a.name.length - b.name.length; // Prefer longer names (more complete)
      })[0];
    
    finalRows.push(bestRow);
    similarRows.forEach(([k]) => processed.add(k));
  }
  
  const dedupedRows = finalRows;

  // Only include non-null values in the sum
  const neededPenceValues = dedupedRows.filter((r) => r.neededPence !== null).map((r) => r.neededPence!);

  const totalPence = neededPenceValues.reduce((sum, v) => sum + v, 0);
  
  console.log('[Parse] Final result:', {
    totalRows: dedupedRows.length,
    rowsWithValues: neededPenceValues.length,
    totalPence: totalPence,
    sampleRows: dedupedRows.slice(0, 3).map(r => ({ name: r.name, value: r.neededPence })),
  });
  
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

