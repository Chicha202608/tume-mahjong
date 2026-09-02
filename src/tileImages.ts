import { Tile } from '@/types';

const BASE = 'https://cdn.jsdelivr.net/gh/FluffyStuff/riichi-mahjong-tiles@master/Regular';

const FILE_MAP: Record<string, string> = {
  man:  'Man',
  pin:  'Pin',
  sou:  'Sou',
  wind: { 1: 'Ton', 2: 'Nan', 3: 'Shaa', 4: 'Pei' } as any,
  dragon: { 1: 'Haku', 2: 'Hatsu', 3: 'Chun' } as any,
};

export function tileImageUrl(tile: Tile): string {
  const prefix = FILE_MAP[tile.suit];
  let file: string;
  if (typeof prefix === 'string') {
    file = `${prefix}${tile.value}.svg`;
  } else {
    file = `${prefix[tile.value]}.svg`;
  }
  return `${BASE}/${file}`;
}

export function tileBackUrl(): string {
  return `${BASE}/Back.svg`;
}
