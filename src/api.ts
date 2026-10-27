import { useEffect, useReducer, useState } from 'react';

/* ---------- Types (the same shape the API returns from SQL Server) ---------- */

export type Origin = 'epub' | 'pdf';
export type HighlightColor = 'ocre' | 'oliva' | 'rosa';

export interface TocItem {
  label: string;
  href: string;
}

export interface Book {
  id: string;
  title: string;
  author: string;
  language: string;
  origin: Origin;
  fileName: string;
  fileSize: number;
  color: string;
  wordCount: number;
  chapterCount: number;
  toc: TocItem[];
  firstLines: string;
  progress: number;
  cfi: string | null;
  chapterLabel: string;
  addedAt: number;
  lastOpenedAt: number | null;
  finishedAt: number | null;
  hasCover: boolean;
}

export interface BookDetail extends Book {
  locations: string | null;
}

export interface NewBook {
  id: string;
  title: string;
  author: string;
  language: string;
  origin: Origin;
  fileName: string;
  fileSize: number;
  color: string;
  wordCount: number;
  chapterCount: number;
  toc: TocItem[];
  firstLines: string;
  text: string;
}

export type BookPatch = Partial<Pick<BookDetail, 'progress' | 'cfi' | 'chapterLabel' | 'lastOpenedAt' | 'finishedAt' | 'locations'>>;

export interface Session {
  id: number;
  bookId: string;
  start: number;
  end: number;
  minutes: number;
  words: number;
  day: string;
}

export interface Highlight {
  id: string;
  bookId: string;
  cfi: string;
  text: string;
  color: HighlightColor;
  note: string;
  chapter: string;
  createdAt: number;
}

export interface Bookmark {
  id: string;
  bookId: string;
  cfi: string;
  label: string;
  createdAt: number;
}

export interface SearchHit {
  id: string;
  title: string;
  author: string;
  kind: 'meta' | 'texto';
  snippet: string | null;
}

export interface Streak {
  current: number;
  best: number;
  readToday: boolean;
}

export type Settings = Record<string, unknown>;

/* ---------- HTTP ---------- */

export class ApiError extends Error {}

/*
 * Server address. On the web it's the same origin (''); in the Android app it's the PC on your
 * Wi-Fi, e.g. http://192.168.0.103:3001. The build sets it (VITE_API_URL) and the app can change
 * it if the PC's IP changes.
 */
const SERVER_KEY = 'atril.servidor';

export function serverUrl() {
  let saved: string | null = null;
  try {
    saved = localStorage.getItem(SERVER_KEY);
  } catch {
    saved = null;
  }
  return (saved ?? import.meta.env.VITE_API_URL ?? '').replace(/\/+$/, '');
}

export function setServerUrl(url: string) {
  try {
    localStorage.setItem(SERVER_KEY, url.trim().replace(/\/+$/, ''));
  } catch {
    // Without storage the build's default address stays.
  }
}

async function http<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${serverUrl()}/api${path}`, init);
  } catch {
    throw new ApiError(
      serverUrl()
        ? `No hay conexión con el servidor de Atril en ${serverUrl()}. Revisa que el PC esté encendido con «npm start» y en la misma Wi-Fi.`
        : 'No hay conexión con el servidor de Atril. ¿Está corriendo «npm run dev»?',
    );
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new ApiError(body.error ?? `El servidor respondió ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return (res.headers.get('content-type')?.includes('json') ? res.json() : res.blob()) as Promise<T>;
}

const json = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

const binary = (blob: Blob): RequestInit => ({
  method: 'PUT',
  headers: { 'Content-Type': blob.type || 'application/octet-stream' },
  body: blob,
});

export const coverUrl = (id: string) => `${serverUrl()}/api/books/${id}/cover`;

