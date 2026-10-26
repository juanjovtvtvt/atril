import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from '../components/Nav';
import { api, useBooks, useQuery, useSessions, type Book, type SearchHit } from '../api';
import { AddBookButton } from '../components/AddBook';
import { Cover } from '../components/Cover';
import { IconBook, IconChevron, IconConvert, IconFlame, IconInfo, IconSearch } from '../components/Icons';
import { Popover, Sheet } from '../components/Overlay';
import { ServerError, Shell } from '../components/Shell';
import { StreakOverlay } from '../components/StreakOverlay';
import { dayKey, formatMinutes, normalize } from '../lib/format';
import { averagePace, lastDays, paceByBook } from '../lib/stats';

function SearchBox() {
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<SearchHit[] | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  // Ctrl/Cmd + K focuses the search, with no animation: it's a shortcut used constantly.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        input.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (q.trim().length < 2) {
      setHits(null);
      return;
    }
    const t = setTimeout(() => {
      api.search(q.trim()).then(setHits, () => setHits([]));
    }, 220);
    return () => clearTimeout(t);
  }, [q]);

  return (
    <div className="anchor">
      <div role="search" className="search">
        <IconSearch size={18} />
        <input
          ref={input}
          type="search"
          aria-labelledby="buscar-titulo"
          placeholder="Título, autor o una frase que recuerdes"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && hits?.[0]) navigate(`/libro/${hits[0].id}`);
          }}
        />
        <kbd className="kbd desktop-only">Ctrl K</kbd>
      </div>
      {hits && (
        <Popover open onClose={() => setQ('')} align="left" width={Math.min(640, window.innerWidth - 32)} label="Resultados">
          {hits.length === 0 ? (
            <div className="muted" style={{ padding: '10px 12px' }}>
              Nada coincide con «{q}».
            </div>
          ) : (
            hits.map((h) => (
              <Link key={h.id} to={`/libro/${h.id}`} className="menu-item" style={{ alignItems: 'flex-start' }}>
                <IconBook size={18} style={{ marginTop: 2, color: 'var(--ink-2)', flex: '0 0 auto' }} />
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: 'block', fontWeight: 600 }}>{h.title}</span>
                  <span className="small muted">{h.author}</span>
                  {h.snippet && <Snippet text={h.snippet} q={q} />}
                </span>
              </Link>
            ))
          )}
        </Popover>
      )}
    </div>
  );
}

/** Marks where the phrase appears, ignoring accents and case like the SQL search does. */
function Snippet({ text, q }: { text: string; q: string }) {
  const i = normalize(text).indexOf(normalize(q.trim()));
  const clean = (s: string) => s.replace(/\s+/g, ' ');
  if (i < 0) return <span className="small serif" style={{ display: 'block', marginTop: 4 }}>…{clean(text)}…</span>;
  const end = i + q.trim().length;
  return (
    <span className="small serif" style={{ display: 'block', marginTop: 4, color: 'var(--ink)' }}>
      …{clean(text.slice(0, i))}
      <mark style={{ background: 'var(--hl-ocre)', color: 'inherit', borderRadius: 3, padding: '0 2px' }}>{text.slice(i, end)}</mark>
      {clean(text.slice(end))}…
    </span>
  );
}

function ContinueCard({ book, delay }: { book: Book; delay: number }) {
  return (
    <Link to={`/libro/${book.id}`} className="book-link press" style={{ display: 'flex', gap: 16, color: 'var(--ink)', animation: `rise 320ms var(--ease-out) ${delay}ms both` }}>
      <Cover book={book} width={104} />
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', padding: '4px 0 2px' }}>
        <span style={{ fontSize: 17, fontWeight: 600, lineHeight: 1.25, letterSpacing: '-0.01em' }}>{book.title}</span>
        <span className="muted">{book.author}</span>
        {book.origin === 'pdf' && <span className="small muted" style={{ marginTop: 4 }}>Convertido de PDF</span>}
        <span className="progress" style={{ marginTop: 'auto' }}>
          <span style={{ width: `${Math.round(book.progress * 100)}%` }} />
        </span>
        <span className="small muted num" style={{ marginTop: 6 }}>
          {book.progress > 0 ? `${Math.round(book.progress * 100)} %${book.chapterLabel ? ` · ${book.chapterLabel.trim()}` : ''}` : 'Sin empezar'}
        </span>
      </div>
    </Link>
  );
}

