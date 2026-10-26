import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useBooks, type Book } from '../api';
import { AddBookButton } from '../components/AddBook';
import { Cover } from '../components/Cover';
import { IconCheck, IconChevronDown, IconGrid, IconList, IconSearch } from '../components/Icons';
import { Popover } from '../components/Overlay';
import { ServerError, Shell } from '../components/Shell';
import { formatBytes, normalize, relativeDay } from '../lib/format';

type Filter = 'todos' | 'leyendo' | 'porleer' | 'leidos' | 'pdf';
type Sort = 'recientes' | 'titulo' | 'autor' | 'progreso';

const group = (b: Book) => (b.finishedAt ? 'leidos' : b.progress > 0 ? 'leyendo' : 'porleer');

const filters: { id: Filter; label: string; test: (b: Book) => boolean }[] = [
  { id: 'todos', label: 'Todos', test: () => true },
  { id: 'leyendo', label: 'Leyendo', test: (b) => group(b) === 'leyendo' },
  { id: 'porleer', label: 'Por leer', test: (b) => group(b) === 'porleer' },
  { id: 'leidos', label: 'Leídos', test: (b) => group(b) === 'leidos' },
  { id: 'pdf', label: 'De PDF', test: (b) => b.origin === 'pdf' },
];

const sorts: { id: Sort; label: string; cmp: (a: Book, b: Book) => number }[] = [
  { id: 'recientes', label: 'Recientes', cmp: (a, b) => (b.lastOpenedAt ?? b.addedAt) - (a.lastOpenedAt ?? a.addedAt) },
  { id: 'titulo', label: 'Título', cmp: (a, b) => a.title.localeCompare(b.title, 'es') },
  { id: 'autor', label: 'Autor', cmp: (a, b) => a.author.localeCompare(b.author, 'es') },
  { id: 'progreso', label: 'Progreso', cmp: (a, b) => b.progress - a.progress },
];

function status(b: Book) {
  const g = group(b);
  return g === 'leidos' ? 'Leído' : g === 'porleer' ? 'Sin empezar' : `${Math.round(b.progress * 100)} %`;
}

