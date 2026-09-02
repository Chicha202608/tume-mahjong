export type Suit = 'man' | 'pin' | 'sou' | 'wind' | 'dragon';
export type Phase = 'playerDraw' | 'playerDiscard' | 'cpuTurn' | 'naki' | 'playerNakiDiscard' | 'win' | 'exhausted' | 'riichiSelect';

export interface Tile {
  id: string;
  suit: Suit;
  value: number;
}

export interface Furo {
  tiles: Tile[];
  type: 'pung' | 'chii' | 'kan' | 'ankan' | 'daiminkan' | 'kakan';
  calledTile: Tile;
}
