const nf = new Intl.NumberFormat('es');

export const formatNumber = (n: number) => nf.format(Math.round(n));

export function uid() {
  return crypto.randomUUID();
}

/** Local calendar day as YYYY-MM-DD (not UTC: a session at 11 p.m. belongs to that day). */
export function dayKey(d: Date | number) {
  const date = typeof d === 'number' ? new Date(d) : d;
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${m}-${day}`;
}

export function startOfDay(d: Date | number) {
  const date = new Date(d);
  date.setHours(0, 0, 0, 0);
  return date;
}

export function addDays(d: Date, n: number) {
  const date = new Date(d);
  date.setDate(date.getDate() + n);
  return date;
}

export function formatMinutes(min: number) {
  const total = Math.round(min);
  if (total < 60) return `${total} min`;
  const h = Math.floor(total / 60);
  const m = total % 60;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

export function formatHours(min: number) {
  if (min < 60) return `${Math.max(1, Math.round(min))} min`;
  const h = min / 60;
  return h < 10 ? `${h.toFixed(1).replace('.', ',')} h` : `${Math.round(h)} h`;
}

export function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`;
}

const weekdays = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const months = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

export const monthName = (m: number) => months[m];

export function relativeDay(ts: number) {
  const today = startOfDay(Date.now()).getTime();
  const day = startOfDay(ts).getTime();
  const diff = Math.round((today - day) / 86_400_000);
  if (diff === 0) return 'Hoy';
  if (diff === 1) return 'Ayer';
  const d = new Date(ts);
  if (diff < 7) return capitalize(weekdays[d.getDay()]);
  return `${d.getDate()} de ${months[d.getMonth()]}`;
}

export function shortDate(ts: number) {
  const d = new Date(ts);
  return `${d.getDate()} ${months[d.getMonth()].slice(0, 3)}.`;
}

export function timeOfDay(ts: number) {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function languageName(code: string) {
  if (!code) return 'Sin dato';
  try {
    const name = new Intl.DisplayNames(['es'], { type: 'language' }).of(code.split('-')[0]);
    return name ? capitalize(name) : code.toUpperCase();
  } catch {
    return code.toUpperCase();
  }
}

export function roman(n: number) {
  const map: [number, string][] = [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
  let out = '';
  for (const [v, r] of map) {
    while (n >= v) {
      out += r;
      n -= v;
    }
  }
  return out || '0';
}

const units = ['cero', 'un', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve', 'diez', 'once', 'doce', 'trece', 'catorce', 'quince'];
export const numberWord = (n: number) => (n < units.length ? units[n] : formatNumber(n));

export function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function slug(s: string) {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'libro';
}

/** Lowercase without accents, for search that forgives "vorágine" vs "voragine". */
export function normalize(s: string) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}
