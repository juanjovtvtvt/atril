import * as pdfjs from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

/*
 * A PDF has no paragraphs: only text placed at coordinates. This module rebuilds the structure
 * with heuristics: lines from coordinates (splitting columns), drops text that repeats on every
 * page (headers and page numbers), joins lines into paragraphs, mends hyphenated words and uses
 * font size to find headings, which then split the chapters. Pages with no text (scanned) go
 * through OCR (Tesseract).
 */

export interface ConvertOptions {
  chapters: boolean;
  headers: boolean;
  hyphens: boolean;
  ocr: boolean;
}

export type Step = 'extract' | 'ocr' | 'paragraphs' | 'chapters' | 'build';

export interface Block {
  kind: 'h1' | 'h2' | 'p';
  text: string;
}

export interface Chapter {
  title: string;
  blocks: Block[];
}

export interface ConversionResult {
  title: string;
  author: string;
  pageCount: number;
  chapters: Chapter[];
  paragraphCount: number;
  wordCount: number;
  headingCount: number;
  removedLines: number;
  mendedWords: number;
  ocrPages: number;
  twoColumnPages: number;
  quality: 'buena' | 'revisar' | 'baja';
  qualityNote: string;
  firstPageRaw: string[];
}

interface Line {
  text: string;
  x: number;
  right: number;
  y: number;
  size: number;
  page: number;
  pageHeight: number;
}

const nextFrame = () => new Promise((r) => setTimeout(r, 0));
const endsSentence = (s: string) => /[.!?:»"”)…]$/.test(s.trim());
const startsLower = (s: string) => /^[a-záéíóúñüàèìòùç]/.test(s);
const pageNumber = /^([-–—]\s*)?(\d{1,4}|[ivxlcdm]{1,7})(\s*[-–—])?$/i;
/** End-of-line hyphens: normal, soft, non-breaking and Unicode hyphen. */
const lineHyphen = /[a-záéíóúñü][-­‐‑]$/i;

/* ---------- Cleaning up the text that comes out of the PDF ---------- */

const ligatures: Record<string, string> = { 'ﬀ': 'ff', 'ﬁ': 'fi', 'ﬂ': 'fl', 'ﬃ': 'ffi', 'ﬄ': 'ffl', 'ﬅ': 'st', 'ﬆ': 'st', 'Ĳ': 'IJ', 'ĳ': 'ij' };
const spacingAccents: Record<string, string> = { '´': '́', '`': '̀', '¨': '̈', '˜': '̃', '^': '̂' };

export function cleanText(s: string) {
  return (
    s
      .replace(/[ﬀﬁﬂﬃﬄﬅﬆĲĳ]/g, (c) => ligatures[c])
      // An accent stored apart from its letter ("´e", "e´") → "é".
      .replace(/([´`¨˜^])\s?([aeiouAEIOUnN])/g, (_, acc: string, l: string) => (l + spacingAccents[acc]).normalize('NFC'))
      .replace(/([aeiouAEIOU])\s?([´`¨])/g, (_, l: string, acc: string) => (l + spacingAccents[acc]).normalize('NFC'))
      .normalize('NFC')
      .replace(/ /g, ' ')
      .replace(/[ \t]+/g, ' ')
      .replace(/ ([,.;:!?)\]»”])/g, '$1')
      .replace(/([(¿¡«“[]) /g, '$1')
      .trim()
  );
}

function median(values: number[]) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

/* ---------- Lines from coordinates ---------- */

interface Item {
  text: string;
  x: number;
  y: number;
  width: number;
  size: number;
}

/**
 * Groups the fragments into lines. A large horizontal gap (a column's gutter) cuts the line
 * even if it's at the same height: before, both columns got glued together in one line.
 */
function itemsToLines(items: Item[], page: number, pageHeight: number) {
  const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x);
  const lines: Line[] = [];
  let current: Line | null = null;
  let lastRight = 0;
  for (const it of sorted) {
    const sameRow = current && Math.abs(it.y - current.y) <= it.size * 0.45;
    const gap = it.x - lastRight;
    if (!current || !sameRow || gap > it.size * 2.2) {
      if (current) lines.push(current);
      current = { text: it.text, x: it.x, right: it.x + it.width, y: it.y, size: it.size, page, pageHeight };
    } else {
      const needsSpace = gap > it.size * 0.18 && !current.text.endsWith(' ') && !it.text.startsWith(' ');
      current.text += (needsSpace ? ' ' : '') + it.text;
      current.right = Math.max(current.right, it.x + it.width);
      current.size = Math.max(current.size, it.size);
    }
    lastRight = it.x + it.width;
  }
  if (current) lines.push(current);
  return lines;
}

/**
 * Reading order of a page. If there are two columns (many lines confined to each half and
 * few spanning both), it reads: full-width headings at the top, the whole left column, the whole
 * right column, and whatever full-width comes after.
 */
