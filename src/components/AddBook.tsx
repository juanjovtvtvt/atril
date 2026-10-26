import { useRef, useState } from 'react';
import { useNavigate } from './Nav';
import { IconBook, IconConvert, IconPlus } from './Icons';
import { Popover, Sheet } from './Overlay';
import { useToast } from './Toast';

/** Shared EPUB import: used by the menu, the phone's "+" button and drag & drop. */
export function useEpubImport() {
  const navigate = useNavigate();
  const toast = useToast();
  const [progress, setProgress] = useState<{ name: string; done: number; total: number } | null>(null);

  async function run(file: File) {
    setProgress({ name: file.name, done: 0, total: 0 });
    try {
      const { importEpub } = await import('../lib/epub');
      const id = await importEpub(file, file.name, 'epub', (done, total) => setProgress({ name: file.name, done, total }));
      toast('Libro agregado');
      navigate(`/libro/${id}`);
    } catch (e) {
      toast(e instanceof Error ? `No se pudo importar: ${e.message}` : 'No se pudo importar el EPUB');
    } finally {
      setProgress(null);
    }
  }

  const dialog = progress && (
    <Sheet title="Agregando libro" onClose={() => undefined} action="">
      <p className="muted" style={{ margin: '0 0 12px' }}>
        {progress.name}
      </p>
      <span className="progress">
        <span style={{ width: progress.total ? `${(progress.done / progress.total) * 100}%` : '8%' }} />
      </span>
      <p className="small muted num" style={{ margin: '8px 0 0' }}>
        {progress.total ? `Leyendo la sección ${progress.done} de ${progress.total}` : 'Abriendo el archivo…'}
      </p>
    </Sheet>
  );

  return { run, dialog };
}

export function AddBookButton({ compact }: { compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const { run, dialog } = useEpubImport();

  return (
    <div className="anchor">
      {compact ? (
        <button type="button" className="icon-btn press" aria-label="Agregar libro" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)} style={{ borderRadius: 18, background: 'var(--accent-tint)', color: 'var(--accent)' }}>
          <IconPlus size={18} />
        </button>
      ) : (
        <button type="button" className="btn-ghost strong press" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}>
          <IconPlus size={16} />
          Agregar libro
        </button>
      )}
      <Popover open={open} onClose={() => setOpen(false)} width={272} label="Agregar libro">
        <button
          type="button"
          className="menu-item"
          onClick={() => {
            setOpen(false);
            input.current?.click();
          }}
        >
          <IconBook size={22} style={{ color: 'var(--olive)' }} />
          <span style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: 14, fontWeight: 600 }}>Importar EPUB…</span>
            <span className="small muted">Ya está listo para leer</span>
          </span>
        </button>
        <button
          type="button"
          className="menu-item"
          onClick={() => {
            setOpen(false);
            navigate('/convertir');
          }}
        >
          <IconConvert size={22} style={{ color: 'var(--accent)' }} />
          <span style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: 14, fontWeight: 600 }}>Convertir un PDF…</span>
            <span className="small muted">Lo pasamos a EPUB primero</span>
          </span>
        </button>
        <div className="menu-sep" />
        <div className="small muted" style={{ padding: '4px 10px 6px' }}>
          También puedes soltar el archivo en la ventana.
        </div>
      </Popover>
      <input
        ref={input}
        type="file"
        accept=".epub,application/epub+zip"
        className="visually-hidden"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) void run(file);
        }}
      />
      {dialog}
    </div>
  );
}
