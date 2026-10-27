import type { Book, Highlight } from '../api';
import { slug } from './format';
import { shareFile } from './native';

export type CardStyle = 'cuero' | 'ocre' | 'oliva';

export const cardStyles: Record<CardStyle, { name: string; bg: string; fg: string; rule: string }> = {
  cuero: { name: 'Cuero', bg: '#4B2716', fg: '#F4E9D6', rule: 'rgba(244,233,214,0.3)' },
  ocre: { name: 'Ocre', bg: '#F6E3C6', fg: '#3B2416', rule: 'rgba(59,36,22,0.25)' },
  oliva: { name: 'Oliva', bg: '#E5E5CF', fg: '#2F2E16', rule: 'rgba(47,46,22,0.25)' },
};

const SANS = '-apple-system, "Segoe UI Variable Text", "Segoe UI", system-ui, sans-serif';
const SERIF = '"New York", "Iowan Old Style", Charter, Cambria, Georgia, serif';

function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number) {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = w;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/** 1080×1350 (4:5), the size Instagram and TikTok accept without cropping. */
export async function renderQuoteCard(quote: string, book: Pick<Book, 'title' | 'author'>, style: CardStyle) {
  const s = cardStyles[style];
  const W = 1080;
  const H = 1350;
  const pad = 96;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = s.bg;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = s.fg;

  let size = 66;
  let lines: string[] = [];
  // Shrink the type until the quote fits in the available height.
  for (; size >= 36; size -= 4) {
    ctx.font = `500 ${size}px ${SERIF}`;
    lines = wrap(ctx, quote, W - pad * 2);
    if (lines.length * size * 1.32 < H - pad * 2 - 260) break;
  }
  ctx.textBaseline = 'top';
  lines.forEach((l, i) => ctx.fillText(l, pad, pad + 20 + i * size * 1.32));

  ctx.font = `600 34px ${SANS}`;
  ctx.fillText(book.title, pad, H - pad - 150, W - pad * 2);
  ctx.globalAlpha = 0.75;
  ctx.font = `400 32px ${SANS}`;
  ctx.fillText(book.author, pad, H - pad - 104, W - pad * 2);
  ctx.globalAlpha = 1;
  ctx.fillStyle = s.rule;
  ctx.fillRect(pad, H - pad - 48, W - pad * 2, 2);
  ctx.fillStyle = s.fg;
  ctx.globalAlpha = 0.7;
  ctx.font = `600 26px ${SANS}`;
  ctx.fillText('Leído en Atril', pad, H - pad - 26);
  ctx.globalAlpha = 1;

  return new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('No se pudo crear la imagen'))), 'image/png'));
}

/** System share menu (native on Android); on the web, download if there's no menu. */
export const shareOrDownload = shareFile;

export function notesMarkdown(book: Pick<Book, 'title' | 'author'>, highlights: Highlight[]) {
  const lines = [`# ${book.title}`, `*${book.author}*`, ''];
  let chapter = '';
  for (const h of [...highlights].sort((a, b) => a.createdAt - b.createdAt)) {
    if (h.chapter && h.chapter !== chapter) {
      chapter = h.chapter;
      lines.push(`## ${chapter}`, '');
    }
    lines.push(`> ${h.text}`, '');
    if (h.note) lines.push(h.note, '');
  }
  return lines.join('\n');
}

export function exportNotes(book: Pick<Book, 'title' | 'author'>, highlights: Highlight[]) {
  return shareFile(new Blob([notesMarkdown(book, highlights)], { type: 'text/markdown' }), `notas-${slug(book.title)}.md`, `Notas de ${book.title}`);
}
