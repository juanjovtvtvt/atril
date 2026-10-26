import { useMemo, useState } from 'react';
import { Link } from '../components/Nav';
import { api, invalidate, useBooks, useSessions, useSettings } from '../api';
import { ServerError, Shell } from '../components/Shell';
import { formatMinutes, formatNumber, relativeDay, timeOfDay } from '../lib/format';
import { heatmap, lastDays, periodSummary, type Period } from '../lib/stats';

const levelColors = ['var(--fill)', '#E8CFAE', '#D3A877', '#A86E3E', '#6B3A1C'];
const levelNames = ['Sin lectura', 'Menos de 15 min', '15 a 30 min', '30 a 60 min', 'Una hora o más'];

export default function History() {
  const sessions = useSessions();
  const books = useBooks();
  const settings = useSettings();
  const [period, setPeriod] = useState<Period>('semana');
  const [hover, setHover] = useState<number | null>(null);

  const list = sessions.data ?? [];
  const all = books.data ?? [];
  const summary = useMemo(() => periodSummary(period, list, all), [period, list, all]);
  const days = useMemo(() => lastDays(list), [list]);
  const map = useMemo(() => heatmap(list), [list]);
  const goal = Number(settings.data?.metaAnual ?? 12);
  const year = new Date().getFullYear();
  const finishedThisYear = all.filter((b) => b.finishedAt && new Date(b.finishedAt).getFullYear() === year).length;

  const max = Math.max(30, ...days.map((d) => d.minutes));
  const avg = days.reduce((s, d) => s + d.minutes, 0) / 7;
  const H = 160;
  const scale = H / (max * 1.1);

  const titles = new Map(all.map((b) => [b.id, b]));
  const recent = [...list].sort((a, b) => b.start - a.start).slice(0, 30);
  const groups: { label: string; items: typeof recent }[] = [];
  for (const s of recent) {
    const label = relativeDay(s.start);
    const g = groups.find((x) => x.label === label);
    if (g) g.items.push(s);
    else groups.push({ label, items: [s] });
  }

  async function setGoal(n: number) {
    await api.settings.set('metaAnual', Math.max(1, Math.min(365, n)));
    invalidate('settings');
  }

  const C = 2 * Math.PI * 52;
  const ratio = Math.min(1, finishedThisYear / goal);
  const periodLabel = { semana: 'Últimos 7 días', mes: 'Este mes', anio: `En ${year}` }[period];

  return (
    <Shell back={{ to: '/', label: 'Inicio' }}>
      <main className="page">
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between', gap: 14, margin: '12px 0 20px' }}>
          <h1 className="large-title" style={{ margin: 0 }}>
            Historial
          </h1>
          <div className="seg" role="group" aria-label="Periodo">
            {(['semana', 'mes', 'anio'] as Period[]).map((p) => (
              <button key={p} type="button" aria-pressed={period === p} onClick={() => setPeriod(p)}>
                {{ semana: 'Semana', mes: 'Mes', anio: 'Año' }[p]}
              </button>
            ))}
          </div>
        </div>

        {sessions.error ? (
          <ServerError error={sessions.error} />
        ) : (
          <>
            <section aria-label={periodLabel} className="group" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
              {[
                { label: 'Tiempo leído', value: formatMinutes(summary.minutes), sub: periodLabel },
                { label: 'Días con lectura', value: String(summary.activeDays), sub: `${summary.sessions} ${summary.sessions === 1 ? 'sesión' : 'sesiones'}` },
                { label: 'Palabras', value: formatNumber(summary.words), sub: 'leídas, aproximadas' },
                { label: 'Ritmo', value: summary.wpm ? `${summary.wpm} ppm` : '—', sub: summary.finished ? `${summary.finished} ${summary.finished === 1 ? 'libro terminado' : 'libros terminados'}` : 'palabras por minuto' },
              ].map((k) => (
                <div key={k.label} style={{ padding: '16px 18px', boxShadow: '-0.5px 0 0 var(--hair)' }}>
                  <div className="small muted">{k.label}</div>
                  <div className="num" style={{ fontSize: 28, fontWeight: 600, letterSpacing: '-0.02em' }}>
                    {k.value}
                  </div>
                  <div className="small muted">{k.sub}</div>
                </div>
              ))}
            </section>

            <div style={{ marginTop: 32, display: 'flex', flexWrap: 'wrap', gap: 28 }}>
              <section aria-labelledby="dias-titulo" style={{ flex: '999 1 440px', minWidth: 0 }}>
                <div className="section-head">
                  <h2 id="dias-titulo" className="h2">
                    Minutos por día
                  </h2>
                  <span className="small muted">Últimos 7 días</span>
                </div>
                <div className="group" style={{ padding: '22px 18px 14px' }}>
                  <div style={{ position: 'relative', height: H, display: 'flex', alignItems: 'flex-end', gap: 14, borderBottom: '0.5px solid var(--ink-3)' }} onMouseLeave={() => setHover(null)}>
                    {avg > 0 && (
                      <>
                        <div aria-hidden="true" style={{ position: 'absolute', left: 0, right: 0, bottom: avg * scale, borderTop: '1px dashed var(--ink-3)' }} />
                        <span aria-hidden="true" className="small muted" style={{ position: 'absolute', right: 0, bottom: avg * scale + 4, fontSize: 11 }}>
                          promedio {Math.round(avg)} min
                        </span>
                      </>
                    )}
                    {days.map((d, i) => {
                      const h = Math.round(d.minutes * scale);
                      const showTip = hover === i || (hover === null && d.isToday && d.minutes > 0);
                      return (
                        <div key={d.key} onMouseEnter={() => setHover(i)} style={{ position: 'relative', flex: 1, height: '100%', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }} aria-label={`${d.label}: ${Math.round(d.minutes)} minutos`} role="img">
                          {showTip && (
                            <div style={{ position: 'absolute', bottom: h + 8, left: '50%', transform: 'translateX(-50%)', zIndex: 2, whiteSpace: 'nowrap', padding: '5px 9px', borderRadius: 8, background: 'var(--ink)', color: 'var(--bg)', fontSize: 12, fontWeight: 600, animation: 'fade 140ms ease-out both' }} className="num">
                              {d.label} · {Math.round(d.minutes)} min
                            </div>
                          )}
                          <div style={{ width: '100%', maxWidth: 34, height: Math.max(d.minutes > 0 ? 3 : 0, h), borderRadius: '4px 4px 0 0', background: d.isToday ? 'var(--accent)' : hover === i ? 'var(--ink-2)' : 'var(--ink-3)', transformOrigin: 'bottom', animation: `grow 420ms var(--ease-out) ${i * 40}ms both`, transition: 'background-color 160ms ease' }} />
                        </div>
                      );
                    })}
                  </div>
                  <div style={{ display: 'flex', gap: 14, paddingTop: 8 }}>
                    {days.map((d) => (
                      <div key={d.key} className="small" style={{ flex: 1, textAlign: 'center', color: d.isToday ? 'var(--ink)' : 'var(--ink-2)', fontWeight: d.isToday ? 700 : 400 }}>
                        {d.letter}
                      </div>
                    ))}
                  </div>
                </div>
              </section>

              <section aria-labelledby="meta-titulo" style={{ flex: '1 1 260px', minWidth: 0 }}>
                <h2 id="meta-titulo" className="h2" style={{ marginBottom: 12 }}>
                  Meta {year}
                </h2>
                <div className="group" style={{ display: 'flex', alignItems: 'center', gap: 18, padding: '20px 18px' }}>
                  <svg role="img" aria-label={`${finishedThisYear} de ${goal} libros`} width="120" height="120" viewBox="0 0 120 120" style={{ flex: '0 0 auto' }}>
                    <circle cx="60" cy="60" r="52" fill="none" stroke="var(--fill)" strokeWidth="12" />
                    <circle cx="60" cy="60" r="52" fill="none" stroke="var(--accent)" strokeWidth="12" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - ratio)} transform="rotate(-90 60 60)" style={{ animation: 'ring 900ms var(--ease-out) 120ms both', transition: 'stroke-dashoffset 400ms var(--ease-out)' }} />
                    <text x="60" y="58" textAnchor="middle" fontSize="28" fontWeight="700" fill="var(--ink)" fontFamily="var(--sans)">
                      {finishedThisYear}
                    </text>
                    <text x="60" y="78" textAnchor="middle" fontSize="12" fill="var(--ink-2)" fontFamily="var(--sans)">
                      de {goal}
                    </text>
                  </svg>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <span style={{ fontSize: 17, fontWeight: 600 }}>{finishedThisYear >= goal ? '¡Meta cumplida!' : `Te faltan ${goal - finishedThisYear}`}</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <button type="button" className="icon-btn press" aria-label="Bajar la meta" style={{ background: 'var(--fill)' }} onClick={() => void setGoal(goal - 1)}>
                        −
                      </button>
                      <span className="small muted num">Meta: {goal} libros</span>
                      <button type="button" className="icon-btn press" aria-label="Subir la meta" style={{ background: 'var(--fill)' }} onClick={() => void setGoal(goal + 1)}>
                        +
                      </button>
                    </div>
                  </div>
                </div>
              </section>
            </div>

            <section aria-labelledby="calendario-titulo" className="section" style={{ marginTop: 32 }}>
              <div className="section-head" style={{ flexWrap: 'wrap' }}>
                <h2 id="calendario-titulo" className="h2">
                  Días de lectura
                </h2>
                <span className="small muted" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  Menos
                  {levelColors.map((c, i) => (
                    <span key={i} title={levelNames[i]} style={{ width: 11, height: 11, borderRadius: 3, background: c }} />
                  ))}
                  Más
                </span>
              </div>
              <div className="group" style={{ padding: 18, overflowX: 'auto' }}>
                <div style={{ display: 'flex', gap: 3, minWidth: 560 }}>
                  {map.cols.map((col, w) => (
                    <div key={w} style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 3 }}>
                      {col.map((c) => (
                        <div key={c.key} title={`${c.key}: ${c.minutes ? `${Math.round(c.minutes)} min` : 'sin lectura'}`} style={{ aspectRatio: '1', borderRadius: 3, background: c.future ? 'transparent' : levelColors[c.level] }} />
                      ))}
                    </div>
                  ))}
                </div>
                <div className="small muted" style={{ marginTop: 10 }}>
                  {map.activeDays} {map.activeDays === 1 ? 'día' : 'días'} con lectura en las últimas 26 semanas
                </div>
              </div>
            </section>

            <section aria-labelledby="sesiones-titulo" className="section" style={{ marginTop: 32 }}>
              <h2 id="sesiones-titulo" className="h2" style={{ marginBottom: 12 }}>
                Sesiones
              </h2>
              {groups.length === 0 ? (
                <p className="muted" style={{ margin: 0 }}>
                  Todavía no hay sesiones. Se registran solas mientras lees.
                </p>
              ) : (
                <div className="group">
                  {groups.map((g) => (
                    <div key={g.label}>
                      <div className="small muted" style={{ padding: '12px 16px 4px', fontWeight: 600, background: 'var(--fill-hover)' }}>
                        {g.label}
                      </div>
                      {g.items.map((s, i) => {
                        const b = titles.get(s.bookId);
                        return (
                          <Link key={s.id} to={`/libro/${s.bookId}`} className={`row ${i === g.items.length - 1 ? 'last' : ''}`}>
                            <span style={{ width: 28, height: 42, flex: '0 0 auto', borderRadius: '2px 4px 4px 2px', background: b?.color ?? 'var(--ink-3)', boxShadow: 'inset 3px 0 0 rgba(0,0,0,0.2), 0 1px 3px rgba(43,33,25,0.2)' }} />
                            <span className="row-body">
                              <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                                <span className="ellipsis" style={{ fontWeight: 500 }}>
                                  {b?.title ?? 'Libro eliminado'}
                                </span>
                                <span className="small muted num">{s.words > 0 ? `${formatNumber(s.words)} palabras` : 'Sin avanzar'}</span>
                              </span>
                              <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                                <span className="num" style={{ fontWeight: 600 }}>
                                  {formatMinutes(s.minutes)}
                                </span>
                                <span className="small muted num">{timeOfDay(s.start)}</span>
                              </span>
                            </span>
                          </Link>
                        );
                      })}
                    </div>
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </main>
    </Shell>
  );
}
