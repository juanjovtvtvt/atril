import { useEffect } from 'react';
import { capitalize, numberWord, roman } from '../lib/format';

type Relic =
  | { kind: 'author'; label: string; years: string; x: number; y: number; rot: number; veil?: boolean }
  | { kind: 'book'; name: string; label: string; years: string; color: string; x: number; y: number; rot: number };

/* Authors and books from 1450 to 1700 that drift in behind the number. */
const relics: Relic[] = [
  { kind: 'author', label: 'Cervantes', years: '1547 – 1616', x: 7, y: 9, rot: -5 },
  { kind: 'book', name: 'Hamlet', label: 'Shakespeare', years: '1603', color: '#6E6B3E', x: 26, y: 6, rot: 6 },
  { kind: 'book', name: 'El ingenioso hidalgo', label: 'Primera edición', years: '1605', color: '#4B2716', x: 47, y: 3, rot: -2 },
  { kind: 'author', label: 'Shakespeare', years: '1564 – 1616', x: 72, y: 8, rot: 4 },
  { kind: 'book', name: 'Gramática castellana', label: 'Nebrija', years: '1492', color: '#8C5A2E', x: 84, y: 40, rot: -4 },
  { kind: 'author', label: 'Sor Juana', years: '1648 – 1695', veil: true, x: 79, y: 66, rot: -4 },
  { kind: 'book', name: 'Comentarios reales', label: 'Inca Garcilaso', years: '1609', color: '#A8261B', x: 60, y: 75, rot: 5 },
  { kind: 'author', label: 'Quevedo', years: '1580 – 1645', x: 30, y: 73, rot: -3 },
  { kind: 'author', label: 'Inca Garcilaso', years: '1539 – 1616', x: 9, y: 63, rot: 3 },
  { kind: 'book', name: 'Biblia de Gutenberg', label: 'Maguncia', years: '1455', color: '#5C5A33', x: 4, y: 37, rot: 2 },
];

function Silhouette({ veil }: { veil?: boolean }) {
  return veil ? (
    <svg width="80" height="96" viewBox="0 0 100 120" aria-hidden="true">
      <path d="M50 12c-20 0-30 16-30 36v72h60V48c0-20-10-36-30-36z" fill="currentColor" opacity=".45" />
      <ellipse cx="52" cy="48" rx="15" ry="19" fill="currentColor" />
      <path d="M24 120c2-18 12-28 28-28s26 10 28 28z" fill="currentColor" />
    </svg>
  ) : (
    <svg width="80" height="96" viewBox="0 0 100 120" aria-hidden="true">
      <path d="M44 18c12-6 26 0 27 14 1 6-1 9 2 13l4 6c1 2-1 3-3 3l-1 5c0 3-3 4-5 4-2 4-6 6-12 6l-1 7c-6 0-12-2-16-6-6-6-9-15-9-24 0-13 5-24 14-28z" fill="currentColor" />
      <path d="M18 120c2-18 14-30 32-30s30 12 32 30z" fill="currentColor" />
      <ellipse cx="50" cy="86" rx="24" ry="6" fill="#D9C3A0" stroke="currentColor" strokeWidth="4" strokeDasharray="3 2" />
    </svg>
  );
}

/**
 * A celebration that is seen rarely: the only animation in the app that lasts more than 300 ms.
 * Blurred scrim, relics staggered 55 ms apart and the Roman numeral going from blurry to sharp,
 * all settled in about 1.5 s. It closes on its own after 4 s, on click or with Escape.
 */
