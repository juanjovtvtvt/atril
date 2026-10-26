import ePub, { EpubCFI, type Contents } from 'epubjs';
import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { Link, useParams, useSearchParams } from '../components/Nav';
import { api, invalidate, type BookDetail, type Bookmark, type Highlight, type HighlightColor } from '../api';
import { IconBack, IconBookmark, IconChevron, IconCopy, IconList, IconPencil, IconSearch, IconTrash } from '../components/Icons';
import { Popover, Sheet } from '../components/Overlay';
import { useToast } from '../components/Toast';
import { highlightColors, highlightOrder } from '../lib/colors';
import { spineSections, type EpubBook } from '../lib/epub';
import { dayKey, formatNumber, uid } from '../lib/format';

type Rendition = ReturnType<EpubBook['renderTo']>;
// epub.js's types say getContents() returns one item; it actually returns one per visible chapter.
const contentsOf = (r: Rendition) => r.getContents() as unknown as Contents[];
type ThemeId = 'papel' | 'sepia' | 'noche' | 'negro';
interface Prefs {
  theme: ThemeId;
  size: number;
  font: 'serif' | 'sans';
}
interface Loc {
  cfi: string;
  href: string;
  index: number;
  percentage: number;
  displayed: { page: number; total: number };
}

/** Characters per epub.js "location" (the same value used to generate them). */
const CHARS_PER_LOCATION = 1600;

