import { createWorker, type Worker } from 'tesseract.js';

let workerPromise: Promise<Worker> | null = null;

async function getWorker(): Promise<Worker> {
  if (!workerPromise) {
    workerPromise = (async () => {
      const worker = await createWorker('eng');
      // Base settings - will be overridden per pass
      await worker.setParameters({
        tessedit_char_whitelist: '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz$£., ', // Allow digits, letters, $, £, comma, period, space
        tessedit_ocr_engine_mode: '1', // Neural nets LSTM engine only (best accuracy)
      });
      return worker;
    })();
  }
  return workerPromise;
}

async function recognizeImageWithPSM(buffer: Buffer, psmMode: string): Promise<OcrResult> {
  const worker = await getWorker();
  
  // Set PSM mode for this pass
  await worker.setParameters({
    tessedit_pageseg_mode: psmMode,
  });
  
  const { data } = await worker.recognize(buffer, {
    rectangle: undefined,
  });
  
  const words: OcrWord[] = (data.words ?? [])
    .map((w: any) => ({
      text: String(w.text ?? '').trim(),
      confidence: Number(w.confidence ?? 0),
      bbox: {
        x0: Number(w.bbox?.x0 ?? 0),
        y0: Number(w.bbox?.y0 ?? 0),
        x1: Number(w.bbox?.x1 ?? 0),
        y1: Number(w.bbox?.y1 ?? 0),
      },
    }))
    .filter((w: OcrWord) => {
      if (w.text.length === 0) return false;
      if (w.confidence >= 25) return true;
      if (w.text.match(/[\d$£]/)) return true;
      if (w.text.length === 1 && w.confidence < 40) return false;
      return false;
    });
  
  return { text: data.text ?? '', words };
}

export type OcrWord = {
  text: string;
  confidence: number;
  bbox: { x0: number; y0: number; x1: number; y1: number };
};

export type OcrResult = {
  text: string;
  words: OcrWord[];
};

export async function recognizeImage(buffer: Buffer): Promise<OcrResult> {
  // Multi-pass OCR: Try 3 different PSM modes and combine results
  // PSM 11 = Sparse text (good for tables with gaps) - best for most tables
  // PSM 6 = Uniform block (good for dense tables)
  // PSM 4 = Single column (good for vertical alignment)
  
  const passes = [
    { mode: '11', name: 'sparse' },
    { mode: '6', name: 'uniform' },
    { mode: '4', name: 'single-column' },
  ];
  
  const allResults = await Promise.all(
    passes.map(pass => recognizeImageWithPSM(buffer, pass.mode))
  );
  
  // Combine words from all passes, prioritizing higher confidence
  const wordMap = new Map<string, OcrWord>();
  
  for (const result of allResults) {
    for (const word of result.words) {
      // Create a key based on position and text to identify same words
      const key = `${Math.round(word.bbox.x0 / 10)}_${Math.round(word.bbox.y0 / 10)}_${word.text.toLowerCase()}`;
      
      const existing = wordMap.get(key);
      if (!existing || word.confidence > existing.confidence) {
        wordMap.set(key, word);
      }
    }
  }
  
  // Also add unique words that might have been missed (different positions)
  const uniqueWords = new Set<string>();
  for (const result of allResults) {
    for (const word of result.words) {
      const key = `${word.text.toLowerCase()}_${Math.round(word.bbox.y0 / 5)}`;
      if (!uniqueWords.has(key)) {
        uniqueWords.add(key);
        // Check if we already have a similar word at this Y position
        const existingAtY = Array.from(wordMap.values()).find(
          w => Math.abs(w.bbox.y0 - word.bbox.y0) < 10 && 
               w.text.toLowerCase() === word.text.toLowerCase()
        );
        if (!existingAtY) {
          const posKey = `${Math.round(word.bbox.x0 / 10)}_${Math.round(word.bbox.y0 / 10)}_${word.text.toLowerCase()}_${word.bbox.x0}`;
          wordMap.set(posKey, word);
        }
      }
    }
  }
  
  const combinedWords = Array.from(wordMap.values());
  
  // Combine text from all passes (use the one with most content)
  const combinedText = allResults
    .map(r => r.text)
    .sort((a, b) => b.length - a.length)[0] || '';
  
  return { text: combinedText, words: combinedWords };
}