function readingOrder(lines: Line[], pageWidth: number) {
  const mid = pageWidth / 2;
  const left = lines.filter((l) => l.right < mid + pageWidth * 0.04 && l.x < mid - pageWidth * 0.05);
  const right = lines.filter((l) => l.x > mid - pageWidth * 0.04);
  const full = lines.filter((l) => !left.includes(l) && !right.includes(l));
  const isTwoColumn = left.length >= 6 && right.length >= 6 && full.length <= (left.length + right.length) * 0.25;
  if (!isTwoColumn) return { lines: [...lines].sort((a, b) => b.y - a.y || a.x - b.x), twoColumn: false };
  const top = Math.max(...left.map((l) => l.y), ...right.map((l) => l.y));
  const byY = (a: Line, b: Line) => b.y - a.y;
  return {
    lines: [...full.filter((l) => l.y > top).sort(byY), ...left.sort(byY), ...right.sort(byY), ...full.filter((l) => l.y <= top).sort(byY)],
    twoColumn: true,
  };
}

/* ---------- OCR for scanned pages ---------- */

type OcrWorker = Awaited<ReturnType<typeof import('tesseract.js')['createWorker']>>;

async function ocrPage(page: pdfjs.PDFPageProxy, worker: OcrWorker, pageNum: number, pageHeight: number): Promise<Line[]> {
  // At 2.5x the text measures about 30 px tall: enough for Tesseract to be accurate.
  const viewport = page.getViewport({ scale: 2.5 });
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: ctx, viewport }).promise;
  const { data } = await worker.recognize(canvas);
  canvas.width = canvas.height = 0;

  // Turns the recognized text into lines with "coordinates": a blank line means a new paragraph.
  const lines: Line[] = [];
  let y = pageHeight - 40;
  for (const raw of data.text.split('\n')) {
    const text = raw.trim();
    if (!text) {
      y -= 12;
      continue;
    }
    lines.push({ text, x: 50, right: 500, y, size: 10, page: pageNum, pageHeight });
    y -= 13;
  }
  return lines;
}

/* ---------- Extraction ---------- */

async function extractLines(
  pdf: pdfjs.PDFDocumentProxy,
  opts: ConvertOptions,
  onProgress: (step: Step, n: number, total: number) => void,
  signal?: AbortSignal,
) {
  const all: Line[] = [];
  const empty: number[] = [];
  let twoColumnPages = 0;
  for (let n = 1; n <= pdf.numPages; n++) {
    if (signal?.aborted) throw new DOMException('Cancelado', 'AbortError');
    const page = await pdf.getPage(n);
    const { width, height } = page.getViewport({ scale: 1 });
    const content = await page.getTextContent();
    const items: Item[] = content.items
      .filter((it): it is Extract<typeof it, { str: string }> => 'str' in it && it.str.trim().length > 0)
      .map((it) => {
        const [, , c, d, e, f] = it.transform as number[];
        return { text: it.str, x: e, y: f, width: it.width, size: Math.hypot(c, d) || it.height || 10 };
      });
    const lines = itemsToLines(items, n, height);
    const chars = lines.reduce((s, l) => s + l.text.length, 0);
    if (chars < 40) empty.push(n);
    const ordered = readingOrder(lines, width);
    if (ordered.twoColumn) twoColumnPages++;
    all.push(...ordered.lines);
    page.cleanup();
    onProgress('extract', n, pdf.numPages);
    await nextFrame();
  }

  // Pages without selectable text: OCR, if it's on.
  let ocrPages = 0;
  if (opts.ocr && empty.length > 0) {
    onProgress('ocr', 0, empty.length);
    const { createWorker } = await import('tesseract.js');
    const worker = await createWorker(['spa', 'eng']);
    try {
      for (let i = 0; i < empty.length; i++) {
        if (signal?.aborted) throw new DOMException('Cancelado', 'AbortError');
        const n = empty[i];
        const page = await pdf.getPage(n);
        const ocrLines = await ocrPage(page, worker, n, page.getViewport({ scale: 1 }).height);
        page.cleanup();
        if (ocrLines.length) {
          // Puts the recognized lines in that page's place, keeping the order.
          const at = all.findIndex((l) => l.page > n);
          all.splice(at === -1 ? all.length : at, 0, ...ocrLines);
          ocrPages++;
        }
        onProgress('ocr', i + 1, empty.length);
      }
    } finally {
      await worker.terminate();
    }
  }

  for (const l of all) l.text = cleanText(l.text);
  return { lines: all.filter((l) => l.text.length > 0), ocrPages, twoColumnPages, emptyPages: empty.length };
}

