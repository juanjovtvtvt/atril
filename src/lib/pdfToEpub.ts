import * as pdfjs from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

/*
 * A PDF has no paragraphs: only text placed at coordinates. This module rebuilds the structure
 * with heuristics: lines from coordinates, drops text that repeats on every page (headers and
 * page numbers), joins lines into paragraphs, mends hyphenated words and uses font size to find
 * headings, which then split the chapters.
 */

export interface ConvertOptions {
  chapters: boolean;
  headers: boolean;
  hyphens: boolean;
}

export type Step = 'extract' | 'paragraphs' | 'chapters' | 'build';

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
const endsSentence = (s: string) => /[.!?:»"”)]$/.test(s.trim());
const startsLower = (s: string) => /^[a-záéíóúñü]/.test(s);
const pageNumber = /^([-–—]\s*)?(\d{1,4}|[ivxlcdm]{1,7})(\s*[-–—])?$/i;

function median(values: number[]) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

async function extractLines(pdf: pdfjs.PDFDocumentProxy, onPage: (n: number) => void, signal?: AbortSignal) {
  const lines: Line[] = [];
  for (let n = 1; n <= pdf.numPages; n++) {
    if (signal?.aborted) throw new DOMException('Cancelado', 'AbortError');
    const page = await pdf.getPage(n);
    const { height } = page.getViewport({ scale: 1 });
    const content = await page.getTextContent();
    const items = content.items
      .filter((it): it is Extract<typeof it, { str: string }> => 'str' in it && it.str.trim().length > 0)
      .map((it) => {
        const [, , c, d, e, f] = it.transform as number[];
        return { text: it.str, x: e, y: f, width: it.width, size: Math.hypot(c, d) || it.height || 10 };
      })
      .sort((a, b) => b.y - a.y || a.x - b.x);

    let current: Line | null = null;
    let lastRight = 0;
    for (const it of items) {
      if (!current || Math.abs(it.y - current.y) > it.size * 0.45) {
        if (current) lines.push(current);
        current = { text: it.text, x: it.x, right: it.x + it.width, y: it.y, size: it.size, page: n, pageHeight: height };
      } else {
        const gap = it.x - lastRight;
        const needsSpace = gap > it.size * 0.15 && !current.text.endsWith(' ') && !it.text.startsWith(' ');
        current.text += (needsSpace ? ' ' : '') + it.text;
        current.right = Math.max(current.right, it.x + it.width);
        current.x = Math.min(current.x, it.x);
        current.size = Math.max(current.size, it.size);
      }
      lastRight = it.x + it.width;
    }
    if (current) lines.push(current);
    page.cleanup();
    onPage(n);
    await nextFrame();
  }
  for (const l of lines) l.text = l.text.replace(/\s+/g, ' ').trim();
  return lines.filter((l) => l.text.length > 0);
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
  const gaps: number[] = [];
  for (let i = 1; i < lines.length; i++) {
    const a = lines[i - 1];
    const b = lines[i];
    if (a.page === b.page && Math.abs(a.size - body) < 1 && Math.abs(b.size - body) < 1) gaps.push(a.y - b.y);
  }
  const lineGap = median(gaps.filter((g) => g > 0)) || body * 1.3;
  const leftMargin = median(lines.filter((l) => Math.abs(l.size - body) < 1).map((l) => l.x));
  const rightEdge = median(lines.filter((l) => Math.abs(l.size - body) < 1).map((l) => l.right));

  const blocks: Block[] = [];
  let para = '';
  let prev: Line | null = null;
  let mended = 0;
  const flush = () => {
    if (para.trim()) blocks.push({ kind: 'p', text: para.trim() });
    para = '';
  };

  for (const line of lines) {
    const isHeading = line.size >= body * 1.2 && line.text.length < 140 && !pageNumber.test(line.text);
    if (isHeading) {
      flush();
      const kind = line.size >= body * 1.55 ? 'h1' : 'h2';
      const last = blocks[blocks.length - 1];
      // A heading split over two lines arrives as two consecutive heading lines.
      if (prev && last && last.kind === kind && prev.page === line.page && prev.y - line.y < line.size * 1.8) {
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
      const gap = prev.y - line.y;
      const prevEnds = endsSentence(para);
      if (pageBreak) startNew = prevEnds && !startsLower(line.text);
      else if (gap > lineGap * 1.45) startNew = true;
      else if (prevEnds && line.x > leftMargin + body * 0.9) startNew = true;
      else if (prevEnds && prev.right < rightEdge - body * 4) startNew = true;
    }

    if (startNew) {
      flush();
      para = line.text;
    } else if (opts.hyphens && /[a-záéíóúñü]-$/i.test(para) && startsLower(line.text)) {
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
    const raw = await extractLines(pdf, (n) => onProgress('extract', n, pageCount), signal);
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
    const title = goodTitle ? info.Title!.trim() : firstHeading ?? fileName.replace(/\.pdf$/i, '').replace(/[-_]+/g, ' ');
    const author = info.Author?.trim() || 'Autor desconocido';
    const headingCount = blocks.filter((b) => b.kind !== 'p').length;
    const avgChars = totalChars / Math.max(1, pageCount);

    let quality: ConversionResult['quality'] = 'buena';
    let qualityNote = 'Texto corrido, se ve bien.';
    if (avgChars < 120) {
      quality = 'baja';
      qualityNote = 'Casi no tiene texto seleccionable: parece escaneado. Haría falta reconocimiento de texto (OCR).';
    } else if (headingCount === 0 && pageCount > 10) {
      quality = 'revisar';
      qualityNote = 'No encontré títulos, así que el índice va por partes.';
    }

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
      quality,
      qualityNote,
      firstPageRaw,
    };
  } finally {
    await pdf.destroy();
  }
}
