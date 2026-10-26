import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from '../components/Nav';
import { api, invalidate, useHighlights, useQuery, useSessions } from '../api';
import { Cover } from '../components/Cover';
import { IconChart, IconChevron, IconCopy, IconDownload, IconFile, IconImage, IconNotes, IconTrash } from '../components/Icons';
import { Sheet } from '../components/Overlay';
import { ServerError, Shell } from '../components/Shell';
import { useToast } from '../components/Toast';
import { highlightColors } from '../lib/colors';
import { formatBytes, formatHours, formatNumber, languageName, relativeDay, slug } from '../lib/format';
import { cardStyles, exportNotes, renderQuoteCard, shareOrDownload, type CardStyle } from '../lib/share';
import { averagePace, paceByBook } from '../lib/stats';

export default function BookPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const book = useQuery(['books'], () => api.books.get(id), [id]);
  const highlights = useHighlights(id);
  const sessions = useSessions();
  const [style, setStyle] = useState<CardStyle>('cuero');
  const [quoteId, setQuoteId] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);

  const b = book.data;
  const hl = highlights.data ?? [];
  const paces = useMemo(() => paceByBook(sessions.data ?? [], b ? [b] : []), [sessions.data, b]);
  const allPaces = useMemo(() => averagePace(paceByBook(sessions.data ?? [], b ? [b] : [])), [sessions.data, b]);

  if (book.error) {
    return (
      <Shell back={{ to: '/biblioteca', label: 'Biblioteca' }}>
        <main className="page">
          <ServerError error={book.error} />
        </main>
      </Shell>
    );
  }
  if (!b) return <Shell back={{ to: '/', label: 'Inicio' }}><main className="page" /></Shell>;

  const pct = Math.round(b.progress * 100);
  // Remaining time at the book's own pace; without its own data, a typical pace.
  const wpm = paces[0]?.wpm ?? allPaces ?? 230;
  const remaining = (b.wordCount * (1 - b.progress)) / wpm;

  const quotes = hl.length > 0 ? hl.map((h) => ({ id: h.id, text: h.text, where: h.chapter, mark: highlightColors[h.color].mark })) : b.firstLines ? [{ id: 'first', text: b.firstLines, where: 'Primeras líneas', mark: 'var(--hl-ocre)' }] : [];
  const quote = quotes.find((q) => q.id === quoteId) ?? quotes[0];
  const card = cardStyles[style];

  async function shareImage() {
    if (!quote || !b) return;
    const blob = await renderQuoteCard(quote.text, b, style);
    const r = await shareOrDownload(blob, `cita-${slug(b.title)}.png`, b.title);
    if (r === 'downloaded') toast('Imagen guardada');
  }

  async function copyQuote() {
    if (!quote || !b) return;
    await navigator.clipboard.writeText(`«${quote.text}»\n— ${b.author}, ${b.title}`);
    toast('Cita copiada');
  }

  async function sendEpub() {
    if (!b) return;
    const file = await api.books.file(b.id);
    const r = await shareOrDownload(new Blob([file], { type: 'application/epub+zip' }), `${slug(b.title)}.epub`, b.title);
    if (r === 'downloaded') toast('EPUB descargado');
  }

  async function shareProgress() {
    if (!b) return;
    const text = `Voy en el ${pct} % de «${b.title}», de ${b.author}.`;
    if (navigator.share) await navigator.share({ text }).catch(() => undefined);
    else {
      await navigator.clipboard.writeText(text);
      toast('Copiado para compartir');
    }
  }

  async function toggleFinished() {
    if (!b) return;
    await api.books.update(b.id, b.finishedAt ? { finishedAt: null } : { finishedAt: Date.now(), progress: 1 });
    invalidate('books');
    toast(b.finishedAt ? 'Lo quitaste de leídos' : 'Marcado como leído');
  }

  async function remove() {
    if (!b) return;
    await api.books.remove(b.id);
    invalidate('books', 'highlights', 'sessions');
    toast('Libro eliminado');
    navigate('/biblioteca');
  }

  const facts = [
    { label: 'Palabras', value: b.wordCount >= 10000 ? `${Math.round(b.wordCount / 1000)} mil` : formatNumber(b.wordCount), caption: 'aproximadas' },
    { label: 'Capítulos', value: String(b.chapterCount), caption: 'en el índice' },
    { label: 'Idioma', value: (b.language || '—').slice(0, 2).toUpperCase(), caption: languageName(b.language) },
    { label: pct > 0 ? 'Te faltan' : 'Se lee en', value: b.finishedAt ? '—' : formatHours(remaining), caption: `a ${wpm} ppm` },
    { label: 'Archivo', value: formatBytes(b.fileSize), caption: b.origin === 'pdf' ? 'convertido' : 'EPUB' },
    { label: 'Agregado', value: relativeDay(b.addedAt), caption: new Date(b.addedAt).getFullYear().toString() },
  ];

  const actions = [
    { label: 'Guardar imagen', hint: 'Para historias o TikTok', Icon: IconImage, run: shareImage, disabled: !quote },
    { label: 'Copiar cita', hint: 'Con título y autor', Icon: IconCopy, run: copyQuote, disabled: !quote },
    { label: 'Enviar el EPUB', hint: 'A otro dispositivo', Icon: IconDownload, run: sendEpub, disabled: false },
    { label: 'Exportar notas', hint: hl.length ? 'Markdown' : 'Sin subrayados todavía', Icon: IconNotes, run: async () => exportNotes(b, hl), disabled: hl.length === 0 },
    { label: 'Compartir progreso', hint: `${pct} %`, Icon: IconChart, run: shareProgress, disabled: false },
  ];

  return (
    <Shell back={{ to: '/', label: 'Inicio' }}>
      <main className="page">
        <section aria-label="El libro" className="rise" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', gap: 32 }}>
          <Cover book={b} width={200} style={{ boxShadow: '0 2px 4px rgba(43,33,25,0.18), 0 24px 48px rgba(43,33,25,0.26)' }} />
          <div style={{ flex: '999 1 360px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6, paddingBottom: 4 }}>
            <span className="small muted" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <IconFile size={14} />
              {b.origin === 'pdf' ? `Convertido de PDF · ${b.fileName}` : b.fileName}
            </span>
            <h1 className="large-title" style={{ margin: 0 }}>
              {b.title}
            </h1>
            <span style={{ fontSize: 20, fontWeight: 500, color: 'var(--accent)', letterSpacing: '-0.01em' }}>{b.author}</span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 14 }}>
              <Link to={`/leer/${b.id}`} className="btn btn-filled press">
                {pct === 0 ? 'Empezar a leer' : b.finishedAt ? 'Volver a leer' : 'Continuar'}
                {pct > 0 && !b.finishedAt && <span className="num" style={{ opacity: 0.75, fontWeight: 500 }}>{pct} %</span>}
              </Link>
              <a href="#compartir" className="btn btn-tinted press" onClick={(e) => { e.preventDefault(); document.getElementById('compartir')?.scrollIntoView({ behavior: 'smooth' }); }}>
                Compartir
              </a>
              <button type="button" className="btn-ghost press" onClick={() => void toggleFinished()}>
                {b.finishedAt ? 'Quitar de leídos' : 'Marcar como leído'}
              </button>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 12, maxWidth: 440 }}>
              <span className="progress" style={{ flex: 1 }}>
                <span style={{ width: `${pct}%` }} />
              </span>
              <span className="small muted">{b.chapterLabel ? b.chapterLabel.trim() : pct > 0 ? `${pct} %` : 'Sin empezar'}</span>
            </div>
          </div>
        </section>

        <div role="list" aria-label="Datos del archivo" style={{ marginTop: 32, display: 'flex', overflowX: 'auto', padding: '14px 0', borderTop: '0.5px solid var(--hair)', borderBottom: '0.5px solid var(--hair)' }}>
          {facts.map((f, i) => (
            <div key={f.label} role="listitem" style={{ flex: '1 0 120px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, padding: '0 12px', borderLeft: i ? '0.5px solid var(--hair)' : 0, textAlign: 'center' }}>
              <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--ink-2)' }}>{f.label}</span>
              <span className="num" style={{ fontSize: 20, fontWeight: 600, letterSpacing: '-0.01em' }}>
                {f.value}
              </span>
              <span className="small muted">{f.caption}</span>
            </div>
          ))}
        </div>

        <div style={{ marginTop: 36, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 32 }}>
          <section aria-labelledby="lineas-titulo">
            <h2 id="lineas-titulo" className="h2" style={{ marginBottom: 10 }}>
              Primeras líneas
            </h2>
            {b.firstLines ? (
              <p className="serif" style={{ margin: 0, fontSize: 19, lineHeight: 1.6 }}>
                {b.firstLines}
              </p>
            ) : (
              <p className="muted" style={{ margin: 0 }}>
                No encontré un párrafo de apertura claro en el archivo.
              </p>
            )}
          </section>

          <section aria-labelledby="indice-titulo">
            <div className="section-head" style={{ marginBottom: 10 }}>
              <h2 id="indice-titulo" className="h2">
                Índice
              </h2>
              <span className="small muted">{b.toc.length} entradas</span>
            </div>
            {b.toc.length === 0 ? (
              <p className="muted" style={{ margin: 0 }}>
                Este EPUB no trae índice.
              </p>
            ) : (
              <div className="group">
                {b.toc.slice(0, 7).map((t, i) => (
                  <Link key={i} to={`/leer/${b.id}?href=${encodeURIComponent(t.href)}`} className="row">
                    <span className="small muted num" style={{ width: 20 }}>
                      {i + 1}
                    </span>
                    <span className="row-body">
                      <span className="ellipsis" style={{ flex: 1 }}>
                        {t.label.trim()}
                      </span>
                      {b.chapterLabel && b.chapterLabel.trim() === t.label.trim() && <span className="small" style={{ color: 'var(--accent)', fontWeight: 600 }}>Leyendo</span>}
                      <IconChevron size={12} className="chevron" />
                    </span>
                  </Link>
                ))}
              </div>
            )}
            {b.toc.length > 7 && <p className="group-foot">y {b.toc.length - 7} más dentro del lector</p>}
          </section>
        </div>

        <section id="compartir" aria-labelledby="compartir-titulo" className="section" style={{ marginTop: 44 }}>
          <h2 id="compartir-titulo" className="h2">
            Compartir una cita
          </h2>
          <p className="muted" style={{ margin: '4px 0 16px' }}>
            {hl.length ? 'Elige uno de tus subrayados y el color de la tarjeta.' : 'Cuando subrayes algo en el lector, aparece aquí. Mientras tanto, puedes usar las primeras líneas.'}
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 28, alignItems: 'flex-start' }}>
            <div style={{ flex: '0 0 272px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
              <div style={{ width: 272, height: 340, padding: '26px 24px 22px', borderRadius: 18, background: card.bg, color: card.fg, display: 'flex', flexDirection: 'column', boxShadow: '0 1px 2px rgba(43,33,25,0.12), 0 18px 40px rgba(43,33,25,0.18)', transition: 'background-color 240ms ease, color 240ms ease', overflow: 'hidden' }}>
                <span className="serif" style={{ fontSize: quote && quote.text.length > 160 ? 17 : 23, fontWeight: 500, lineHeight: 1.32, overflow: 'hidden' }}>
                  {quote?.text ?? 'Sin citas todavía'}
                </span>
                <span style={{ marginTop: 'auto', paddingTop: 12, fontSize: 13, lineHeight: 1.4 }}>
                  <strong style={{ fontWeight: 600 }}>{b.title}</strong>
                  <br />
                  <span style={{ opacity: 0.75 }}>{b.author}</span>
                </span>
                <span style={{ marginTop: 14, paddingTop: 10, borderTop: `0.5px solid ${card.rule}`, fontSize: 11, fontWeight: 600, opacity: 0.7 }}>Leído en Atril</span>
              </div>
              <div role="radiogroup" aria-label="Color de la tarjeta" style={{ display: 'flex', gap: 12 }}>
                {(Object.keys(cardStyles) as CardStyle[]).map((k) => (
                  <button
                    key={k}
                    type="button"
                    role="radio"
                    aria-checked={style === k}
                    aria-label={cardStyles[k].name}
                    className="press"
                    onClick={() => setStyle(k)}
                    style={{ width: 30, height: 30, padding: 0, border: 0, borderRadius: 15, background: cardStyles[k].bg, boxShadow: style === k ? '0 0 0 2px var(--bg), 0 0 0 4px var(--accent)' : '0 0 0 0.5px var(--hair)' }}
                  />
                ))}
              </div>
            </div>

            <div style={{ flex: '999 1 340px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 20 }}>
              {quotes.length > 0 && (
                <div role="radiogroup" aria-label="Cita" className="group">
                  {quotes.slice(0, 6).map((q) => (
                    <button key={q.id} type="button" role="radio" aria-checked={quote?.id === q.id} className="row" onClick={() => setQuoteId(q.id)}>
                      <span className="row-body" style={{ display: 'block' }}>
                        <span className="serif" style={{ fontSize: 16, lineHeight: 1.5, background: q.mark, borderRadius: 3, padding: '1px 3px', WebkitBoxDecorationBreak: 'clone', boxDecorationBreak: 'clone' }}>
                          {q.text.length > 180 ? `${q.text.slice(0, 180)}…` : q.text}
                        </span>
                        {q.where && <span className="small muted" style={{ display: 'block', marginTop: 3 }}>{q.where}</span>}
                      </span>
                      <span style={{ width: 20, color: 'var(--accent)', fontWeight: 700 }}>{quote?.id === q.id ? '✓' : ''}</span>
                    </button>
                  ))}
                </div>
              )}
              <div className="group">
                {actions.map(({ label, hint, Icon, run, disabled }) => (
                  <button key={label} type="button" className="row" disabled={disabled} onClick={() => void run().catch((e: Error) => toast(e.message))}>
                    <Icon size={20} style={{ color: 'var(--accent)' }} />
                    <span className="row-body" style={{ justifyContent: 'space-between' }}>
                      <span>{label}</span>
                      <span className="small muted" style={{ whiteSpace: 'nowrap' }}>
                        {hint}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
              <button type="button" className="btn-ghost press" style={{ alignSelf: 'flex-start', color: 'var(--ink-2)' }} onClick={() => setConfirm(true)}>
                <IconTrash size={16} />
                Eliminar de la biblioteca
              </button>
            </div>
          </div>
        </section>
      </main>

      {confirm && (
        <Sheet title="¿Eliminar este libro?" onClose={() => setConfirm(false)} action="Cancelar">
          <p style={{ margin: '0 0 16px' }}>
            Se borran de SQL Server el EPUB, tus {hl.length} subrayados y su historial de lectura. No se puede deshacer.
          </p>
          <button type="button" className="btn btn-filled press" style={{ width: '100%' }} onClick={() => void remove()}>
            Eliminar «{b.title}»
          </button>
        </Sheet>
      )}
    </Shell>
  );
}
