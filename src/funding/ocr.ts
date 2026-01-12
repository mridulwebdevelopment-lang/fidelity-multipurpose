import { createWorker, type Worker } from 'tesseract.js';

let workerPromise: Promise<Worker> | null = null;

async function getWorker(): Promise<Worker> {
  if (!workerPromise) {
    workerPromise = (async () => {
      const worker = await createWorker('eng');
      
      // Optimize for table OCR: uniform block of text (PSM 6)
      // This is best for structured tables with consistent layout
      await worker.setParameters({
        tessedit_pageseg_mode: '6', // Uniform block of text (table mode)
        tessedit_char_whitelist: '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz$., ', // Allow digits, letters, $, comma, period, space
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
  
  // Use higher DPI for better accuracy (300 DPI is standard for OCR)
  // Also enable image preprocessing for better recognition
  const { data } = await worker.recognize(buffer, {
    rectangle: undefined, // Process full image
  });
  
  // Filter out very low confidence words (likely OCR errors)
  // Keep words with confidence >= 30 (tesseract default threshold is ~30-40)
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
    .filter((w: OcrWord) => w.text.length > 0 && w.confidence >= 30); // Remove empty and very low confidence
  
  return { text: data.text ?? '', words };
}