/** Lines in the top or bottom band that repeat across many pages are headers or footers. */
function dropRunningHeads(lines: Line[], pageCount: number) {
  const inBand = (l: Line) => l.y > l.pageHeight * 0.9 || l.y < l.pageHeight * 0.08;
  const key = (l: Line) => l.text.toLowerCase().replace(/\d+/g, '#');
  const pagesByKey = new Map<string, Set<number>>();
  for (const l of lines) {
    if (!inBand(l)) continue;
    const k = key(l);
    if (!pagesByKey.has(k)) pagesByKey.set(k, new Set());
    pagesByKey.get(k)!.add(l.page);
  }
  const threshold = Math.max(3, Math.ceil(pageCount * 0.3));
  const kept: Line[] = [];
  let removed = 0;
  for (const l of lines) {
    const repeated = inBand(l) && (pagesByKey.get(key(l))?.size ?? 0) >= threshold;
    if (repeated || (inBand(l) && pageNumber.test(l.text))) removed++;
    else kept.push(l);
  }
  return { kept, removed };
}

function bodySize(lines: Line[]) {
  const chars = new Map<number, number>();
  for (const l of lines) {
    const s = Math.round(l.size * 2) / 2;
    chars.set(s, (chars.get(s) ?? 0) + l.text.length);
  }
  let best = 10;
  let max = 0;
  for (const [s, c] of chars) if (c > max) [best, max] = [s, c];
  return best;
}

function buildBlocks(lines: Line[], opts: ConvertOptions) {
  const body = bodySize(lines);
  const isBody = (l: Line) => Math.abs(l.size - body) < 1;
  const gaps: number[] = [];
  for (let i = 1; i < lines.length; i++) {
    const a = lines[i - 1];
    const b = lines[i];
    if (a.page === b.page && isBody(a) && isBody(b) && a.y > b.y) gaps.push(a.y - b.y);
  }
  const lineGap = median(gaps.filter((g) => g > 0)) || body * 1.3;
  const bodyLines = lines.filter(isBody);
  const leftMargin = median(bodyLines.map((l) => l.x));
  const lineWidth = median(bodyLines.map((l) => l.right - l.x));

  const blocks: Block[] = [];
  let para = '';
  let prev: Line | null = null;
  let mended = 0;
  const flush = () => {
    if (para.trim()) blocks.push({ kind: 'p', text: cleanText(para) });
    para = '';
  };

  for (const line of lines) {
    const isHeading = line.size >= body * 1.2 && line.text.length < 140 && !pageNumber.test(line.text);
    if (isHeading) {
      flush();
      const kind = line.size >= body * 1.55 ? 'h1' : 'h2';
      const last = blocks[blocks.length - 1];
      // A heading split over two lines arrives as two consecutive heading lines.
      if (prev && last && last.kind === kind && prev.page === line.page && prev.y - line.y < line.size * 1.8 && prev.y > line.y) {
        last.text += ' ' + line.text;
      } else {
        blocks.push({ kind, text: line.text });
      }
      prev = line;
      continue;
    }

    let startNew = !para;
    if (prev && para) {
      const pageBreak = prev.page !== line.page;
      // In two columns the next column starts above: that jump isn't a new paragraph.
      const columnJump = !pageBreak && line.y > prev.y;
      const gap = prev.y - line.y;
      const prevEnds = endsSentence(para);
      const prevShort = prev.right - prev.x < lineWidth * 0.75;
      if (pageBreak || columnJump) startNew = prevEnds && !startsLower(line.text);
      else if (gap > lineGap * 1.45) startNew = true;
      else if (prevEnds && line.x > leftMargin + body * 0.9 && line.x - prev.x > body * 0.5) startNew = true;
      else if (prevEnds && prevShort) startNew = true;
    }

    if (startNew) {
      flush();
      para = line.text;
    } else if (opts.hyphens && lineHyphen.test(para) && startsLower(line.text)) {
      // "sufi-" + "ciente" → "suficiente". Only if the next one starts lowercase: "Norte-" + "Sur" stays.
      para = para.slice(0, -1) + line.text;
      mended++;
    } else {
      para += ' ' + line.text;
    }
    prev = line;
  }
  flush();
  return { blocks, mended };
}

const wordsIn = (blocks: Block[]) => blocks.reduce((n, b) => n + b.text.split(/\s+/).filter(Boolean).length, 0);

function chunkByWords(blocks: Block[], prefix: string, size = 4000): Chapter[] {
  const chapters: Chapter[] = [];
  let current: Block[] = [];
  let words = 0;
  for (const b of blocks) {
    current.push(b);
    words += b.text.split(/\s+/).length;
    if (words >= size && b.kind === 'p') {
      chapters.push({ title: `${prefix} ${chapters.length + 1}`, blocks: current });
      current = [];
      words = 0;
    }
  }
  if (current.length) chapters.push({ title: `${prefix} ${chapters.length + 1}`, blocks: current });
  return chapters;
}

