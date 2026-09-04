import { Tile, Furo } from '@/types';

export function createDeck(): Tile[] {
  const tiles: Tile[] = [];
  let id = 0;
  for (const suit of ['man', 'pin', 'sou'] as const) {
    for (let v = 1; v <= 9; v++) {
      for (let c = 0; c < 4; c++) {
        tiles.push({ id: String(id++), suit, value: v });
      }
    }
  }
  for (let v = 1; v <= 4; v++) {
    for (let c = 0; c < 4; c++) {
      tiles.push({ id: String(id++), suit: 'wind', value: v });
    }
  }
  for (let v = 1; v <= 3; v++) {
    for (let c = 0; c < 4; c++) {
      tiles.push({ id: String(id++), suit: 'dragon', value: v });
    }
  }
  return tiles;
}

export function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const SUIT_ORDER = { man: 0, pin: 1, sou: 2, wind: 3, dragon: 4 } as const;

export function sortHand(tiles: Tile[]): Tile[] {
  return [...tiles].sort((a, b) => {
    const sd = SUIT_ORDER[a.suit] - SUIT_ORDER[b.suit];
    return sd !== 0 ? sd : a.value - b.value;
  });
}

export function sameTile(a: Tile, b: Tile): boolean {
  return a.suit === b.suit && a.value === b.value;
}

export function tileKey(t: Tile): string {
  return `${t.suit}-${t.value}`;
}

const CHINESE_NUMS = ['一', '二', '三', '四', '五', '六', '七', '八', '九'];
const WIND_NAMES = ['東', '南', '西', '北'];

export function tileDisplay(tile: Tile): { label: string; color: string } {
  switch (tile.suit) {
    case 'man':    return { label: `${CHINESE_NUMS[tile.value - 1]}萬`, color: '#c41e1e' };
    case 'pin':    return { label: `${tile.value}筒`, color: '#1d4ed8' };
    case 'sou':    return { label: `${tile.value}索`, color: '#15803d' };
    case 'wind':   return { label: WIND_NAMES[tile.value - 1], color: '#1a237e' };
    case 'dragon': {
      const names = ['白', '發', '中'];
      const colors = ['#64748b', '#1b7a3d', '#c41e1e'];
      return { label: names[tile.value - 1], color: colors[tile.value - 1] };
    }
  }
}

function canFormMentsu(tiles: Tile[]): boolean {
  if (tiles.length === 0) return true;
  const sorted = sortHand(tiles);
  const first = sorted[0];

  if (sorted.length >= 3 && sameTile(sorted[0], sorted[1]) && sameTile(sorted[1], sorted[2])) {
    if (canFormMentsu(sorted.slice(3))) return true;
  }

  if (first.suit !== 'wind' && first.suit !== 'dragon') {
    const idx2 = sorted.findIndex((t, i) => i > 0 && t.suit === first.suit && t.value === first.value + 1);
    if (idx2 !== -1) {
      const idx3 = sorted.findIndex((t, i) => i > idx2 && t.suit === first.suit && t.value === first.value + 2);
      if (idx3 !== -1) {
        const rest = sorted.filter((_, i) => i !== 0 && i !== idx2 && i !== idx3);
        if (canFormMentsu(rest)) return true;
      }
    }
  }
  return false;
}

export function checkWin(hand: Tile[]): boolean {
  if (hand.length !== 14) return false;
  const sorted = sortHand(hand);

  let chiitoi = true;
  for (let i = 0; i < 14; i += 2) {
    if (!sameTile(sorted[i], sorted[i + 1])) { chiitoi = false; break; }
  }
  if (chiitoi) return true;

  for (let i = 0; i < sorted.length - 1; i++) {
    if (i > 0 && sameTile(sorted[i], sorted[i - 1])) continue;
    if (sameTile(sorted[i], sorted[i + 1])) {
      const rest = [...sorted.slice(0, i), ...sorted.slice(i + 2)];
      if (canFormMentsu(rest)) return true;
    }
  }
  return false;
}

export function canRon(hand: Tile[], discard: Tile): boolean {
  const test = [...hand, discard];
  return checkWin(test);
}

export function checkWinConcealed(hand: Tile[], numFuro: number): boolean {
  const expectedLen = 14 - 3 * numFuro;
  if (hand.length !== expectedLen) return false;
  const sorted = sortHand(hand);

  if (numFuro === 0) {
    let chiitoi = true;
    for (let i = 0; i < sorted.length; i += 2) {
      if (!sameTile(sorted[i], sorted[i + 1])) { chiitoi = false; break; }
    }
    if (chiitoi) return true;
  }

  for (let i = 0; i < sorted.length - 1; i++) {
    if (i > 0 && sameTile(sorted[i], sorted[i - 1])) continue;
    if (sameTile(sorted[i], sorted[i + 1])) {
      const rest = [...sorted.slice(0, i), ...sorted.slice(i + 2)];
      if (canFormMentsu(rest)) return true;
    }
  }
  return false;
}

export function canRonConcealed(hand: Tile[], discard: Tile, numFuro: number): boolean {
  return checkWinConcealed([...hand, discard], numFuro);
}

