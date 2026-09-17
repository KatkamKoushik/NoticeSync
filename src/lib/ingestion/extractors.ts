/**
 * Extractor utilities for NoticeSync
 */

export function normalizeText(text: string): string {
  return text.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}

export async function extractPdfText(buffer: Buffer): Promise<string> {
  // pdf-parse v2 uses a class-based API
  const { PDFParse } = await import('pdf-parse');
  const parser = new PDFParse({ data: buffer });
  const textResult = await parser.getText();
  const text = textResult.text || '';
  await parser.destroy();
  return normalizeText(text);
}

export async function extractImageText(buffer: Buffer): Promise<string> {
  const Tesseract = await import('tesseract.js');
  const { data } = await Tesseract.recognize(buffer, 'eng');
  return normalizeText(data.text || '');
}