/** How many locations fall in each chapter (by spine index), to estimate pages and progress. */
function locationsPerSection(book: EpubBook, sections: number) {
  const cfis = (book.locations as unknown as { _locations?: string[] })._locations ?? [];
  const counts = new Array<number>(sections).fill(0);
  for (const cfi of cfis) {
    const m = /^epubcfi\(\/6\/(\d+)/.exec(cfi);
    const i = m ? Number(m[1]) / 2 - 1 : -1;
    if (i >= 0 && i < sections) counts[i]++;
  }
  return counts;
}

const SERIF = "ui-serif, 'New York', 'Iowan Old Style', Charter, Cambria, Georgia, serif";
const SANS = "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI Variable Text', 'Segoe UI', system-ui, sans-serif";

/*
 * Each theme also defines the colors of the controls floating over the book (menus, sheets,
 * the selection bar). In dark themes they are "elevated" surfaces, lighter than the page, so a
 * menu never vanishes over a black background.
 */
const themes: Record<ThemeId, { name: string; bg: string; fg: string; sub: string; acc: string; bar: string; line: string; fill: string; dark: boolean; material: string; surface: string; surface2: string; ink3: string }> = {
  papel: { name: 'Papel', bg: '#FFFDF8', fg: '#2B2119', sub: '#6B5F55', acc: '#A8261B', bar: 'rgba(255,253,248,0.82)', line: 'rgba(43,33,25,0.14)', fill: 'rgba(118,96,72,0.1)', dark: false, material: 'rgba(255,253,248,0.94)', surface: '#FFFFFF', surface2: '#FCF8F1', ink3: '#B3A698' },
  sepia: { name: 'Sepia', bg: '#F4ECDC', fg: '#3B2F22', sub: '#6B5A45', acc: '#A2400F', bar: 'rgba(244,236,220,0.84)', line: 'rgba(59,47,34,0.16)', fill: 'rgba(118,96,72,0.13)', dark: false, material: 'rgba(251,246,236,0.96)', surface: '#FFFBF2', surface2: '#F8F0E0', ink3: '#AE9C84' },
  noche: { name: 'Noche', bg: '#1E1915', fg: '#E6DCCB', sub: '#A99C8B', acc: '#E8957A', bar: 'rgba(30,25,21,0.84)', line: 'rgba(230,220,203,0.16)', fill: 'rgba(230,220,203,0.1)', dark: true, material: 'rgba(54,46,40,0.97)', surface: '#4A4038', surface2: '#2F2823', ink3: '#7A6D60' },
  negro: { name: 'Negro', bg: '#000000', fg: '#D6CDBF', sub: '#9C9285', acc: '#E8957A', bar: 'rgba(0,0,0,0.82)', line: 'rgba(214,205,191,0.18)', fill: 'rgba(214,205,191,0.12)', dark: true, material: 'rgba(44,40,37,0.98)', surface: '#4A4440', surface2: '#27231F', ink3: '#77706A' },
};
type Theme = (typeof themes)[ThemeId];

const defaultPrefs: Prefs = { theme: 'papel', size: 100, font: 'serif' };

/** Whether the TOC entry and the displayed section are the same file (TOC hrefs can carry #anchor). */
const sameFile = (a: string, b: string) => a.split('#')[0].split('/').pop() === b.split('#')[0].split('/').pop();

/*
 * The book's colors go in ONE stylesheet of ours inside each chapter, replaced on every change.
 * epub.js's own themes inject one sheet per theme and never remove the old ones: going back to
 * an earlier theme mixed old text with a new background.
 */
function themeCss(t: Theme) {
  return `
html, body { background: ${t.bg} !important; color: ${t.fg} !important; transition: background-color 280ms ease, color 280ms ease; }
body * { color: inherit !important; background-color: transparent !important; border-color: ${t.line} !important; }
a, a:link, a:visited, a * { color: ${t.acc} !important; }
img, svg { max-width: 100%; height: auto; }
::selection { background: ${t.dark ? 'rgba(232,149,122,0.35)' : 'rgba(168,38,27,0.18)'}; }
`;
}

function applyTheme(contents: Contents, t: Theme) {
  const doc = (contents as unknown as { document: Document }).document;
  if (!doc?.head) return;
  let style = doc.getElementById('atril-theme');
  if (!style) {
    style = doc.createElement('style');
    style.id = 'atril-theme';
    doc.head.appendChild(style);
  }
  style.textContent = themeCss(t);
}

function readerVars(t: Theme): CSSProperties {
  return {
    '--bg': t.bg,
    '--ink': t.fg,
    '--ink-2': t.sub,
    '--ink-3': t.ink3,
    '--accent': t.acc,
    '--accent-tint': t.dark ? 'rgba(232,149,122,0.16)' : 'rgba(168,38,27,0.1)',
    '--on-accent': t.dark ? '#1C1713' : '#FFFFFF',
    '--hair': t.line,
    '--fill': t.fill,
    '--fill-hover': t.fill,
    '--material': t.material,
    '--surface': t.surface,
    '--surface-2': t.surface2,
    '--edge': `0 0 0 0.5px ${t.line}`,
    '--shadow-pop': t.dark ? '0 0 0 0.5px rgba(255,255,255,0.16), 0 18px 44px rgba(0,0,0,0.75)' : '0 0 0 0.5px rgba(43,33,25,0.12), 0 14px 36px rgba(43,33,25,0.2)',
    colorScheme: t.dark ? 'dark' : 'light',
  } as CSSProperties;
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : 0;
};

export default function Reader() {
  const { id = '' } = useParams();
  const [params] = useSearchParams();
  const toast = useToast();

  const viewer = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const bookRef = useRef<EpubBook | null>(null);
  const rendition = useRef<Rendition | null>(null);
  const metaRef = useRef<BookDetail | null>(null);
  const themeRef = useRef<Theme>(themes.papel);
  const progressRef = useRef(0);
  const cfiRef = useRef<string | null>(null);
  const hrefRef = useRef('');
  const chapterRef = useRef('');
  const dirRef = useRef<1 | -1>(1);
  const samples = useRef<{ key: string; chars: number[]; words: number[] }>({ key: '', chars: [], words: [] });
  const charsPerPage = useRef(0);
  const locationHandler = useRef<((l: { start: Loc; end: Loc }) => void) | null>(null);
  const syncLocation = useCallback(() => {
    const l = rendition.current?.currentLocation() as unknown as { start?: Loc; end?: Loc } | undefined;
    if (l?.start && l.end) locationHandler.current?.({ start: l.start, end: l.end });
  }, []);
  const sectionLocs = useRef<number[] | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const session = useRef({ id: null as number | null, start: 0, startProgress: 0, activeMs: 0, lastActivity: 0, busy: false });
  const highlightsRef = useRef<Highlight[]>([]);

  const [meta, setMeta] = useState<BookDetail | null>(null);
  const [prefs, setPrefs] = useState<Prefs>(defaultPrefs);
  const [error, setError] = useState<string | null>(null);
  const [chrome, setChrome] = useState(true);
  const [panel, setPanel] = useState<null | 'aa' | 'toc' | 'search'>(null);
  const [loc, setLoc] = useState({ progress: 0, page: 0, total: 0, index: 0, chapter: '', cfi: '' });
  const [wordsPerPage, setWordsPerPage] = useState(0);
  const [turn, setTurn] = useState<{ n: number; dir: 1 | -1 }>({ n: 0, dir: 1 });
  const [selection, setSelection] = useState<{ cfi: string; text: string } | null>(null);
  const [highlights, setHighlights] = useState<Highlight[]>([]);
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [tocTab, setTocTab] = useState<'indice' | 'marcadores'>('indice');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<{ cfi: string; excerpt: string }[] | null>(null);

  highlightsRef.current = highlights;
  const t = themes[prefs.theme];
  themeRef.current = t;

  /* ---------- Reading sessions: only active time counts ---------- */
  const markActivity = useCallback(() => {
    session.current.lastActivity = Date.now();
  }, []);

  const flushSession = useCallback(async () => {
    const s = session.current;
    const m = metaRef.current;
    if (!m || s.busy || !s.start) return;
    const minutes = s.activeMs / 60000;
    if (minutes < 0.25) return;
    // Words from progress made; capped at 600 per minute so a jump in the TOC isn't counted as reading.
    const words = Math.round(Math.min(Math.max(0, progressRef.current - s.startProgress) * m.wordCount, minutes * 600));
    s.busy = true;
    try {
      if (s.id === null) {
        const r = await api.sessions.create({ bookId: m.id, start: s.start, end: Date.now(), minutes, words, day: dayKey(s.start) });
        s.id = r.id;
      } else {
        await api.sessions.update(s.id, { end: Date.now(), minutes, words });
      }
    } catch {
      // Without a connection the minutes are kept and retried on the next tick.
    } finally {
      s.busy = false;
    }
  }, []);

  useEffect(() => {
    const tick = setInterval(() => {
      const s = session.current;
      if (!s.start) return;
      if (document.visibilityState === 'visible' && Date.now() - s.lastActivity < 120_000) s.activeMs += 15_000;
      void flushSession();
    }, 15_000);
    const onHide = () => document.visibilityState === 'hidden' && void flushSession();
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pointermove', markActivity, { passive: true });
    return () => {
      clearInterval(tick);
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pointermove', markActivity);
    };
  }, [flushSession, markActivity]);

  /* ---------- Highlights in the text ---------- */
  const paint = useCallback((h: Highlight) => {
    const dark = themeRef.current.dark;
    rendition.current?.annotations.highlight(h.cfi, { id: h.id }, () => setEditing(h.id), 'atril-hl', {
      fill: highlightColors[h.color].strong,
      'fill-opacity': dark ? '0.32' : '0.45',
      'mix-blend-mode': dark ? 'normal' : 'multiply',
    });
  }, []);

  /* ---------- Page turn with leaf animation ----------
   * epub.js changes the page instantly (animating its scroll misaligns the pages: it reads the
   * position mid-animation). The motion goes on top: the new page enters sliding from the side it
   * comes from, while a band of light and shadow (a separate layer) crosses it like the fold of a
   * leaf. Only translation and opacity: epub.js measures with getBoundingClientRect which page is
   * visible, and a rotation or scale would distort those measurements and break the counter.
   */
  const animateIn = useCallback((dir: 1 | -1, kind: 'page' | 'jump') => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const el = viewer.current;
    if (!el) return;
    if (kind === 'page') setTurn((tn) => ({ n: tn.n + 1, dir }));
    el.animate(
      kind === 'page'
        ? [
            { transform: `translateX(${dir * 36}px)`, opacity: 0.3 },
            { transform: 'none', opacity: 1 },
          ]
        : [
            { transform: 'translateY(14px)', opacity: 0 },
            { transform: 'none', opacity: 1 },
          ],
      { duration: kind === 'page' ? 420 : 360, easing: 'cubic-bezier(.23,1,.32,1)' },
    );
  }, []);

  const go = useCallback(
    (dir: 1 | -1) => {
      const r = rendition.current;
      if (!r) return;
      dirRef.current = dir;
      markActivity();
      void (dir === 1 ? r.next() : r.prev()).then(() => {
        syncLocation();
        animateIn(dir, 'page');
      });
    },
    [markActivity, animateIn, syncLocation],
  );

  /** Measures again after a size or font change: epub.js doesn't report a new position then. */
  const remeasure = useCallback(() => {
    samples.current = { key: '', chars: [], words: [] };
    charsPerPage.current = 0;
    setWordsPerPage(0);
    setTimeout(() => {
      const r = rendition.current;
      const l = r?.currentLocation() as unknown as { start?: Loc; end?: Loc } | undefined;
      if (r && l?.start && l.end) measure(l.start, l.end, contentsOf(r)[0]);
    }, 700);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Words that fit on a page with the current zoom: measured on screen, not guessed. */
  const measure = useCallback((start: Loc, end: Loc, contents: Contents | undefined) => {
    // The first page of a chapter (title) and the last one (half empty) would undercount.
    if (!contents || start.displayed.page <= 1 || start.displayed.page >= start.displayed.total) return;
    const doc = (contents as unknown as { document: Document }).document;
    try {
      const a = new EpubCFI(start.cfi).toRange(doc);
      const b = new EpubCFI(end.cfi).toRange(doc);
      if (!a || !b) return;
      const range = doc.createRange();
      range.setStart(a.startContainer, a.startOffset);
      range.setEnd(b.startContainer, b.startOffset);
      const text = range.toString().replace(/\s+/g, ' ').trim();
      const words = text.split(' ').filter(Boolean).length;
      const pages = Math.max(1, end.displayed.page - start.displayed.page + 1);
      if (words < 25) return;
      const key = `${prefsRef.current.size}-${prefsRef.current.font}-${window.innerWidth}x${window.innerHeight}`;
      if (samples.current.key !== key) {
        samples.current = { key, chars: [], words: [] };
        charsPerPage.current = 0;
      }
      // After 3 pages the value is fixed: if it kept changing, the total would jump with every turn.
      if (charsPerPage.current) return;
      samples.current.chars.push(text.length / pages);
      samples.current.words.push(words / pages);
      if (samples.current.chars.length >= 3) {
        charsPerPage.current = median(samples.current.chars);
        setWordsPerPage(median(samples.current.words));
      }
    } catch {
      // A CFI that doesn't resolve in this chapter: just skip this sample.
    }
  }, []);
  const prefsRef = useRef(prefs);
  prefsRef.current = prefs;

  /* ---------- Open the book ---------- */
  useEffect(() => {
    let cancelled = false;

    (async () => {
      const [detail, file, settings, hls, bms] = await Promise.all([api.books.get(id), api.books.file(id), api.settings.get(), api.highlights.list(id), api.bookmarks.list(id)]);
      if (cancelled || !viewer.current) return;
      const saved = (settings.lector as Partial<Prefs> | undefined) ?? {};
      const p: Prefs = { theme: saved.theme && saved.theme in themes ? saved.theme : 'papel', size: saved.size ?? 100, font: saved.font ?? 'serif' };
      metaRef.current = detail;
      progressRef.current = detail.progress;
      themeRef.current = themes[p.theme];
      setMeta(detail);
      setPrefs(p);
      setHighlights(hls);
      setBookmarks(bms);

      const book = ePub(await file.arrayBuffer());
      bookRef.current = book;
      // Always paginated: no scrolling to read. On wide screens, two pages side by side.
      const r = book.renderTo(viewer.current, { width: '100%', height: '100%', flow: 'paginated', spread: 'auto', minSpreadWidth: 900, allowScriptedContent: false } as Parameters<EpubBook['renderTo']>[1]);
      rendition.current = r;
      // Development only: lets you inspect the reader from the browser console.
      if (import.meta.env.DEV) (window as unknown as { __atril?: unknown }).__atril = { r, book, sectionLocs };
      r.hooks.content.register((contents: Contents) => applyTheme(contents, themeRef.current));
      r.themes.fontSize(`${p.size}%`);
      r.themes.font(p.font === 'serif' ? SERIF : SANS);
      r.themes.override('line-height', '1.6', true);

      const handleLocation = (location: { start: Loc; end: Loc }) => {
        const { start, end } = location;
        // Progress with page precision: the locations before this chapter, plus how far into it you are.
        const locs = sectionLocs.current;
        const totalLocs = locs ? locs.reduce((a, b) => a + b, 0) : 0;
        const progress = locs && totalLocs
          ? Math.min(1, (locs.slice(0, start.index).reduce((a, b) => a + b, 0) + (locs[start.index] ?? 0) * ((start.displayed.page - 1) / Math.max(1, start.displayed.total))) / totalLocs)
          : book.locations.length() ? book.locations.percentageFromCfi(start.cfi) : start.percentage || progressRef.current;
        const toc = metaRef.current?.toc ?? [];
        const chapter = [...toc].reverse().find((item) => sameFile(item.href, start.href))?.label.trim() ?? chapterRef.current;
        hrefRef.current = start.href;
        progressRef.current = progress;
        cfiRef.current = start.cfi;
        chapterRef.current = chapter;
        setLoc({ progress, page: start.displayed.page, total: start.displayed.total, index: start.index, chapter, cfi: start.cfi });
        measure(start, end, contentsOf(r)[0]);
        markActivity();
        clearTimeout(saveTimer.current);
        saveTimer.current = setTimeout(() => {
          const m = metaRef.current;
          if (!m) return;
          const finished = progress >= 0.985 && !m.finishedAt;
          if (finished) m.finishedAt = Date.now();
          void api.books.update(m.id, { cfi: start.cfi, progress, chapterLabel: chapter, ...(finished ? { finishedAt: m.finishedAt } : {}) });
        }, 600);
      };
      // epub.js reports the position inside a requestAnimationFrame, which the browser delays or
      // skips in background windows. go() and jump() read it themselves too, so it's never stale.
      locationHandler.current = handleLocation;
      r.on('relocated', handleLocation);

      r.on('selected', (cfiRange: string) => {
        book.getRange(cfiRange).then((range) => {
          const text = range?.toString().replace(/\s+/g, ' ').trim();
          if (text) setSelection({ cfi: cfiRange, text });
        });
      });

      // Tapping the content: the side thirds turn the page, the center shows or hides the controls.
      r.on('click', (e: MouseEvent) => {
        markActivity();
        const win = e.view as Window | null;
        if (win && !win.getSelection()?.isCollapsed) return;
        setSelection(null);
        const frame = win?.frameElement as HTMLElement | null;
        const box = viewer.current?.getBoundingClientRect();
        if (!frame || !box) return;
        const x = (frame.getBoundingClientRect().left + e.clientX - box.left) / box.width;
        if (x < 0.25) go(-1);
        else if (x > 0.75) go(1);
        else setChrome((c) => !c);
      });

      r.on('keyup', (e: KeyboardEvent) => {
        if (e.key === 'ArrowLeft') go(-1);
        if (e.key === 'ArrowRight') go(1);
      });

      // Saved locations are loaded before the first page so progress is exact from the start.
      await book.ready;
      if (detail.locations) {
        book.locations.load(detail.locations);
        sectionLocs.current = locationsPerSection(book, spineSections(book).length);
      }

      const target = params.get('cfi') ?? params.get('href') ?? detail.cfi ?? undefined;
      await r.display(target ?? undefined);
      if (cancelled) return;
      hls.forEach(paint);

      const now = Date.now();
      session.current = { id: null, start: now, startProgress: detail.progress, activeMs: 0, lastActivity: now, busy: false };
      void api.books.update(id, { lastOpenedAt: now });

      // epub.js needs "locations" for exact percentages. They're generated once and stored in SQL Server.
      if (!detail.locations) {
        await book.locations.generate(CHARS_PER_LOCATION);
        if (cancelled) return;
        sectionLocs.current = locationsPerSection(book, spineSections(book).length);
        void api.books.update(id, { locations: book.locations.save() });
        if (cfiRef.current) {
          const progress = book.locations.percentageFromCfi(cfiRef.current);
          progressRef.current = progress;
          setLoc((l) => ({ ...l, progress }));
        }
      }
    })().catch((e: Error) => !cancelled && setError(e.message));

    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof Element && e.target.closest('input, textarea')) return;
      if (e.key === 'ArrowLeft') go(-1);
      if (e.key === 'ArrowRight') go(1);
      markActivity();
    };
    window.addEventListener('keydown', onKey);

    return () => {
      cancelled = true;
      window.removeEventListener('keydown', onKey);
      clearTimeout(saveTimer.current);
      const m = metaRef.current;
      if (m && cfiRef.current) void api.books.update(m.id, { cfi: cfiRef.current, progress: progressRef.current, chapterLabel: chapterRef.current });
      void flushSession().finally(() => invalidate('books', 'sessions', 'highlights'));
      rendition.current?.destroy();
      bookRef.current?.destroy();
      rendition.current = null;
      bookRef.current = null;
    };
    // The book is opened once per id; the params only choose where to start.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  /* ---------- Preferences ---------- */
  function updatePrefs(next: Partial<Prefs>) {
    const p = { ...prefs, ...next };
    setPrefs(p);
    const r = rendition.current;
    if (r) {
      if (next.theme && next.theme !== prefs.theme) {
        themeRef.current = themes[p.theme];
        contentsOf(r).forEach((c) => applyTheme(c, themes[p.theme]));
        // The highlights change their blending between light and dark themes.
        highlightsRef.current.forEach((h) => {
          r.annotations.remove(h.cfi, 'highlight');
          paint(h);
        });
      }
      if (next.size !== undefined) r.themes.fontSize(`${p.size}%`);
      if (next.font) r.themes.font(p.font === 'serif' ? SERIF : SANS);
      if (next.size !== undefined || next.font) remeasure();
    }
    void api.settings.set('lector', p);
  }

  /* ---------- Highlights and notes ---------- */
  async function addHighlight(color: HighlightColor, withNote = false) {
    if (!selection || !meta) return;
    const h: Highlight = { id: uid(), bookId: meta.id, cfi: selection.cfi, text: selection.text, color, note: '', chapter: chapterRef.current, createdAt: Date.now() };
    try {
      await api.highlights.create(h);
      setHighlights((list) => [...list, h]);
      paint(h);
      setSelection(null);
      (rendition.current?.getContents() as unknown as { window: Window }[] | undefined)?.forEach((c) => c.window.getSelection()?.removeAllRanges());
      if (withNote) setEditing(h.id);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'No se pudo subrayar');
    }
  }

  async function updateHighlight(h: Highlight, patch: Partial<Pick<Highlight, 'color' | 'note'>>) {
    const next = { ...h, ...patch };
    setHighlights((list) => list.map((x) => (x.id === h.id ? next : x)));
    if (patch.color && patch.color !== h.color) {
      rendition.current?.annotations.remove(h.cfi, 'highlight');
      paint(next);
    }
    await api.highlights.update(h.id, patch).catch(() => toast('No se pudo guardar'));
  }

  async function removeHighlight(h: Highlight) {
    rendition.current?.annotations.remove(h.cfi, 'highlight');
    setHighlights((list) => list.filter((x) => x.id !== h.id));
    setEditing(null);
    await api.highlights.remove(h.id).catch(() => toast('No se pudo borrar'));
  }

  /* ---------- Bookmarks ---------- */
  const currentBookmark = bookmarks.find((b) => b.cfi === loc.cfi);
  async function toggleBookmark() {
    if (!meta || !loc.cfi) return;
    if (currentBookmark) {
      setBookmarks((list) => list.filter((b) => b.id !== currentBookmark.id));
      await api.bookmarks.remove(currentBookmark.id);
    } else {
      const b: Bookmark = { id: uid(), bookId: meta.id, cfi: loc.cfi, label: `${loc.chapter || 'Página'} · ${Math.round(loc.progress * 100)} %`, createdAt: Date.now() };
      setBookmarks((list) => [...list, b]);
      await api.bookmarks.create(b);
      toast('Marcador guardado');
    }
  }

  /* ---------- Search inside the book ---------- */
  async function search(q: string) {
    const book = bookRef.current;
    if (!book || q.trim().length < 2) return;
    setResults(null);
    const found: { cfi: string; excerpt: string }[] = [];
    for (const section of spineSections(book)) {
      await section.load(book.load.bind(book));
      found.push(...((section as unknown as { find(q: string): { cfi: string; excerpt: string }[] }).find(q.trim()) ?? []));
      section.unload();
      if (found.length >= 60) break;
    }
    setResults(found);
  }

  function jump(target: string) {
    setPanel(null);
    dirRef.current = 1;
    void rendition.current?.display(target).then(() => animateIn(1, 'jump'));
  }

  const editingHl = highlights.find((h) => h.id === editing) ?? null;
  const pct = Math.round(loc.progress * 100);
  /*
   * Book-wide pages: other chapters are estimated with the characters that fit per page at this
   * zoom (measured on screen); the current chapter uses epub.js's real pages. So the number goes
   * up one by one when turning, and changes when the size or font changes.
   */
  let currentPage = 0;
  let totalPages = 0;
  const locs = sectionLocs.current;
  if (wordsPerPage > 0 && charsPerPage.current > 0 && locs && loc.total > 0) {
    const pagesOf = (i: number) => (i === loc.index ? loc.total : Math.max(1, Math.ceil((locs[i] * CHARS_PER_LOCATION) / charsPerPage.current)));
    for (let i = 0; i < locs.length; i++) {
      const n = pagesOf(i);
      if (i < loc.index) currentPage += n;
      totalPages += n;
    }
    currentPage = Math.min(totalPages, currentPage + loc.page);
  }

  if (error) {
    return (
      <main className="page">
        <div className="empty" role="alert">
          <strong>No pude abrir el libro</strong>
          <p>{error}</p>
          <Link to="/" className="btn btn-tinted btn-small">
            Volver al inicio
          </Link>
        </div>
      </main>
    );
  }

  const barStyle: CSSProperties = { background: t.bar, color: t.fg, backdropFilter: 'blur(20px) saturate(180%)', WebkitBackdropFilter: 'blur(20px) saturate(180%)', transition: 'opacity 200ms ease, transform 200ms var(--ease-out), background-color 280ms ease, color 280ms ease' };

  return (
    <div style={{ ...readerVars(t), height: '100dvh', display: 'flex', flexDirection: 'column', background: t.bg, color: t.fg, transition: 'background-color 280ms ease, color 280ms ease' }}>
      <header className="toolbar" style={{ ...barStyle, position: 'relative', opacity: chrome ? 1 : 0, transform: chrome ? 'none' : 'translateY(-8px)', pointerEvents: chrome ? 'auto' : 'none' }} aria-hidden={!chrome}>
        <div className="toolbar-group" style={{ flex: 1 }}>
          <Link to={`/libro/${id}`} data-nav="back" className="btn-ghost press" style={{ paddingLeft: 4, gap: 2, color: t.acc }}>
            <IconBack size={20} />
            <span className="desktop-only">Ficha</span>
          </Link>
        </div>
        <div style={{ textAlign: 'center', lineHeight: 1.25, minWidth: 0, flex: '0 1 auto' }}>
          <div className="ellipsis" style={{ fontSize: 13, fontWeight: 600, maxWidth: '46vw' }}>
            {meta?.title ?? 'Abriendo…'}
          </div>
          <div className="ellipsis" style={{ fontSize: 12, color: t.sub, maxWidth: '46vw' }}>
            {loc.chapter}
          </div>
        </div>
        <div className="toolbar-group" style={{ flex: 1, justifyContent: 'flex-end' }}>
          <div className="anchor">
            <button type="button" className="icon-btn press" aria-label="Índice y marcadores" aria-expanded={panel === 'toc'} style={{ color: t.fg }} onClick={() => setPanel(panel === 'toc' ? null : 'toc')}>
              <IconList size={20} />
            </button>
            <Popover open={panel === 'toc'} onClose={() => setPanel(null)} width={320} label="Índice">
              <div className="seg full" style={{ margin: 4, display: 'grid' }}>
                <button type="button" aria-pressed={tocTab === 'indice'} onClick={() => setTocTab('indice')}>
                  Índice
                </button>
                <button type="button" aria-pressed={tocTab === 'marcadores'} onClick={() => setTocTab('marcadores')}>
                  Marcadores {bookmarks.length > 0 && `(${bookmarks.length})`}
                </button>
              </div>
              <div style={{ maxHeight: '60vh', overflowY: 'auto' }}>
                {tocTab === 'indice' &&
                  (meta?.toc ?? []).map((item, i) => (
                    <button key={i} type="button" className="menu-item" onClick={() => jump(item.href)} style={{ minHeight: 38, paddingLeft: item.label.startsWith('  ') ? 24 : 10, fontWeight: loc.chapter === item.label.trim() ? 600 : 400, color: loc.chapter === item.label.trim() ? 'var(--accent)' : undefined }}>
                      {item.label.trim()}
                    </button>
                  ))}
                {tocTab === 'marcadores' &&
                  (bookmarks.length === 0 ? (
                    <p className="small muted" style={{ padding: '8px 10px', margin: 0 }}>
                      Guarda la página actual con el botón del marcador.
                    </p>
                  ) : (
                    bookmarks.map((b) => (
                      <button key={b.id} type="button" className="menu-item" onClick={() => jump(b.cfi)}>
                        <IconBookmark size={16} filled style={{ color: 'var(--accent)' }} />
                        {b.label}
                      </button>
                    ))
                  ))}
              </div>
            </Popover>
          </div>
          <div className="anchor">
            <button type="button" className="icon-btn press" aria-label="Buscar en el libro" aria-expanded={panel === 'search'} style={{ color: t.fg }} onClick={() => setPanel(panel === 'search' ? null : 'search')}>
              <IconSearch size={19} />
            </button>
            <Popover open={panel === 'search'} onClose={() => setPanel(null)} width={340} label="Buscar en el libro">
              <form
                className="search compact"
                style={{ margin: 4 }}
                onSubmit={(e) => {
                  e.preventDefault();
                  void search(query);
                }}
              >
                <IconSearch size={15} />
                <input autoFocus type="search" aria-label="Buscar en el libro" placeholder="Buscar en el libro" value={query} onChange={(e) => setQuery(e.target.value)} />
              </form>
              <div style={{ maxHeight: '55vh', overflowY: 'auto' }}>
                {results === null && query && <p className="small muted" style={{ padding: '6px 10px', margin: 0 }}>Presiona Enter para buscar.</p>}
                {results?.length === 0 && <p className="small muted" style={{ padding: '6px 10px', margin: 0 }}>Sin resultados.</p>}
                {results?.map((r, i) => (
                  <button key={i} type="button" className="menu-item small serif" style={{ alignItems: 'flex-start' }} onClick={() => jump(r.cfi)}>
                    …{r.excerpt.trim()}…
                  </button>
                ))}
              </div>
            </Popover>
          </div>
          <button type="button" className="icon-btn press" aria-label={currentBookmark ? 'Quitar marcador' : 'Guardar marcador'} aria-pressed={!!currentBookmark} style={{ color: currentBookmark ? t.acc : t.fg }} onClick={() => void toggleBookmark()}>
            <IconBookmark size={19} filled={!!currentBookmark} />
          </button>
          <div className="anchor">
            <button type="button" className="icon-btn press" aria-label="Apariencia" aria-expanded={panel === 'aa'} style={{ color: t.fg, width: 'auto', padding: '0 8px', fontWeight: 600, fontSize: 15 }} onClick={() => setPanel(panel === 'aa' ? null : 'aa')}>
              Aa
            </button>
            <Popover open={panel === 'aa'} onClose={() => setPanel(null)} width={300} label="Apariencia">
              <div style={{ padding: 8, display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 8 }}>
                  {(Object.keys(themes) as ThemeId[]).map((k) => (
                    <button key={k} type="button" aria-pressed={prefs.theme === k} className="press" onClick={() => updatePrefs({ theme: k })} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, padding: 0, border: 0, background: 'transparent', color: 'var(--ink)' }}>
                      <span className="serif" style={{ width: 44, height: 44, borderRadius: 22, background: themes[k].bg, color: themes[k].fg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 600, boxShadow: prefs.theme === k ? `0 0 0 2px ${t.material}, 0 0 0 4px var(--accent)` : '0 0 0 1px rgba(128,118,108,0.45)' }}>
                        Aa
                      </span>
                      <span style={{ fontSize: 11, fontWeight: prefs.theme === k ? 600 : 400 }}>{themes[k].name}</span>
                    </button>
                  ))}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', borderRadius: 10, background: 'var(--fill)' }}>
                  <button type="button" aria-label="Letra más pequeña" className="press serif" disabled={prefs.size <= 70} onClick={() => updatePrefs({ size: prefs.size - 10 })} style={{ height: 40, border: 0, background: 'transparent', fontSize: 14 }}>
                    A
                  </button>
                  <span className="small muted num">{prefs.size} %</span>
                  <button type="button" aria-label="Letra más grande" className="press serif" disabled={prefs.size >= 200} onClick={() => updatePrefs({ size: prefs.size + 10 })} style={{ height: 40, border: 0, background: 'transparent', fontSize: 22 }}>
                    A
                  </button>
                </div>
                <div className="small muted num" style={{ textAlign: 'center', marginTop: -6 }}>
                  {wordsPerPage ? `≈ ${formatNumber(wordsPerPage)} palabras por página con este tamaño` : 'Midiendo cuántas palabras caben…'}
                </div>
                <div className="seg full" style={{ display: 'grid' }}>
                  <button type="button" aria-pressed={prefs.font === 'serif'} onClick={() => updatePrefs({ font: 'serif' })} style={{ fontFamily: SERIF }}>
                    Con serifa
                  </button>
                  <button type="button" aria-pressed={prefs.font === 'sans'} onClick={() => updatePrefs({ font: 'sans' })}>
                    Sin serifa
                  </button>
                </div>
              </div>
            </Popover>
          </div>
        </div>
      </header>

      <div style={{ flex: 1, minHeight: 0, display: 'flex', position: 'relative' }}>
        <button type="button" className="desktop-only" aria-label="Página anterior" onClick={() => go(-1)} style={{ flex: '0 0 72px', border: 0, background: 'transparent', color: t.sub }}>
          <IconBack size={24} />
        </button>
        <div ref={stage} className="reader-stage" style={{ flex: 1, minWidth: 0, maxWidth: 1180, margin: '0 auto', height: '100%', position: 'relative', overflow: 'hidden' }}>
          <div ref={viewer} className="reader-viewer" style={{ position: 'absolute', inset: 0 }} />
          {turn.n > 0 && <div key={turn.n} aria-hidden="true" className={`leaf ${turn.dir === 1 ? 'leaf-next' : 'leaf-prev'} ${t.dark ? 'leaf-dark' : ''}`} />}
        </div>
        <button type="button" className="desktop-only" aria-label="Página siguiente" onClick={() => go(1)} style={{ flex: '0 0 72px', border: 0, background: 'transparent', color: t.sub }}>
          <IconChevron size={24} strokeWidth={1.8} />
        </button>
        {!meta && <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: t.sub }}>Abriendo el libro…</div>}
      </div>

      <footer style={{ ...barStyle, position: 'relative', padding: '10px 16px calc(12px + env(safe-area-inset-bottom))', textAlign: 'center', fontSize: 12, color: t.sub, opacity: chrome ? 1 : 0 }} className="num">
        {totalPages ? `Página ${formatNumber(currentPage)} de ${formatNumber(totalPages)} · ` : ''}
        {pct} %
        <span aria-hidden="true" style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 2, background: t.line }}>
          <span style={{ display: 'block', width: `${pct}%`, height: '100%', background: t.acc, transition: 'width 200ms ease-out' }} />
        </span>
      </footer>

      {selection && (
        <div role="toolbar" aria-label="Texto seleccionado" className="popover" style={{ position: 'fixed', top: 'auto', left: '50%', bottom: 'calc(64px + env(safe-area-inset-bottom))', transform: 'translateX(-50%)', display: 'flex', alignItems: 'center', gap: 6, padding: 6, animation: 'rise 180ms var(--ease-out) both' }}>
          {highlightOrder.map((c) => (
            <button key={c} type="button" className="press" aria-label={`Subrayar en ${highlightColors[c].name.toLowerCase()}`} onClick={() => void addHighlight(c)} style={{ width: 32, height: 32, border: 0, borderRadius: 16, background: highlightColors[c].strong }} />
          ))}
          <span style={{ width: 1, height: 22, background: 'var(--hair)', margin: '0 2px' }} />
          <button type="button" className="btn-ghost press" style={{ color: 'var(--ink)' }} onClick={() => void addHighlight('ocre', true)}>
            <IconPencil size={16} />
            Nota
          </button>
          <button
            type="button"
            className="btn-ghost press"
            style={{ color: 'var(--ink)' }}
            onClick={() => {
              void navigator.clipboard.writeText(selection.text);
              toast('Copiado');
              setSelection(null);
            }}
          >
            <IconCopy size={16} />
            Copiar
          </button>
        </div>
      )}

      {editingHl && (
        <Sheet title="Subrayado" onClose={() => setEditing(null)}>
          <p className="serif" style={{ margin: '0 0 14px', fontSize: 17, lineHeight: 1.5 }}>
            <span style={{ background: highlightColors[editingHl.color].strong + '66', borderRadius: 3, padding: '1px 3px' }}>{editingHl.text}</span>
          </p>
          <div role="radiogroup" aria-label="Color" style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
            {highlightOrder.map((c) => (
              <button key={c} type="button" role="radio" aria-checked={editingHl.color === c} aria-label={highlightColors[c].name} className="press" onClick={() => void updateHighlight(editingHl, { color: c })} style={{ width: 30, height: 30, border: 0, borderRadius: 15, background: highlightColors[c].strong, boxShadow: editingHl.color === c ? '0 0 0 2px var(--surface-2), 0 0 0 4px var(--accent)' : 'none' }} />
            ))}
          </div>
          <label className="small muted" htmlFor="nota">
            Nota
          </label>
          <textarea
            id="nota"
            defaultValue={editingHl.note}
            placeholder="Escribe lo que pensaste al leerlo"
            rows={4}
            onBlur={(e) => e.target.value !== editingHl.note && void updateHighlight(editingHl, { note: e.target.value })}
            style={{ display: 'block', width: '100%', marginTop: 6, padding: 12, border: 0, borderRadius: 12, background: 'var(--fill)', resize: 'vertical', fontSize: 15 }}
          />
          <button type="button" className="btn-ghost press" style={{ marginTop: 12, color: 'var(--ink-2)' }} onClick={() => void removeHighlight(editingHl)}>
            <IconTrash size={16} />
            Borrar subrayado
          </button>
        </Sheet>
      )}
    </div>
  );
}
