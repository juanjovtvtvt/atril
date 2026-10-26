import type { HighlightColor } from '../api';

/** Generated-cover colors: the leather and pigment tones from the design. */
export const coverPalette = ['#4B2716', '#6E6B3E', '#A8261B', '#8C5A2E', '#C07A2C', '#5C5A33', '#B88A52', '#2B2119'];

export function colorFor(seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return coverPalette[Math.abs(h) % coverPalette.length];
}

export const highlightColors: Record<HighlightColor, { name: string; mark: string; strong: string }> = {
  ocre: { name: 'Ocre', mark: 'var(--hl-ocre)', strong: '#E9B96E' },
  oliva: { name: 'Oliva', mark: 'var(--hl-oliva)', strong: '#BFC285' },
  rosa: { name: 'Rosa', mark: 'var(--hl-rosa)', strong: '#E5A795' },
};

export const highlightOrder: HighlightColor[] = ['ocre', 'oliva', 'rosa'];