export default function Library() {
  const books = useBooks();
  const [filter, setFilter] = useState<Filter>('todos');
  const [sort, setSort] = useState<Sort>('recientes');
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [sortOpen, setSortOpen] = useState(false);
  const [q, setQ] = useState('');

  const all = books.data ?? [];
  const shown = useMemo(() => {
    const f = filters.find((x) => x.id === filter)!;
    const s = sorts.find((x) => x.id === sort)!;
    const nq = normalize(q.trim());
    return all.filter((b) => f.test(b) && (!nq || normalize(`${b.title} ${b.author}`).includes(nq))).sort(s.cmp);
  }, [all, filter, sort, q]);

  const reading = all.filter((b) => group(b) === 'leyendo').length;
  const bytes = all.reduce((s, b) => s + b.fileSize, 0);

  return (
    <Shell back={{ to: '/', label: 'Inicio' }} actions={<AddBookButton />}>
      <main className="page" style={{ maxWidth: 1200 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, margin: '12px 0 18px' }}>
          <div>
            <h1 className="large-title" style={{ margin: 0 }}>
              Biblioteca
            </h1>
            <div className="muted num" style={{ marginTop: 2 }}>
              {all.length} {all.length === 1 ? 'libro' : 'libros'} · {reading} en curso · {formatBytes(bytes)} en SQL Server
            </div>
          </div>
          <div role="search" className="search compact" style={{ flex: '0 1 320px' }}>
            <IconSearch size={16} />
            <input type="search" aria-label="Buscar en la biblioteca" placeholder="Buscar en la biblioteca" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingBottom: 14, borderBottom: '0.5px solid var(--hair)' }}>
          <div className="seg" role="group" aria-label="Filtrar" style={{ overflowX: 'auto', maxWidth: '100%' }}>
            {filters.map((f) => (
              <button key={f.id} type="button" aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}>
                {f.label} <span className="muted num" style={{ fontWeight: 400 }}>{all.filter(f.test).length}</span>
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div className="anchor">
              <button type="button" className="btn-ghost press" aria-haspopup="menu" aria-expanded={sortOpen} onClick={() => setSortOpen(!sortOpen)} style={{ color: 'var(--ink)', fontSize: 13 }}>
                <span className="muted">Ordenar:</span> <strong>{sorts.find((s) => s.id === sort)!.label}</strong>
                <IconChevronDown size={12} />
              </button>
              <Popover open={sortOpen} onClose={() => setSortOpen(false)} width={200} label="Ordenar">
                {sorts.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    role="menuitemradio"
                    aria-checked={sort === s.id}
                    className="menu-item"
                    style={{ minHeight: 34, fontSize: 14 }}
                    onClick={() => {
                      setSort(s.id);
                      setSortOpen(false);
                    }}
                  >
                    <span style={{ width: 14, color: 'var(--accent)' }}>{sort === s.id && <IconCheck size={14} />}</span>
                    {s.label}
                  </button>
                ))}
              </Popover>
            </div>
            <div className="seg" role="group" aria-label="Vista">
              <button type="button" aria-label="Cuadrícula" aria-pressed={view === 'grid'} onClick={() => setView('grid')} style={{ padding: '0 9px' }}>
                <IconGrid size={15} />
              </button>
              <button type="button" aria-label="Lista" aria-pressed={view === 'list'} onClick={() => setView('list')} style={{ padding: '0 9px' }}>
                <IconList size={15} />
              </button>
            </div>
          </div>
        </div>

        {books.error ? (
          <div style={{ marginTop: 22 }}>
            <ServerError error={books.error} />
          </div>
        ) : !books.loading && shown.length === 0 ? (
          <p className="muted" style={{ marginTop: 22 }}>
            {all.length === 0 ? 'Todavía no hay libros. Agrega un EPUB o convierte un PDF.' : 'Ningún libro coincide.'}
          </p>
        ) : view === 'grid' ? (
          <div style={{ marginTop: 22, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(132px, 1fr))', gap: '26px 20px' }}>
            {shown.map((b, i) => (
              <Link key={b.id} to={`/libro/${b.id}`} className="book-link press" style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0, color: 'var(--ink)', animation: `rise 280ms var(--ease-out) ${Math.min(i, 12) * 30}ms both` }}>
                <Cover book={b} width={132} style={{ width: '100%' }} />
                <span className="ellipsis" style={{ fontSize: 14, fontWeight: 600 }}>
                  {b.title}
                </span>
                <span className="small muted num" style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: -3 }}>
                  {group(b) === 'leyendo' && (
                    <span className="progress" style={{ width: 36, height: 3 }}>
                      <span style={{ width: `${Math.round(b.progress * 100)}%` }} />
                    </span>
                  )}
                  {status(b)}
                </span>
              </Link>
            ))}
          </div>
        ) : (
          <div role="table" aria-label="Libros" className="group" style={{ marginTop: 16, overflowX: 'auto' }}>
            <div role="row" className="small muted" style={{ display: 'grid', gridTemplateColumns: 'minmax(240px, 3fr) minmax(140px, 1.3fr) 76px minmax(120px, 1fr)', gap: 16, padding: '10px 16px', minWidth: 640, fontWeight: 600, borderBottom: '0.5px solid var(--hair)' }}>
              <span role="columnheader">Título</span>
              <span role="columnheader">Progreso</span>
              <span role="columnheader">Origen</span>
              <span role="columnheader">Última lectura</span>
            </div>
            {shown.map((b, i) => (
              <Link key={b.id} to={`/libro/${b.id}`} role="row" className="row" style={{ display: 'grid', gridTemplateColumns: 'minmax(240px, 3fr) minmax(140px, 1.3fr) 76px minmax(120px, 1fr)', gap: 16, alignItems: 'center', minWidth: 640, padding: '8px 16px', borderBottom: i === shown.length - 1 ? 0 : '0.5px solid var(--hair)' }}>
                <span role="cell" style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                  <Cover book={b} width={30} style={{ borderRadius: '2px 3px 3px 2px' }} />
                  <span style={{ minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                    <span className="ellipsis" style={{ fontWeight: 500 }}>
                      {b.title}
                    </span>
                    <span className="small muted ellipsis">{b.author}</span>
                  </span>
                </span>
                <span role="cell" className="small muted num" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span className="progress" style={{ flex: 1, maxWidth: 90 }}>
                    <span style={{ width: `${Math.round(b.progress * 100)}%`, background: b.finishedAt ? 'var(--olive)' : undefined }} />
                  </span>
                  {status(b)}
                </span>
                <span role="cell" className="small muted">
                  {b.origin.toUpperCase()}
                </span>
                <span role="cell" className="small muted">
                  {b.lastOpenedAt ? relativeDay(b.lastOpenedAt) : 'Sin abrir'}
                </span>
              </Link>
            ))}
          </div>
        )}
      </main>
    </Shell>
  );
}
