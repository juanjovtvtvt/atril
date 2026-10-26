import type { Book, Session } from '../api';
import { addDays, dayKey, startOfDay } from './format';

// The streak isn't computed here: SQL Server returns it (dbo.usp_Racha).

export function minutesByDay(sessions: Session[]) {
  const map = new Map<string, number>();
  for (const s of sessions) map.set(s.day, (map.get(s.day) ?? 0) + s.minutes);
  return map;
}

const dayLetters = ['D', 'L', 'M', 'X', 'J', 'V', 'S'];
const dayNames = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

export function lastDays(sessions: Session[], n = 7) {
  const byDay = minutesByDay(sessions);
  const today = startOfDay(Date.now());
  return Array.from({ length: n }, (_, i) => {
    const date = addDays(today, i - (n - 1));
    const key = dayKey(date);
    const isToday = i === n - 1;
    return {
      key,
      letter: dayLetters[date.getDay()],
      label: isToday ? 'Hoy' : `${dayNames[date.getDay()]} ${date.getDate()}`,
      minutes: byDay.get(key) ?? 0,
      isToday,
    };
  });
}

export interface BookPace {
  bookId: string;
  title: string;
  wpm: number;
}

/** Words read ÷ minutes read, per book. Books with under 2 minutes are left out: too little to say anything. */
export function paceByBook(sessions: Session[], books: Book[]): BookPace[] {
  const acc = new Map<string, { words: number; minutes: number }>();
  for (const s of sessions) {
    const a = acc.get(s.bookId) ?? { words: 0, minutes: 0 };
    a.words += s.words;
    a.minutes += s.minutes;
    acc.set(s.bookId, a);
  }
  const out: BookPace[] = [];
  for (const [bookId, a] of acc) {
    const book = books.find((b) => b.id === bookId);
    if (!book || a.minutes < 2 || a.words <= 0) continue;
    out.push({ bookId, title: book.title, wpm: Math.round(a.words / a.minutes) });
  }
  return out.sort((x, y) => y.wpm - x.wpm);
}

export function averagePace(paces: BookPace[]) {
  if (paces.length === 0) return null;
  return Math.round(paces.reduce((sum, p) => sum + p.wpm, 0) / paces.length);
}

export type Period = 'semana' | 'mes' | 'anio';

export function periodStart(period: Period) {
  const today = startOfDay(Date.now());
  if (period === 'semana') return addDays(today, -6);
  if (period === 'mes') return new Date(today.getFullYear(), today.getMonth(), 1);
  return new Date(today.getFullYear(), 0, 1);
}

export function periodSummary(period: Period, sessions: Session[], books: Book[]) {
  const from = periodStart(period).getTime();
  const inRange = sessions.filter((s) => s.start >= from);
  const minutes = inRange.reduce((sum, s) => sum + s.minutes, 0);
  const words = inRange.reduce((sum, s) => sum + s.words, 0);
  const activeDays = new Set(inRange.filter((s) => s.minutes > 0).map((s) => s.day)).size;
  const finished = books.filter((b) => b.finishedAt && b.finishedAt >= from).length;
  return { minutes, words, activeDays, sessions: inRange.length, finished, wpm: minutes >= 2 ? Math.round(words / minutes) : null };
}

/** 0 = nothing, 1 = under 15 min, 2 = 15–30, 3 = 30–60, 4 = an hour or more. */
export function level(minutes: number) {
  if (minutes <= 0) return 0;
  if (minutes < 15) return 1;
  if (minutes < 30) return 2;
  if (minutes < 60) return 3;
  return 4;
}

export function heatmap(sessions: Session[], weeks = 26) {
  const byDay = minutesByDay(sessions);
  const today = startOfDay(Date.now());
  const mondayOffset = (today.getDay() + 6) % 7;
  const thisMonday = addDays(today, -mondayOffset);
  const firstMonday = addDays(thisMonday, -7 * (weeks - 1));
  const cols = [];
  let activeDays = 0;
  for (let w = 0; w < weeks; w++) {
    const days = [];
    for (let d = 0; d < 7; d++) {
      const date = addDays(firstMonday, w * 7 + d);
      const future = date.getTime() > today.getTime();
      const minutes = future ? 0 : byDay.get(dayKey(date)) ?? 0;
      if (minutes > 0) activeDays++;
      days.push({ key: dayKey(date), minutes, level: level(minutes), future });
    }
    cols.push(days);
  }
  return { cols, activeDays };
}