export function checkTenpai(hand: Tile[], numFuro: number): boolean {
  const expectedLen = 13 - 3 * numFuro;
  if (hand.length !== expectedLen) return false;

  const suits = ['man', 'pin', 'sou'] as const;
  for (const suit of suits) {
    for (let v = 1; v <= 9; v++) {
      const testTile: Tile = { id: 'test', suit, value: v };
      if (checkWinConcealed([...hand, testTile], numFuro)) return true;
    }
  }
  for (let v = 1; v <= 4; v++) {
    const testTile: Tile = { id: 'test', suit: 'wind', value: v };
    if (checkWinConcealed([...hand, testTile], numFuro)) return true;
  }
  for (let v = 1; v <= 3; v++) {
    const testTile: Tile = { id: 'test', suit: 'dragon', value: v };
    if (checkWinConcealed([...hand, testTile], numFuro)) return true;
  }
  return false;
}

export function isMenzen(furoList: Furo[]): boolean {
  return furoList.every(f => f.type === 'ankan');
}

export function canRiichi(hand: Tile[], drawnTile: Tile | null, furoList: Furo[]): boolean {
  if (!isMenzen(furoList)) return false;
  const numFuro = furoList.length;
  const fullHand = drawnTile ? [...hand, drawnTile] : [...hand];
  if (fullHand.length !== 14 - 3 * numFuro) return false;

  for (let i = 0; i < fullHand.length; i++) {
    const testHand = fullHand.filter((_, idx) => idx !== i);
    if (checkTenpai(testHand, numFuro)) return true;
  }
  return false;
}

export function validRiichiDiscards(hand: Tile[], drawnTile: Tile | null, furoList: Furo[]): Set<string> {
  const valid = new Set<string>();
  if (!isMenzen(furoList)) return valid;
  const numFuro = furoList.length;
  const fullHand = drawnTile ? [...hand, drawnTile] : [...hand];
  if (fullHand.length !== 14 - 3 * numFuro) return valid;

  for (let i = 0; i < fullHand.length; i++) {
    const testHand = fullHand.filter((_, idx) => idx !== i);
    if (checkTenpai(testHand, numFuro)) {
      valid.add(fullHand[i].id);
    }
  }
  return valid;
}

export interface NakiOption {
  type: 'pung' | 'chii' | 'kan' | 'ankan' | 'daiminkan' | 'kakan';
  tiles: Tile[];
  calledTile: Tile;
}

export function findNakiOptions(hand: Tile[], discard: Tile): NakiOption[] {
  const options: NakiOption[] = [];

  const matching = hand.filter(t => sameTile(t, discard));
  if (matching.length >= 3) {
    options.push({
      type: 'daiminkan',
      tiles: matching.slice(0, 3),
      calledTile: discard,
    });
  }
  if (matching.length >= 2) {
    options.push({
      type: 'pung',
      tiles: matching.slice(0, 2),
      calledTile: discard,
    });
  }

  if (discard.suit !== 'wind' && discard.suit !== 'dragon') {
    const v = discard.value;
    const suit = discard.suit;
    if (v - 2 >= 1) {
      const t1 = hand.find(t => t.suit === suit && t.value === v - 2);
      const t2 = hand.find(t => t.suit === suit && t.value === v - 1 && t.id !== t1?.id);
      if (t1 && t2) options.push({ type: 'chii', tiles: [t1, t2], calledTile: discard });
    }
    if (v - 1 >= 1 && v + 1 <= 9) {
      const t1 = hand.find(t => t.suit === suit && t.value === v - 1);
      const t2 = hand.find(t => t.suit === suit && t.value === v + 1 && t.id !== t1?.id);
      if (t1 && t2) options.push({ type: 'chii', tiles: [t1, t2], calledTile: discard });
    }
    if (v + 2 <= 9) {
      const t1 = hand.find(t => t.suit === suit && t.value === v + 1);
      const t2 = hand.find(t => t.suit === suit && t.value === v + 2 && t.id !== t1?.id);
      if (t1 && t2) options.push({ type: 'chii', tiles: [t1, t2], calledTile: discard });
    }
  }

  return options;
}

export function findAnkanOptions(hand: Tile[], drawnTile: Tile | null): NakiOption[] {
  const all = drawnTile ? [...hand, drawnTile] : [...hand];
  const grouped = new Map<string, Tile[]>();
  for (const t of all) {
    const key = `${t.suit}-${t.value}`;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(t);
  }
  const options: NakiOption[] = [];
  for (const tiles of grouped.values()) {
    if (tiles.length >= 4) {
      options.push({
        type: 'ankan',
        tiles: tiles.slice(0, 4),
        calledTile: tiles[0],
      });
    }
  }
  return options;
}

export function findKakanOptions(hand: Tile[], drawnTile: Tile | null, furoList: Furo[]): NakiOption[] {
  const options: NakiOption[] = [];
  const allHand = drawnTile ? [...hand, drawnTile] : [...hand];
  const pungFuros = furoList.filter(f => f.type === 'pung');

  for (const furo of pungFuros) {
    const targetTile = furo.tiles[0];
    const match = allHand.find(t => sameTile(t, targetTile));
    if (match) {
      options.push({
        type: 'kakan',
        tiles: [match],
        calledTile: match,
      });
    }
  }
  return options;
}

export function initGame() {
  const deck = shuffle(createDeck());
  const playerHand = sortHand(deck.slice(0, 13));
  const cpuHand = sortHand(deck.slice(13, 26));
  const wanpai = deck.slice(26, 40);
  const wall = deck.slice(40);
  return { playerHand, cpuHand, wall, wanpai };
}