export const api = {
  health: () => http<{ ok: boolean; server: string; db: string }>('/health'),
  books: {
    list: () => http<Book[]>('/books'),
    get: (id: string) => http<BookDetail>(`/books/${id}`),
    file: (id: string) => http<Blob>(`/books/${id}/file`),
    create: (book: NewBook) => http<{ id: string }>('/books', json('POST', book)),
    uploadFile: (id: string, blob: Blob) => http<void>(`/books/${id}/file`, binary(blob)),
    uploadCover: (id: string, blob: Blob) => http<void>(`/books/${id}/cover`, binary(blob)),
    update: (id: string, patch: BookPatch) => http<void>(`/books/${id}`, json('PATCH', patch)),
    remove: (id: string) => http<void>(`/books/${id}`, { method: 'DELETE' }),
  },
  search: (q: string) => http<SearchHit[]>(`/search?q=${encodeURIComponent(q)}`),
  sessions: {
    list: () => http<Session[]>('/sessions'),
    create: (s: Omit<Session, 'id'>) => http<{ id: number }>('/sessions', json('POST', s)),
    update: (id: number, s: Pick<Session, 'end' | 'minutes' | 'words'>) => http<void>(`/sessions/${id}`, json('PATCH', s)),
  },
  streak: (today: string) => http<Streak>(`/stats/streak?today=${today}`),
  highlights: {
    list: (bookId?: string) => http<Highlight[]>(`/highlights${bookId ? `?bookId=${bookId}` : ''}`),
    create: (h: Omit<Highlight, 'createdAt'>) => http<{ id: string }>('/highlights', json('POST', h)),
    update: (id: string, patch: Partial<Pick<Highlight, 'color' | 'note'>>) => http<void>(`/highlights/${id}`, json('PATCH', patch)),
    remove: (id: string) => http<void>(`/highlights/${id}`, { method: 'DELETE' }),
  },
  bookmarks: {
    list: (bookId: string) => http<Bookmark[]>(`/bookmarks?bookId=${bookId}`),
    create: (b: Omit<Bookmark, 'createdAt'>) => http<{ id: string }>('/bookmarks', json('POST', b)),
    remove: (id: string) => http<void>(`/bookmarks/${id}`, { method: 'DELETE' }),
  },
  settings: {
    get: () => http<Settings>('/settings'),
    set: (key: string, value: unknown) => http<void>(`/settings/${key}`, json('PUT', { value })),
  },
};

/* ---------- Reactive reads ----------
 * Each query depends on "keys". After a write, invalidate(key) bumps that key's version and
 * every query that depends on it fetches again: a minimal stand-in for React Query.
 */

export type Key = 'books' | 'sessions' | 'highlights' | 'bookmarks' | 'settings';

const versions = new Map<Key, number>();
const listeners = new Set<() => void>();

export function invalidate(...keys: Key[]) {
  for (const k of keys) versions.set(k, (versions.get(k) ?? 0) + 1);
  listeners.forEach((fn) => fn());
}

export interface QueryState<T> {
  data: T | undefined;
  error: Error | null;
  loading: boolean;
}

export function useQuery<T>(keys: Key[], fetcher: () => Promise<T>, deps: unknown[] = []): QueryState<T> {
  const [, rerender] = useReducer((n: number) => n + 1, 0);
  const [state, setState] = useState<QueryState<T>>({ data: undefined, error: null, loading: true });

  useEffect(() => {
    listeners.add(rerender);
    return () => {
      listeners.delete(rerender);
    };
  }, []);

  const version = keys.map((k) => versions.get(k) ?? 0).join('.');
  useEffect(() => {
    let alive = true;
    fetcher().then(
      (data) => alive && setState({ data, error: null, loading: false }),
      (error: Error) => alive && setState((s) => ({ ...s, error, loading: false })),
    );
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version, ...deps]);

  return state;
}

export const useBooks = () => useQuery(['books'], api.books.list);
export const useSessions = () => useQuery(['sessions'], api.sessions.list);
export const useHighlights = (bookId?: string) => useQuery(['highlights'], () => api.highlights.list(bookId), [bookId]);
export const useSettings = () => useQuery(['settings'], api.settings.get);
