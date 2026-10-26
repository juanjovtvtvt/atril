import ePub from 'epubjs';
import { api, invalidate, type Origin, type TocItem } from '../api';
import { colorFor } from './colors';
import { uid } from './format';

export interface EpubInfo {
  title: string;
  author: string;
  language: string;
  cover: Blob | null;
  toc: TocItem[];
  chapterCount: number;
  wordCount: number;
  firstLines: string;
  text: string;
}

interface SectionLike {
  load(request: unknown): Promise<unknown>;
  unload(): void;
  document?: Document;
  href: string;
}

interface NavItem {
  label: string;
  href: string;
  subitems?: NavItem[];
}

export type EpubBook = ReturnType<typeof ePub>;

export function spineSections(book: EpubBook): SectionLike[] {
  return (book.spine as unknown as { spineItems: SectionLike[] }).spineItems ?? [];
}

function flattenToc(items: NavItem[], depth = 0, out: TocItem[] = []): TocItem[] {
  for (const item of items) {
    out.push({ label: (depth > 0 ? '  ' : '') + item.label.trim(), href: item.href });
    if (item.subitems?.length && depth < 1) flattenToc(item.subitems, depth + 1, out);
  }
  return out;
}

const BLOCKS = 'p, h1, h2, h3, h4, h5, h6, li, blockquote, pre, dd, dt, figcaption';

/** Text with paragraph breaks: textContent alone glues "end.Next" across blocks. */
export function blockText(root: Element | null | undefined) {
  if (!root) return '';
  const blocks = root.querySelectorAll(BLOCKS);
  const raw = blocks.length > 0 ? Array.from(blocks, (b) => b.textContent ?? '') : [root.textContent ?? ''];
  return raw
    .map((t) => t.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n\n');
}

const nextFrame = () => new Promise((r) => setTimeout(r, 0));

function pickFirstLines(parts: string[]) {
  const skip = /(isbn|copyright|©|todos los derechos|índice|contents|tabla de contenido)/i;
  for (const part of parts) {
    if (part.length < 300 || skip.test(part.slice(0, 400))) continue;
    const para = part.split('\n\n').find((p) => p.length > 120) ?? part;
    if (para.length <= 320) return para;
    const cut = para.slice(0, 320);
    const end = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('; '), cut.lastIndexOf(', '));
    return (end > 120 ? cut.slice(0, end + 1) : cut.trimEnd()) + (end > 120 && cut[end] === '.' ? '' : '…');
  }
  return '';
}

export async function analyzeEpub(data: ArrayBuffer, fileName: string, onProgress?: (done: number, total: number) => void): Promise<EpubInfo> {
  const book = ePub(data);
  try {
    await book.ready;
    const meta = (await book.loaded.metadata) as { title?: string; creator?: string; language?: string };
    const nav = (await book.loaded.navigation) as unknown as { toc: NavItem[] };
    const toc = flattenToc(nav.toc ?? []);

    let cover: Blob | null = null;
    try {
      const url = await book.coverUrl();
      if (url) cover = await (await fetch(url)).blob();
    } catch {
      cover = null;
    }

    const sections = spineSections(book);
    const parts: string[] = [];
    for (let i = 0; i < sections.length; i++) {
      const section = sections[i];
      try {
        await section.load(book.load.bind(book));
        const doc = section.document;
        parts.push(blockText(doc?.getElementsByTagName('body')[0] ?? doc?.documentElement));
      } catch {
        parts.push('');
      } finally {
        section.unload();
      }
      onProgress?.(i + 1, sections.length);
      if (i % 4 === 3) await nextFrame();
    }

    const text = parts.filter(Boolean).join('\n\n');
    const wordCount = text.split(/\s+/).filter(Boolean).length;
    const fallbackTitle = fileName.replace(/\.(epub|pdf)$/i, '').replace(/[-_]+/g, ' ').trim();
    return {
      title: meta.title?.trim() || fallbackTitle || 'Sin título',
      author: meta.creator?.trim() || 'Autor desconocido',
      language: meta.language?.trim() || '',
      cover,
      toc,
      chapterCount: toc.filter((t) => !t.label.startsWith('  ')).length || sections.length,
      wordCount,
      firstLines: pickFirstLines(parts),
      text,
    };
  } finally {
    book.destroy();
  }
}

/** Analyzes the EPUB in the browser and saves it to SQL Server through the API. */
export async function importEpub(file: Blob, fileName: string, origin: Origin, onProgress?: (done: number, total: number) => void) {
  const info = await analyzeEpub(await file.arrayBuffer(), fileName, onProgress);
  const id = uid();
  await api.books.create({
    id,
    title: info.title,
    author: info.author,
    language: info.language,
    origin,
    fileName,
    fileSize: file.size,
    color: colorFor(info.title + info.author),
    wordCount: info.wordCount,
    chapterCount: info.chapterCount,
    toc: info.toc,
    firstLines: info.firstLines,
    text: info.text,
  });
  try {
    await api.books.uploadFile(id, file.type ? file : new Blob([file], { type: 'application/epub+zip' }));
    if (info.cover) await api.books.uploadCover(id, info.cover);
  } catch (err) {
    // Without the file the book is unreadable: better not to leave it half-saved.
    await api.books.remove(id).catch(() => undefined);
    throw err;
  }
  invalidate('books');
  return id;
}
