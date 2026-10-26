import { useEffect, useRef, type ReactNode } from 'react';

function useEscape(onClose: () => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
}

/**
 * Modal: centered on desktop, bottom sheet on the phone (the CSS switches it at 760 px).
 * Dims the background because it is a task that blocks the flow.
 */
export function Sheet({ title, onClose, children, wide, action = 'Listo' }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean; action?: string }) {
  useEscape(onClose);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    return () => prev?.focus?.();
  }, []);
  return (
    <div className="overlay sheetable" role="dialog" aria-modal="true" aria-label={title}>
      <button type="button" className="scrim" aria-label="Cerrar" onClick={onClose} />
      <div ref={ref} tabIndex={-1} className={`sheet ${wide ? 'wide' : ''}`}>
        <div className="grabber" aria-hidden="true" />
        <div className="sheet-head">
          <h2>{title}</h2>
          <button type="button" className="text-btn press" onClick={onClose}>
            {action}
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/** Anchored menu or popover: it grows from its button (transform-origin on that side). */
export function Popover({ open, onClose, align = 'right', width, label, children }: { open: boolean; onClose: () => void; align?: 'left' | 'right'; width: number; label: string; children: ReactNode }) {
  useEscape(onClose);
  if (!open) return null;
  return (
    <>
      <button type="button" className="click-away" aria-label="Cerrar" onClick={onClose} />
      <div className={`popover ${align}`} role="dialog" aria-label={label} style={{ width }}>
        {children}
      </div>
    </>
  );
}
