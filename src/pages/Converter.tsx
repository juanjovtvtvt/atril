import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from '../components/Nav';
import { useBooks } from '../api';
import { IconChevron, IconFile, IconUpload } from '../components/Icons';
import { ServerError, Shell } from '../components/Shell';
import { useToast } from '../components/Toast';
import { buildEpub } from '../lib/buildEpub';
import { importEpub } from '../lib/epub';
import { download, formatBytes, formatNumber, relativeDay, slug } from '../lib/format';
import { convertPdf, type ConversionResult, type ConvertOptions, type Step } from '../lib/pdfToEpub';

const stepLabels: { id: Step | 'save'; label: string }[] = [
  { id: 'extract', label: 'Extraer texto' },
  { id: 'paragraphs', label: 'Armar párrafos' },
  { id: 'chapters', label: 'Detectar capítulos' },
  { id: 'build', label: 'Generar EPUB' },
];

const optionLabels: { id: keyof ConvertOptions; label: string }[] = [
  { id: 'chapters', label: 'Detectar capítulos' },
  { id: 'headers', label: 'Quitar encabezados y números de página' },
  { id: 'hyphens', label: 'Unir palabras cortadas' },
];

type Phase = { step: Step; done: number; total: number } | null;

function StepIcon({ state }: { state: 'done' | 'active' | 'pending' }) {
  if (state === 'done')
    return (
      <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="10" fill="var(--olive)" />
        <path d="m7.5 12.3 3 3 6-6.3" fill="none" stroke="var(--surface)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  if (state === 'active')
    return (
      <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" style={{ animation: 'spin 800ms linear infinite' }}>
        <circle cx="12" cy="12" r="9" fill="none" stroke="var(--fill)" strokeWidth="2.6" />
        <path d="M12 3a9 9 0 0 1 9 9" fill="none" stroke="var(--accent)" strokeWidth="2.6" strokeLinecap="round" />
      </svg>
    );
  return (
    <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="9" fill="none" stroke="var(--ink-3)" strokeWidth="1.8" />
    </svg>
  );
}

export default function Converter() {
  const location = useLocation();
  const navigate = useNavigate();
  const toast = useToast();
  const books = useBooks();
  const input = useRef<HTMLInputElement>(null);
  const abort = useRef<AbortController | null>(null);

  const [file, setFile] = useState<File | null>((location.state as { file?: File } | null)?.file ?? null);
  const [options, setOptions] = useState<ConvertOptions>({ chapters: true, headers: true, hyphens: true });
  const [usedOptions, setUsedOptions] = useState<ConvertOptions | null>(null);
  const [phase, setPhase] = useState<Phase>(null);
  const [result, setResult] = useState<ConversionResult | null>(null);
  const [epub, setEpub] = useState<Blob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function convert(f: File, opts: ConvertOptions) {
    abort.current?.abort();
    const ctrl = new AbortController();
    abort.current = ctrl;
    setResult(null);
    setEpub(null);
    setError(null);
    setUsedOptions(opts);
    try {
      const r = await convertPdf(f, f.name, opts, (step, done, total) => setPhase({ step, done, total }), ctrl.signal);
      setPhase({ step: 'build', done: 0, total: 1 });
      const blob = await buildEpub({ title: r.title, author: r.author, chapters: r.chapters });
      if (ctrl.signal.aborted) return;
      setResult(r);
      setEpub(blob);
      setPhase(null);
    } catch (e) {
      if ((e as DOMException).name === 'AbortError') return;
      setPhase(null);
      setError(e instanceof Error ? e.message : 'No se pudo leer el PDF');
    }
  }

  useEffect(() => {
    if (file) void convert(file, options);
    return () => abort.current?.abort();
    // Only when the file changes; changing an option asks before converting again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file]);

  const order: (Step | 'save')[] = ['extract', 'paragraphs', 'chapters', 'build'];
  const stateOf = (id: Step | 'save') => {
    if (result) return 'done';
    if (!phase) return 'pending';
    const cur = order.indexOf(phase.step);
    const idx = order.indexOf(id);
    return idx < cur ? 'done' : idx === cur ? 'active' : 'pending';
  };
  const percent = result ? 100 : phase ? Math.round(((order.indexOf(phase.step) + (phase.total ? phase.done / phase.total : 0)) / order.length) * 100) : 0;
  const optionsChanged = usedOptions && JSON.stringify(usedOptions) !== JSON.stringify(options);

  const firstChapter = result?.chapters[0];
  const previewBlocks = useMemo(() => firstChapter?.blocks.slice(0, 5) ?? [], [firstChapter]);
  const converted = (books.data ?? []).filter((b) => b.origin === 'pdf').sort((a, b) => b.addedAt - a.addedAt).slice(0, 5);

  async function addToLibrary() {
    if (!epub || !result || !file) return;
    setSaving(true);
    try {
      const id = await importEpub(epub, file.name.replace(/\.pdf$/i, '.epub'), 'pdf');
      toast('Agregado a la biblioteca');
      navigate(`/libro/${id}`);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'No se pudo guardar');
      setSaving(false);
    }
  }

  function pick(f: File | undefined) {
    if (!f) return;
    if (!/\.pdf$/i.test(f.name) && f.type !== 'application/pdf') {
      toast('Eso no es un PDF');
      return;
    }
    setFile(f);
  }

  return (
    <Shell back={{ to: '/', label: 'Inicio' }}>
      <main className="page">
        <h1 className="large-title">Convertir PDF a EPUB</h1>
        <p className="subtitle">El PDF se procesa en este navegador. A la base de datos solo llega el EPUB resultante, si decides guardarlo.</p>

        <label
          className="press"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            e.stopPropagation();
            pick(e.dataTransfer.files[0]);
          }}
          style={{ position: 'relative', marginTop: 22, display: 'flex', alignItems: 'center', gap: 16, padding: '22px 24px', borderRadius: 16, border: '1.5px dashed rgba(118,96,72,0.4)', background: 'var(--fill-hover)', cursor: 'pointer' }}
        >
          <IconUpload size={36} style={{ color: 'var(--accent)', flex: '0 0 auto' }} />
          <span style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: 17, fontWeight: 600 }}>{file ? file.name : 'Suelta un PDF aquí'}</span>
            <span className="small muted">{file ? `${formatBytes(file.size)} · elige otro para reemplazarlo` : 'Funciona mejor con PDFs de texto (no escaneados).'}</span>
          </span>
          <span className="btn btn-tinted btn-small">Elegir archivo</span>
          <input ref={input} type="file" accept="application/pdf,.pdf" className="visually-hidden" onChange={(e) => pick(e.target.files?.[0] ?? undefined)} />
        </label>

        <div style={{ marginTop: 28, display: 'flex', flexWrap: 'wrap', gap: 28, alignItems: 'flex-start' }}>
          <section aria-labelledby="proceso-titulo" style={{ flex: '999 1 420px', minWidth: 0 }}>
            <h2 id="proceso-titulo" className="h2" style={{ marginBottom: 10 }}>
              Proceso
            </h2>
            <div className="group">
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px' }}>
                <span style={{ width: 34, height: 42, flex: '0 0 auto', borderRadius: 4, background: 'var(--rose-bg)', color: 'var(--rose-ink)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', paddingBottom: 5, fontSize: 9, fontWeight: 700 }}>PDF</span>
                <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                  <span className="ellipsis" style={{ fontWeight: 600 }}>
                    {file?.name ?? 'Ningún archivo todavía'}
                  </span>
                  <span className="small muted num">
                    {result ? `${result.pageCount} páginas · ${formatNumber(result.wordCount)} palabras` : phase ? `${percent} %` : 'Elige un PDF para empezar'}
                  </span>
                </span>
                {phase && (
                  <button type="button" className="btn-ghost press" onClick={() => { abort.current?.abort(); setPhase(null); }}>
                    Cancelar
                  </button>
                )}
              </div>
              <span className="progress" style={{ margin: '0 16px 6px' }}>
                <span style={{ width: `${percent}%`, transition: 'width 200ms ease-out' }} />
              </span>
              {stepLabels.map(({ id, label }) => {
                const st = stateOf(id);
                const meta =
                  id === 'extract' && phase?.step === 'extract' ? `página ${phase.done} de ${phase.total}` :
                  id === 'extract' && result ? `${result.pageCount} páginas` :
                  id === 'paragraphs' && result ? `${formatNumber(result.paragraphCount)} párrafos` :
                  id === 'chapters' && result ? `${result.chapters.length} ${result.chapters.length === 1 ? 'capítulo' : 'capítulos'}` :
                  id === 'build' && epub ? formatBytes(epub.size) : '';
                return (
                  <div key={id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '0 16px' }}>
                    <StepIcon state={st} />
                    <span style={{ flex: 1, display: 'flex', justifyContent: 'space-between', gap: 12, padding: '11px 0', borderTop: '0.5px solid var(--hair)' }}>
                      <span style={{ fontWeight: st === 'active' ? 600 : 400, color: st === 'pending' ? 'var(--ink-2)' : 'var(--ink)' }}>{label}</span>
                      <span className="small muted num">{meta}</span>
                    </span>
                  </div>
                );
              })}
            </div>
            {error && (
              <p role="alert" style={{ margin: '10px 16px 0', color: 'var(--accent)' }}>
                {error}
              </p>
            )}
          </section>

          <section aria-labelledby="opciones-titulo" style={{ flex: '1 1 300px', minWidth: 0 }}>
            <h2 id="opciones-titulo" className="h2" style={{ marginBottom: 10 }}>
              Opciones
            </h2>
            <div className="group">
              {optionLabels.map(({ id, label }) => (
                <button key={id} type="button" role="switch" aria-checked={options[id]} className="row" onClick={() => setOptions({ ...options, [id]: !options[id] })}>
                  <span className="row-body" style={{ justifyContent: 'space-between' }}>
                    <span>{label}</span>
                    <span className="switch" />
                  </span>
                </button>
              ))}
            </div>
            {optionsChanged && file ? (
              <button type="button" className="btn btn-tinted btn-small press" style={{ marginTop: 10 }} onClick={() => void convert(file, options)}>
                Volver a convertir con estas opciones
              </button>
            ) : (
              <p className="group-foot">Los PDF escaneados (imágenes) necesitan reconocimiento de texto, que todavía no está.</p>
            )}
          </section>
        </div>

        {result && epub && (
          <section aria-labelledby="vista-titulo" className="section rise">
            <div className="section-head" style={{ flexWrap: 'wrap' }}>
              <h2 id="vista-titulo" className="h2">
                Vista previa
              </h2>
              <span className="small" style={{ color: result.quality === 'buena' ? 'var(--olive-ink)' : 'var(--accent)' }}>
                {result.qualityNote}
                {result.removedLines > 0 && ` Quité ${result.removedLines} ${result.removedLines === 1 ? 'encabezado o número' : 'encabezados o números'} de página.`}
                {result.mendedWords > 0 && ` Uní ${result.mendedWords} ${result.mendedWords === 1 ? 'palabra cortada' : 'palabras cortadas'}.`}
              </span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16 }}>
              <figure style={{ margin: 0 }}>
                <div style={{ height: 320, padding: 20, borderRadius: 12, background: '#E9E1D4', overflow: 'hidden' }}>
                  <div style={{ height: '100%', padding: '16px 18px', background: '#FFFFFF', color: '#333', boxShadow: '0 1px 4px rgba(43,33,25,0.14)', fontFamily: "'Times New Roman', Times, serif", fontSize: 10, lineHeight: 1.45, overflow: 'hidden' }}>
                    {result.firstPageRaw.map((l, i) => (
                      <div key={i}>{l}</div>
                    ))}
                  </div>
                </div>
                <figcaption className="small muted" style={{ marginTop: 8 }}>
                  PDF original, página 1
                </figcaption>
              </figure>
              <figure style={{ margin: 0 }}>
                <div className="serif" style={{ height: 320, padding: '26px 30px', borderRadius: 12, background: 'var(--surface)', boxShadow: 'var(--edge)', overflow: 'hidden' }}>
                  {previewBlocks.map((b, i) =>
                    b.kind === 'p' ? (
                      <p key={i} style={{ margin: '0 0 0.8em', fontSize: 16, lineHeight: 1.6 }}>
                        {b.text}
                      </p>
                    ) : (
                      <h3 key={i} style={{ margin: '0 0 12px', fontSize: b.kind === 'h1' ? 21 : 18, lineHeight: 1.25, fontWeight: 600 }}>
                        {b.text}
                      </h3>
                    ),
                  )}
                </div>
                <figcaption className="small muted" style={{ marginTop: 8 }}>
                  EPUB resultante · {firstChapter?.title}
                </figcaption>
              </figure>
            </div>
            <div style={{ marginTop: 16, display: 'flex', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 10 }}>
              <button type="button" className="btn btn-tinted press" onClick={() => download(epub, `${slug(result.title)}.epub`)}>
                Guardar .epub
              </button>
              <button type="button" className="btn btn-filled press" disabled={saving} onClick={() => void addToLibrary()}>
                {saving ? 'Guardando…' : 'Agregar a la biblioteca'}
              </button>
            </div>
          </section>
        )}

        <section aria-labelledby="antes-titulo" className="section">
          <h2 id="antes-titulo" className="h2" style={{ marginBottom: 10 }}>
            Convertidos antes
          </h2>
          {books.error ? (
            <ServerError error={books.error} />
          ) : converted.length === 0 ? (
            <p className="muted" style={{ margin: 0 }}>
              Aún no has convertido ningún PDF.
            </p>
          ) : (
            <div className="group">
              {converted.map((b) => (
                <Link key={b.id} to={`/libro/${b.id}`} className="row">
                  <IconFile size={20} style={{ color: 'var(--ink-2)' }} />
                  <span className="row-body">
                    <span className="ellipsis" style={{ flex: 1 }}>
                      {b.title}
                    </span>
                    <span className="small muted" style={{ whiteSpace: 'nowrap' }}>
                      {relativeDay(b.addedAt)}
                    </span>
                    <IconChevron size={12} className="chevron" />
                  </span>
                </Link>
              ))}
            </div>
          )}
        </section>
      </main>
    </Shell>
  );
}