export default function Home() {
  const books = useBooks();
  const sessions = useSessions();
  const streak = useQuery(['sessions'], () => api.streak(dayKey(new Date())));
  const [modal, setModal] = useState<null | 'racha' | 'ppm' | 'leidos'>(null);

  const all = books.data ?? [];
  const week = useMemo(() => lastDays(sessions.data ?? []), [sessions.data]);
  const weekMinutes = week.reduce((s, d) => s + d.minutes, 0);
  const maxDay = Math.max(1, ...week.map((d) => d.minutes));
  const paces = useMemo(() => paceByBook(sessions.data ?? [], all), [sessions.data, all]);
  const avg = averagePace(paces);
  const finished = all.filter((b) => b.finishedAt).sort((a, b) => (b.finishedAt ?? 0) - (a.finishedAt ?? 0));
  const reading = all
    .filter((b) => !b.finishedAt)
    .sort((a, b) => (b.lastOpenedAt ?? 0) - (a.lastOpenedAt ?? 0) || b.addedAt - a.addedAt)
    .slice(0, 3);

  return (
    <Shell actions={<span className="desktop-only"><AddBookButton /></span>}>
      <main className="page">
        <div className="phone-only" style={{ display: 'flex', justifyContent: 'flex-end', marginTop: -4 }}>
          <AddBookButton compact />
        </div>
        <h1 id="buscar-titulo" className="large-title" style={{ marginBottom: 14 }}>
          Encuentra tu libro
        </h1>
        <SearchBox />

        {books.error ? (
          <div style={{ marginTop: 28 }}>
            <ServerError error={books.error} />
          </div>
        ) : (
          <>
            <section aria-label="Tu lectura" className="widgets" style={{ marginTop: 28 }}>
              <Link to="/historial" className="widget w-olive press">
                <span className="widget-label">
                  <span>Esta semana</span>
                  <IconChevron size={14} style={{ opacity: 0.6 }} />
                </span>
                <span className="widget-value">{formatMinutes(weekMinutes)}</span>
                <span aria-hidden="true" style={{ marginTop: 'auto', display: 'flex', alignItems: 'flex-end', gap: 5, height: 30 }}>
                  {week.map((d) => (
                    <span key={d.key} style={{ width: 6, height: Math.max(4, Math.round((d.minutes / maxDay) * 30)), borderRadius: 3, background: 'currentColor', opacity: d.isToday ? 1 : 0.4 }} />
                  ))}
                </span>
              </Link>

              <button type="button" className="widget w-ochre press" onClick={() => setModal('racha')}>
                <span className="widget-label">
                  <span>Racha</span>
                  <IconFlame size={14} />
                </span>
                <span className="widget-value">
                  {streak.data?.current ?? 0} {streak.data?.current === 1 ? 'día' : 'días'}
                </span>
                <span aria-hidden="true" style={{ marginTop: 'auto', display: 'flex', gap: 6 }}>
                  {week.map((d) => (
                    <span key={d.key} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, fontSize: 10, fontWeight: 600, opacity: 0.85 }}>
                      <span style={{ width: 14, height: 14, borderRadius: 7, background: d.minutes >= 1 ? 'currentColor' : 'transparent', boxShadow: d.minutes >= 1 ? 'none' : 'inset 0 0 0 1.5px currentColor', opacity: d.minutes >= 1 ? 1 : 0.45 }} />
                      {d.letter}
                    </span>
                  ))}
                </span>
              </button>

              <div className="anchor" style={{ display: 'flex' }}>
                <button type="button" className="widget w-rose press" style={{ flex: 1 }} aria-expanded={modal === 'ppm'} onClick={() => setModal(modal === 'ppm' ? null : 'ppm')}>
                  <span className="widget-label">
                    <span>Palabras por minuto</span>
                    <IconInfo size={14} style={{ opacity: 0.6 }} />
                  </span>
                  <span className="widget-value">{avg ?? '—'}</span>
                  <span className="widget-foot">{paces.length ? `Promedio de ${paces.length} ${paces.length === 1 ? 'libro' : 'libros'}` : 'Lee un rato para medirlo'}</span>
                </button>
                <Popover open={modal === 'ppm'} onClose={() => setModal(null)} align="left" width={320} label="Cómo se calcula">
                  <div style={{ padding: '8px 10px 10px' }}>
                    <div style={{ fontWeight: 600 }}>Cómo se calcula</div>
                    <div className="small muted" style={{ marginBottom: 8 }}>
                      Palabras leídas ÷ minutos leídos, en cada libro.
                    </div>
                    {paces.length === 0 && <div className="small muted">Todavía no hay sesiones de más de 2 minutos.</div>}
                    {paces.map((p) => (
                      <div key={p.bookId} style={{ display: 'flex', gap: 12, padding: '7px 0', borderBottom: '0.5px solid var(--hair)', fontSize: 14 }}>
                        <span className="ellipsis" style={{ flex: 1 }}>
                          {p.title}
                        </span>
                        <span className="muted num">{p.wpm}</span>
                      </div>
                    ))}
                    {avg !== null && (
                      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', paddingTop: 10 }}>
                        <span style={{ fontWeight: 600, fontSize: 14 }}>Promedio</span>
                        <span className="num" style={{ fontSize: 20, fontWeight: 700, color: 'var(--accent)' }}>
                          {avg} ppm
                        </span>
                      </div>
                    )}
                  </div>
                </Popover>
              </div>

              <button type="button" className="widget w-sand press" onClick={() => setModal('leidos')}>
                <span className="widget-label">
                  <span>Libros leídos</span>
                  <IconChevron size={14} style={{ opacity: 0.6 }} />
                </span>
                <span className="widget-value">
                  {finished.length} {finished.length === 1 ? 'libro' : 'libros'}
                </span>
                <span aria-hidden="true" style={{ marginTop: 'auto', display: 'flex', alignItems: 'flex-end', gap: 2, height: 30 }}>
                  {finished.slice(0, 12).map((b, i) => (
                    <span key={b.id} style={{ width: 6 + (i % 3) * 2, height: 20 + ((i * 7) % 11), borderRadius: 1.5, background: b.color }} />
                  ))}
                </span>
              </button>
            </section>

            <section aria-labelledby="seguir-titulo" className="section">
              <div className="section-head">
                <h2 id="seguir-titulo" className="h2">
                  Seguir leyendo
                </h2>
                {all.length > 0 && <Link to="/biblioteca">Ver todo</Link>}
              </div>
              {books.loading ? null : all.length === 0 ? (
                <div className="empty">
                  <IconBook size={34} style={{ color: 'var(--accent)' }} />
                  <strong style={{ fontSize: 17 }}>Tu biblioteca está vacía</strong>
                  <p>Agrega un EPUB o convierte un PDF. También puedes soltar el archivo aquí.</p>
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center', marginTop: 6 }}>
                    <AddBookButton />
                    <Link to="/convertir" className="btn btn-tinted btn-small press">
                      <IconConvert size={16} />
                      Convertir un PDF
                    </Link>
                  </div>
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(290px, 1fr))', gap: 24 }}>
                  {reading.map((b, i) => (
                    <ContinueCard key={b.id} book={b} delay={i * 50} />
                  ))}
                  {reading.length === 0 && <p className="muted">Terminaste todo lo que tienes. Agrega otro libro.</p>}
                </div>
              )}
            </section>
          </>
        )}
      </main>

      {modal === 'racha' && <StreakOverlay current={streak.data?.current ?? 0} best={streak.data?.best ?? 0} onClose={() => setModal(null)} />}
      {modal === 'leidos' && (
        <Sheet title={`Libros leídos · ${finished.length}`} onClose={() => setModal(null)} wide>
          {finished.length === 0 ? (
            <p className="muted" style={{ margin: 0 }}>
              Cuando termines un libro aparece aquí. Se marca solo al llegar al final, o desde su ficha.
            </p>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(96px, 1fr))', gap: '18px 14px' }}>
              {finished.map((b, i) => (
                <Link key={b.id} to={`/libro/${b.id}`} className="book-link press" style={{ display: 'flex', flexDirection: 'column', gap: 6, color: 'var(--ink)', animation: `rise 280ms var(--ease-out) ${i * 40}ms both` }}>
                  <Cover book={b} width={96} style={{ width: '100%' }} />
                  <span style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.25 }}>{b.title}</span>
                  <span className="small muted" style={{ marginTop: -4 }}>
                    {new Date(b.finishedAt!).toLocaleDateString('es', { month: 'long', year: 'numeric' })}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </Sheet>
      )}
    </Shell>
  );
}