function splitChapters(blocks: Block[], opts: ConvertOptions): Chapter[] {
  // A single big heading is the document title, not a chapter: then split by subheadings.
  const count = (k: Block['kind']) => blocks.filter((b) => b.kind === k).length;
  const level = count('h1') >= 2 ? 'h1' : count('h2') >= 1 ? 'h2' : count('h1') === 1 ? 'h1' : null;
  if (!opts.chapters || !level) return chunkByWords(blocks, opts.chapters ? 'Parte' : 'Sección');

  const chapters: Chapter[] = [];
  const opening = level === 'h2' ? blocks.find((b) => b.kind === 'h1') : undefined;
  let current: Chapter = { title: opening?.text ?? 'Inicio', blocks: [] };
  for (const b of blocks) {
    if (b.kind === level) {
      if (current.blocks.some((x) => x.kind === 'p')) chapters.push(current);
      current = { title: b.text, blocks: [b] };
    } else {
      current.blocks.push(b);
    }
  }
  if (current.blocks.length) chapters.push(current);

  // A huge chapter weighs down the reader: split it, keeping its title.
  return chapters.flatMap((c) => {
    if (wordsIn(c.blocks) <= 12000) return [c];
    return chunkByWords(c.blocks, c.title, 8000).map((part, i) => ({ ...part, title: i === 0 ? c.title : `${c.title} (${i + 1})` }));
  });
}

export async function convertPdf(
  file: Blob,
  fileName: string,
  opts: ConvertOptions,
  onProgress: (step: Step, done: number, total: number) => void,
  signal?: AbortSignal,
): Promise<ConversionResult> {
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  try {
    const pageCount = pdf.numPages;
    const meta = await pdf.getMetadata().catch(() => null);
    const info = (meta?.info ?? {}) as { Title?: string; Author?: string };

    onProgress('extract', 0, pageCount);
    const { lines: raw, ocrPages, twoColumnPages, emptyPages } = await extractLines(pdf, opts, onProgress, signal);
    const firstPageRaw = raw.filter((l) => l.page === 1).slice(0, 14).map((l) => l.text);
    const totalChars = raw.reduce((n, l) => n + l.text.length, 0);

    onProgress('paragraphs', 0, 1);
    const { kept, removed } = opts.headers ? dropRunningHeads(raw, pageCount) : { kept: raw, removed: 0 };
    const { blocks, mended } = buildBlocks(kept, opts);
    onProgress('paragraphs', 1, 1);
    await nextFrame();

    onProgress('chapters', 0, 1);
    const chapters = splitChapters(blocks, opts);
    onProgress('chapters', 1, 1);

    const goodTitle = info.Title && info.Title.trim().length > 2 && !/^(untitled|sin t[ií]tulo)|\.(docx?|pdf|pptx?)$/i.test(info.Title.trim());
    const firstHeading = blocks.find((b) => b.kind === 'h1')?.text;
    const title = goodTitle ? cleanText(info.Title!) : firstHeading ?? fileName.replace(/\.pdf$/i, '').replace(/[-_]+/g, ' ');
    const author = info.Author?.trim() ? cleanText(info.Author) : 'Autor desconocido';
    const headingCount = blocks.filter((b) => b.kind !== 'p').length;
    const avgChars = totalChars / Math.max(1, pageCount);

    let quality: ConversionResult['quality'] = 'buena';
    let qualityNote = 'Texto corrido, se ve bien.';
    if (emptyPages > 0 && !opts.ocr) {
      quality = 'baja';
      qualityNote = `${emptyPages} ${emptyPages === 1 ? 'página no tiene' : 'páginas no tienen'} texto seleccionable (escaneadas). Activa el reconocimiento de texto (OCR).`;
    } else if (ocrPages > 0) {
      quality = 'revisar';
      qualityNote = `Reconocí ${ocrPages} ${ocrPages === 1 ? 'página escaneada' : 'páginas escaneadas'} con OCR: revisa nombres y números.`;
    } else if (avgChars < 120) {
      quality = 'baja';
      qualityNote = 'Casi no tiene texto seleccionable.';
    } else if (headingCount === 0 && pageCount > 10) {
      quality = 'revisar';
      qualityNote = 'No encontré títulos, así que el índice va por partes.';
    }
    if (twoColumnPages > 0) qualityNote += ` Ordené ${twoColumnPages} ${twoColumnPages === 1 ? 'página' : 'páginas'} a dos columnas.`;

    return {
      title,
      author,
      pageCount,
      chapters,
      paragraphCount: blocks.filter((b) => b.kind === 'p').length,
      wordCount: wordsIn(blocks),
      headingCount,
      removedLines: removed,
      mendedWords: mended,
      ocrPages,
      twoColumnPages,
      quality,
      qualityNote,
      firstPageRaw,
    };
  } finally {
    await pdf.destroy();
  }
}
