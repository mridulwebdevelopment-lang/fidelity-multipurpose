import { createWorker, type Worker } from 'tesseract.js';

let workerPromise: Promise<Worker> | null = null;

async function getWorker(): Promise<Worker> {
  if (!workerPromise) {
    workerPromise = (async () => {
      const worker = await createWorker('eng');
      
      // Try multiple PSM modes for better accuracy:
      // PSM 6 = Uniform block of text (good for tables)
      // PSM 11 = Sparse text (good for tables with gaps)
      // PSM 4 = Single column (good for vertical tables)
      // Using PSM 11 (sparse text) often works better for tables with spacing
      await worker.setParameters({
        tessedit_pageseg_mode: '11', // Sparse text - better for tables with gaps/spacing
        tessedit_char_whitelist: '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz$£., ', // Allow digits, letters, $, £, comma, period, space
        tessedit_ocr_engine_mode: '1', // Neural nets LSTM engine only (best accuracy)
      });
      
      return worker;
    })();
  }
  return workerPromise;
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
  const worker = await getWorker();
  
  // Process full image with better settings
  const { data } = await worker.recognize(buffer, {
    rectangle: undefined, // Process full image
  });
  
  // Improved word filtering: be more lenient with confidence but filter obvious noise
  // Lower threshold to 25 to catch more valid text, but filter out single-character noise
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
      // Filter out empty text
      if (w.text.length === 0) return false;
      
      // Keep words with reasonable confidence (>= 25)
      if (w.confidence >= 25) return true;
      
      // For low confidence, only keep if it looks like money (contains $, £, or digits)
      if (w.text.match(/[\d$£]/)) return true;
      
      // Filter out single characters with low confidence (likely noise)
      if (w.text.length === 1 && w.confidence < 40) return false;
      
      return false;
    });
  
  return { text: data.text ?? '', words };
}


