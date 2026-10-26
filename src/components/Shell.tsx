import { useState, type ReactNode } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useBooks, useHighlights } from '../api';
import { useEpubImport } from './AddBook';
import { IconBack, IconBook, IconConvert, IconHome, IconLibrary, IconNotes, IconSidebar } from './Icons';
import { useToast } from './Toast';

const sections = [
  { to: '/biblioteca', label: 'Biblioteca', Icon: IconLibrary, tint: 'var(--olive)' },
  { to: '/convertir', label: 'Convertidor', Icon: IconConvert, tint: 'var(--accent)' },
  { to: '/notas', label: 'Notas', Icon: IconNotes, tint: '#C07A2C' },
];

const tabs = [
  { to: '/', label: 'Inicio', Icon: IconHome },
  { to: '/biblioteca', label: 'Biblioteca', Icon: IconLibrary },
  { to: '/convertir', label: 'Convertir', Icon: IconConvert },
  { to: '/notas', label: 'Notas', Icon: IconNotes },
];

/**
 * Frame shared by every screen except the reader: translucent toolbar, sections panel that
 * slides in from the right (desktop) and tab bar (phone). It also accepts files dropped on the
 * window: an EPUB is imported, a PDF goes to the converter.
 */
export function Shell({ back, actions, children }: { back?: { to: string; label: string }; actions?: ReactNode; children: ReactNode }) {
  const [panel, setPanel] = useState(false);
  const [dragging, setDragging] = useState(false);
  const { data: books } = useBooks();
  const { data: highlights } = useHighlights();
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const { run, dialog } = useEpubImport();

  const counts: Record<string, number | undefined> = { '/biblioteca': books?.length, '/notas': highlights?.length };

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (!file) return;
    if (/\.epub$/i.test(file.name) || file.type === 'application/epub+zip') void run(file);
    else if (/\.pdf$/i.test(file.name) || file.type === 'application/pdf') navigate('/convertir', { state: { file } });
    else toast('Solo EPUB o PDF');
  }

  return (
    <div
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes('Files')) {
          e.preventDefault();
          setDragging(true);
        }
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setDragging(false);
      }}
      onDrop={onDrop}
      style={{ minHeight: '100dvh' }}
    >
      <header className="toolbar">
        <div className="toolbar-group">
          {back ? (
            <Link to={back.to} className="btn-ghost press" style={{ paddingLeft: 4, gap: 2 }}>
              <IconBack size={20} />
              {back.label}
            </Link>
          ) : (
            <Link to="/" className="brand">
              <IconBook size={20} style={{ color: 'var(--accent)' }} />
              Atril
            </Link>
          )}
        </div>
        <div className="toolbar-group">
          {actions}
          <button type="button" className="icon-btn press desktop-only" aria-label="Mostrar secciones" aria-pressed={panel} onClick={() => setPanel(!panel)}>
            <IconSidebar size={20} />
          </button>
        </div>
      </header>

      {children}

      <aside className={`side-panel ${panel ? 'open' : ''}`} aria-label="Secciones" aria-hidden={!panel}>
        <div className="small muted" style={{ padding: '0 10px 8px', fontWeight: 600 }}>
          Secciones
        </div>
        {sections.map(({ to, label, Icon, tint }) => (
          <NavLink key={to} to={to} className="panel-link press" tabIndex={panel ? 0 : -1} onClick={() => setPanel(false)}>
            <Icon size={20} style={{ color: tint }} />
            <span style={{ flex: 1, fontWeight: 500 }}>{label}</span>
            <span className="small muted num">{counts[to] ?? ''}</span>
          </NavLink>
        ))}
        <div className="small muted" style={{ marginTop: 'auto', padding: 10 }}>
          Guardado en SQL Server · Atril
        </div>
      </aside>

      <nav className="tabbar" aria-label="Secciones">
        {tabs.map(({ to, label, Icon }) => (
          <NavLink key={to} to={to} end={to === '/'} className="tab" aria-current={location.pathname === to ? 'page' : undefined}>
            <Icon size={25} />
            {label}
          </NavLink>
        ))}
      </nav>

      {dragging && (
        <div aria-hidden="true" style={{ position: 'fixed', inset: 8, zIndex: 70, border: '2px dashed var(--accent)', borderRadius: 20, background: 'rgba(168,38,27,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none', animation: 'fade 150ms ease-out both' }}>
          <span className="toast" style={{ animation: 'none' }}>
            Suelta un EPUB para agregarlo o un PDF para convertirlo
          </span>
        </div>
      )}
      {dialog}
    </div>
  );
}

export function ServerError({ error }: { error: Error }) {
  return (
    <div className="empty" role="alert">
      <strong>No pude leer la base de datos</strong>
      <p>{error.message}</p>
      <p className="small">Revisa que SQL Server (SQLEXPRESS) esté encendido y que la app esté corriendo con «npm run dev».</p>
    </div>
  );
}