export function StreakOverlay({ current, best, onClose }: { current: number; best: number; onClose: () => void }) {
  useEffect(() => {
    const t = setTimeout(onClose, 4200);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => {
      clearTimeout(t);
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  const days = current === 1 ? 'día' : 'días';
  // On small screens the relics shrink and there are fewer, so they don't cover the number.
  const scale = Math.max(0.55, Math.min(1, Math.min(window.innerWidth / 1440, window.innerHeight / 900) * 1.15));
  const shown = window.innerWidth < 700 ? relics.filter((_, i) => [0, 3, 4, 5, 6, 9].includes(i)) : relics;
  return (
    <div role="dialog" aria-modal="true" aria-label={`Racha de ${current} ${days}`} style={{ position: 'fixed', inset: 0, zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
      <button
        type="button"
        aria-label="Cerrar"
        onClick={onClose}
        style={{ position: 'absolute', inset: 0, border: 0, padding: 0, background: 'rgba(24,15,8,0.8)', backdropFilter: 'blur(18px) saturate(120%)', WebkitBackdropFilter: 'blur(18px) saturate(120%)', cursor: 'default', animation: 'fade 300ms ease-out both' }}
      />
      {shown.map((r, i) => (
        <div key={i} aria-hidden="true" style={{ position: 'absolute', left: `${r.x}%`, top: `${r.y}%`, pointerEvents: 'none', animation: `relic 700ms var(--ease-out) ${100 + i * 55}ms both` }}>
          <div style={{ transform: `rotate(${r.rot}deg) scale(${scale})`, transformOrigin: 'top left', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
            {r.kind === 'author' ? (
              <div style={{ width: 96, height: 120, borderRadius: '50%', background: '#D9C3A0', overflow: 'hidden', color: '#4B2716', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', boxShadow: '0 0 0 2px rgba(244,233,214,0.35), 0 14px 30px rgba(0,0,0,0.45)' }}>
                <Silhouette veil={r.veil} />
              </div>
            ) : (
              <div style={{ width: 78, height: 112, position: 'relative', overflow: 'hidden', padding: '10px 7px 10px 12px', borderRadius: '2px 5px 5px 2px', background: r.color, color: '#F4E9D6', fontFamily: 'var(--serif)', fontSize: 12, fontWeight: 600, lineHeight: 1.15, boxShadow: '0 14px 30px rgba(0,0,0,0.5)' }}>
                <span style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 5, background: 'rgba(0,0,0,0.25)' }} />
                {r.name}
              </div>
            )}
            <div style={{ fontSize: 12, fontWeight: 600, color: 'rgba(244,233,214,0.85)', textAlign: 'center', lineHeight: 1.35 }}>
              {r.label}
              <br />
              <span style={{ fontWeight: 400, color: 'rgba(244,233,214,0.55)' }}>{r.years}</span>
            </div>
          </div>
        </div>
      ))}
      <div style={{ position: 'relative', zIndex: 2, pointerEvents: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', color: '#F4E9D6', padding: 16 }}>
        <div aria-hidden="true" style={{ position: 'absolute', inset: '-90px -140px', zIndex: -1, background: 'radial-gradient(closest-side, rgba(24,15,8,0.92), rgba(24,15,8,0.7) 55%, rgba(24,15,8,0))', animation: 'fade 300ms ease-out both' }} />
        <div style={{ fontSize: 15, fontWeight: 600, color: 'rgba(244,233,214,0.7)', animation: 'rise 300ms var(--ease-out) 120ms both' }}>Racha de lectura</div>
        <div style={{ fontFamily: 'var(--serif)', fontSize: 'clamp(96px, 16vw, 156px)', lineHeight: 1.05, fontWeight: 700, letterSpacing: '-0.02em', animation: 'numeral 620ms var(--ease-out) 240ms both' }}>
          {current > 0 ? roman(current) : '0'}
        </div>
        <div style={{ fontSize: 22, fontWeight: 600, letterSpacing: '-0.01em', animation: 'rise 300ms var(--ease-out) 820ms both' }}>
          {current === 0 ? 'Hoy empieza tu racha' : current === 1 ? 'Un día, el primero' : `${capitalize(numberWord(current))} días seguidos`}
        </div>
        <div style={{ marginTop: 4, fontSize: 15, color: 'rgba(244,233,214,0.65)', animation: 'rise 300ms var(--ease-out) 960ms both' }}>
          {best > current ? `Tu mejor racha fue de ${best} días` : current > 1 ? 'Es tu mejor racha hasta ahora' : 'Lee un minuto al día para mantenerla'}
        </div>
        <div style={{ marginTop: 28, fontSize: 13, color: 'rgba(244,233,214,0.45)', animation: 'rise 300ms ease-out 1200ms both' }}>Toca en cualquier parte para cerrar</div>
      </div>
    </div>
  );
}
