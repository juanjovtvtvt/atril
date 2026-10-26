import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useBooks, useHighlights, type HighlightColor } from '../api';
import { IconArrowOut, IconCopy, IconDownload, IconNotes, IconPencil, IconSearch, IconShare } from '../components/Icons';
import { ServerError, Shell } from '../components/Shell';
import { useToast } from '../components/Toast';
import { highlightColors, highlightOrder } from '../lib/colors';
import { normalize, shortDate } from '../lib/format';
import { exportNotes } from '../lib/share';

export default function Notes() {
  const books = useBooks();
  const highlights = useHighlights();
  const toast = useToast();
  const [bookId, setBookId] = useState<string>('todos');
  const [color, setColor] = useState<HighlightColor | 'todos'>('todos');
  const [q, setQ] = useState('');

  const all = highlights.data ?? [];
  const byId = new Map((books.data ?? []).map((b) => [b.id, b]));
  const withNotes = (books.data ?? []).filter((b) => all.some((h) => h.bookId === b.id));
  const current = bookId === 'todos' ? null : byId.get(bookId) ?? null;

  const inBook = all.filter((h) => bookId === 'todos' || h.bookId === bookId);
  const filtered = useMemo(() => {
    const nq = normalize(q.trim());
    return inBook.filter((h) => (color === 'todos' || h.color === color) && (!nq || normalize(`${h.text} ${h.note}`).includes(nq)));
  }, [inBook, color, q]);

  // Grouped by chapter within a book, or by book in "All notes".
  const groups: { label: string; items: typeof filtered }[] = [];
  for (const h of [...filtered].sort((a, b) => a.createdAt - b.createdAt)) {
    const label = bookId === 'todos' ? byId.get(h.bookId)?.title ?? 'Libro' : h.chapter || 'Sin capítulo';
    const g = groups.find((x) => x.label === label);
    if (g) g.items.push(h);
    else groups.push({ label, items: [h] });
  }
  const notesCount = inBook.filter((h) => h.note).length;

  return (
    <Shell
      back={{ to: '/', label: 'Inicio' }}
      actions={
        <button
          type="button"
          className="btn-ghost strong press"
          disabled={inBook.length === 0}
          onClick={() => exportNotes(current ?? { title: 'Todas mis notas', author: 'Atril' }, inBook)}
        >
          <IconDownload size={16} />
          Exportar
        </button>
      }
    >
      <main className="page" style={{ maxWidth: 1200 }}>
        <h1 className="large-title" style={{ marginBottom: 2 }}>
          Notas
        </h1>
        <div className="muted num">
          {all.length} {all.length === 1 ? 'subrayado' : 'subrayados'} y {all.filter((h) => h.note).length} notas en {withNotes.length} {withNotes.length === 1 ? 'libro' : 'libros'}
        </div>

        {highlights.error ? (
          <div style={{ marginTop: 20 }}>
            <ServerError error={highlights.error} />
          </div>
        ) : all.length === 0 && !highlights.loading ? (
          <div className="empty" style={{ marginTop: 24 }}>
            <IconNotes size={32} style={{ color: 'var(--accent)' }} />
            <strong style={{ fontSize: 17 }}>Aún no subrayas nada</strong>
            <p>En el lector, selecciona un texto y elige un color. Tus subrayados y notas se guardan aquí.</p>
          </div>
        ) : (
          <div style={{ marginTop: 20, display: 'flex', flexWrap: 'wrap', gap: 28, alignItems: 'flex-start' }}>
            <nav aria-label="Libros con notas" style={{ flex: '1 1 250px', minWidth: 0, maxWidth: '100%' }}>
              <div role="search" className="search compact" style={{ marginBottom: 10 }}>
                <IconSearch size={15} />
                <input type="search" aria-label="Buscar en tus notas" placeholder="Buscar en tus notas" value={q} onChange={(e) => setQ(e.target.value)} />
              </div>
              {[{ id: 'todos', title: 'Todas las notas', color: '' }, ...withNotes].map((b) => (
                <button
                  key={b.id}
                  type="button"
                  aria-pressed={bookId === b.id}
                  className="row press"
                  onClick={() => setBookId(b.id)}
                  style={{ minHeight: 44, padding: '6px 10px', borderRadius: 10, background: bookId === b.id ? 'var(--fill)' : 'transparent' }}
                >
                  {b.id === 'todos' ? (
                    <IconNotes size={20} style={{ color: 'var(--accent)', width: 22 }} />
                  ) : (
                    <span style={{ width: 22, height: 32, flex: '0 0 auto', borderRadius: '2px 3px 3px 2px', background: b.color, boxShadow: 'inset 2px 0 0 rgba(0,0,0,0.2)' }} />
                  )}
                  <span className="ellipsis" style={{ flex: 1, fontSize: 14, fontWeight: bookId === b.id ? 600 : 400 }}>
                    {b.title}
                  </span>
                  <span className="small muted num">{b.id === 'todos' ? all.length : all.filter((h) => h.bookId === b.id).length}</span>
                </button>
              ))}
            </nav>

            <section aria-labelledby="notas-titulo" style={{ flex: '999 1 520px', minWidth: 0 }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingBottom: 12, borderBottom: '0.5px solid var(--hair)' }}>
                <div style={{ minWidth: 0 }}>
                  <h2 id="notas-titulo" className="h2">
                    {current?.title ?? 'Todas las notas'}
                  </h2>
                  <div className="small muted">
                    {inBook.length} subrayados · {notesCount} {notesCount === 1 ? 'nota' : 'notas'}
                    {current ? ` · ${current.author}` : ''}
                  </div>
                </div>
                <div role="radiogroup" aria-label="Filtrar por color" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <button type="button" role="radio" aria-checked={color === 'todos'} className="press" onClick={() => setColor('todos')} style={{ height: 26, padding: '0 9px', border: 0, borderRadius: 13, background: 'var(--fill)', fontSize: 11, fontWeight: 700, boxShadow: color === 'todos' ? '0 0 0 2px var(--bg), 0 0 0 3.5px var(--accent)' : 'none' }}>
                    Todo
                  </button>
                  {highlightOrder.map((c) => (
                    <button key={c} type="button" role="radio" aria-checked={color === c} aria-label={highlightColors[c].name} className="press" onClick={() => setColor(c)} style={{ width: 26, height: 26, border: 0, borderRadius: 13, background: highlightColors[c].mark, boxShadow: color === c ? '0 0 0 2px var(--bg), 0 0 0 3.5px var(--accent)' : '0 0 0 0.5px var(--hair)' }} />
                  ))}
                </div>
              </div>

              {groups.map((g) => (
                <div key={g.label} style={{ marginTop: 22 }}>
                  <div className="small muted" style={{ fontWeight: 600, marginBottom: 4 }}>
                    {g.label}
                  </div>
                  {g.items.map((h, i) => (
                    <article key={h.id} style={{ display: 'flex', gap: 14, padding: '14px 0', borderBottom: '0.5px solid var(--hair)', animation: `rise 260ms var(--ease-out) ${Math.min(i, 10) * 35}ms both` }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p className="serif" style={{ margin: 0, fontSize: 18, lineHeight: 1.55 }}>
                          <span style={{ background: highlightColors[h.color].mark, borderRadius: 3, padding: '1px 3px', WebkitBoxDecorationBreak: 'clone', boxDecorationBreak: 'clone' }}>{h.text}</span>
                        </p>
                        {h.note && (
                          <p style={{ margin: '8px 0 0', display: 'flex', gap: 6, fontSize: 14 }}>
                            <IconPencil size={14} style={{ color: 'var(--accent)', flex: '0 0 auto', marginTop: 3 }} />
                            {h.note}
                          </p>
                        )}
                        <div className="small muted" style={{ marginTop: 6 }}>
                          {bookId === 'todos' && h.chapter ? `${h.chapter} · ` : ''}
                          {shortDate(h.createdAt)}
                        </div>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <button
                          type="button"
                          className="icon-btn press"
                          aria-label="Copiar"
                          style={{ width: 32, height: 32, color: 'var(--ink-2)' }}
                          onClick={() => {
                            void navigator.clipboard.writeText(h.text);
                            toast('Copiado');
                          }}
                        >
                          <IconCopy size={16} />
                        </button>
                        <Link to={`/libro/${h.bookId}#compartir`} className="icon-btn press" aria-label="Compartir como tarjeta" style={{ width: 32, height: 32, color: 'var(--ink-2)' }}>
                          <IconShare size={16} />
                        </Link>
                        <Link to={`/leer/${h.bookId}?cfi=${encodeURIComponent(h.cfi)}`} className="icon-btn press" aria-label="Ir a la página" style={{ width: 32, height: 32, color: 'var(--ink-2)' }}>
                          <IconArrowOut size={16} />
                        </Link>
                      </div>
                    </article>
                  ))}
                </div>
              ))}
              {filtered.length === 0 && (
                <p className="muted" style={{ padding: '40px 0', textAlign: 'center' }}>
                  Nada coincide con ese filtro.
                </p>
              )}
            </section>
          </div>
        )}
      </main>
    </Shell>
  );
}
