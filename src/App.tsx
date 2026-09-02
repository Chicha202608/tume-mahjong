import { useState, useCallback, useEffect, useRef } from 'react';
import { Tile, Phase, Furo } from '@/types';
import { initGame, createDeck, shuffle, sortHand, checkWinConcealed, canRonConcealed, findNakiOptions, findAnkanOptions, findKakanOptions, isMenzen as isMenzenLogic, canRiichi as canRiichiLogic, validRiichiDiscards, sameTile, getWaits, isFuriten, NakiOption } from '@/gameLogic';
import TileCard from '@/components/TileCard';
import { RefreshCw, Trophy, Hand, X, Layers, Undo2, Redo2, Undo, Zap, Bug } from 'lucide-react';

const MAX_DRAWS = 18;
const WANPAI_COUNT = 14;

interface State {
  playerHand: Tile[];
  playerDrawnTile: Tile | null;
  cpuHand: Tile[];
  wall: Tile[];
  fullWall: Tile[];
  wanpai: Tile[];
  wallDrawnCount: number;
  playerDiscards: Tile[];
  cpuDiscards: Tile[];
  playerFuro: Furo[];
  cpuFuro: Furo[];
  phase: Phase;
  turnCount: number;
  lastCpuDiscard: Tile | null;
  nakiOptions: NakiOption[];
  ronAvailable: boolean;
  winType: 'tsumo' | 'ron' | null;
  doraCount: number;
  isRiichi: boolean;
  missedRonAfterRiichi: boolean;
}

type PlayerAction = 'passNaki' | 'callRon' | 'declareTsumo' | 'callNaki' | 'playerDiscard' | 'playerNakiDiscard';

function isStopState(s: State): boolean {
  return s.phase === 'playerDiscard' || s.phase === 'riichiSelect' || s.phase === 'naki' || s.phase === 'playerNakiDiscard' || s.phase === 'win' || s.phase === 'exhausted';
}

function actionMatchesNext(
  cur: State,
  next: State | undefined,
  action: PlayerAction,
  tile?: Tile,
  option?: NakiOption,
): boolean {
  if (!next) return false;
  switch (action) {
    case 'passNaki':
      return (next.phase === 'playerDraw' || next.phase === 'exhausted') && next.nakiOptions.length === 0 && !next.ronAvailable;
    case 'callRon':
      return next.phase === 'win' && next.winType === 'ron';
    case 'declareTsumo':
      return next.phase === 'win' && next.winType === 'tsumo';
    case 'callNaki': {
      if (next.phase !== 'playerNakiDiscard' || next.playerFuro.length !== cur.playerFuro.length + 1) return false;
      const newFuro = next.playerFuro[next.playerFuro.length - 1];
      const expectedIds = new Set([...(option?.tiles ?? []), cur.lastCpuDiscard].filter(t => t).map(t => t!.id));
      const actualIds = new Set(newFuro.tiles.map(t => t.id));
      return expectedIds.size === actualIds.size && [...expectedIds].every(id => actualIds.has(id));
    }
    case 'playerDiscard':
    case 'playerNakiDiscard': {
      if (next.phase !== 'cpuTurn' && next.phase !== 'exhausted') return false;
      if (next.playerDiscards.length !== cur.playerDiscards.length + 1) return false;
      return next.playerDiscards[next.playerDiscards.length - 1]?.id === tile?.id;
    }
    default:
      return false;
  }
}

function makeInitialState(): State {
  const { playerHand, cpuHand, wall, wanpai } = initGame();
  return makeInitialStateBase(playerHand, cpuHand, wall, wanpai);
}

function makeInitialStateBase(playerHand: Tile[], cpuHand: Tile[], wall: Tile[], wanpai: Tile[]): State {
  return {
    playerHand, playerDrawnTile: null,
    cpuHand, wall,
    fullWall: [...wall],
    wanpai,
    wallDrawnCount: 0,
    playerDiscards: [], cpuDiscards: [],
    playerFuro: [], cpuFuro: [],
    phase: 'playerDraw', turnCount: 0,
    lastCpuDiscard: null, nakiOptions: [], ronAvailable: false, winType: null,
    doraCount: 1,
    isRiichi: false,
    missedRonAfterRiichi: false,
  };
}

export default function App() {
  const [history, setHistory] = useState<State[]>(() => [makeInitialState()]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const [showWall, setShowWall] = useState(false);
  const [pendingAction, setPendingAction] = useState<{ action: () => void; message: string } | null>(null);
  const [dismissedIndex, setDismissedIndex] = useState(-1);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const state = history[historyIndex] ?? history[0] ?? makeInitialState();
  const isViewingPast = historyIndex < history.length - 1;

  const initNewGame = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    const s = makeInitialState();
    setHistory([s]);
    setHistoryIndex(0);
    setDismissedIndex(-1);
  }, []);

  const restart = useCallback(() => {
    initNewGame();
  }, [initNewGame]);

  const setupTestState = useCallback((mode: 'ankan' | 'kakan' | 'daiminkan') => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);

    const deck = shuffle(createDeck());

    const suits = ['man', 'pin', 'sou', 'wind', 'dragon'] as const;
    const suit = suits[Math.floor(Math.random() * suits.length)];
    const maxVal = suit === 'wind' ? 4 : suit === 'dragon' ? 3 : 9;
    const value = Math.floor(Math.random() * maxVal) + 1;

    const tileATiles = deck.filter(t => t.suit === suit && t.value === value);
    const remaining = deck.filter(t => !(t.suit === suit && t.value === value));

    const baseHand = remaining.slice(0, 10);
    const cpuHand = sortHand(remaining.slice(10, 23));
    const wanpai = remaining.slice(23, 37);
    const wallTiles = remaining.slice(37);

    let newState: State;

    if (mode === 'ankan') {
      const hand = sortHand([...baseHand, ...tileATiles.slice(0, 3)]);
      const wall = [tileATiles[3], ...wallTiles];
      newState = {
        ...makeInitialStateBase(hand, cpuHand, wall, wanpai),
      };
    } else if (mode === 'kakan') {
      const pungFuro: Furo = {
        tiles: tileATiles.slice(0, 3),
        type: 'pung',
        calledTile: tileATiles[0],
      };
      const hand = sortHand(baseHand);
      const wall = [tileATiles[3], ...wallTiles];
      newState = {
        ...makeInitialStateBase(hand, cpuHand, wall, wanpai),
        playerFuro: [pungFuro],
      };
    } else {
      const hand = sortHand([...baseHand, ...tileATiles.slice(0, 3)]);
      const wall = [wallTiles[0], tileATiles[3], ...wallTiles.slice(1)];
      newState = {
        ...makeInitialStateBase(hand, cpuHand, wall, wanpai),
      };
    }

    setHistory([newState]);
    setHistoryIndex(0);
    setDismissedIndex(-1);
  }, []);

  const playerDraw = useCallback(() => {
    setHistory(prev => {
      const cur = prev[historyIndex];
      if (!cur || cur.phase !== 'playerDraw' || cur.wall.length === 0) return prev;
      const [drawn, ...rest] = cur.wall;
      if (!drawn) return prev;
      const won = checkWinConcealed([...cur.playerHand, drawn], cur.playerFuro.length);
      const newState: State = {
        ...cur,
        playerDrawnTile: drawn,
        wall: rest,
        wallDrawnCount: cur.wallDrawnCount + 1,
        phase: won ? 'win' : 'playerDiscard',
        winType: won ? 'tsumo' : null,
      };
      const truncated = prev.slice(0, historyIndex + 1);
      return [...truncated, newState];
    });
    setHistoryIndex(prev => prev + 1);
  }, [historyIndex]);

  const playerDiscard = useCallback((tile: Tile) => {
    if (isViewingPast) {
      const cur = history[historyIndex];
      const next = history[historyIndex + 1];
      if (cur && next && actionMatchesNext(cur, next, 'playerDiscard', tile)) {
        setHistoryIndex(prev => prev + 1);
        return;
      }
      setPendingAction({
        message: 'これ以降の牌譜は消去されますが、よろしいですか？',
        action: () => {
          setHistory(prev => {
            const c = prev[historyIndex];
            if (!c || c.phase !== 'playerDiscard' || !c.playerDrawnTile) return prev;
            let newHand: Tile[];
            if (tile.id === c.playerDrawnTile.id) {
              newHand = c.playerHand;
            } else {
              newHand = sortHand([...c.playerHand.filter(t => t.id !== tile.id), c.playerDrawnTile]);
            }
            const newDiscards = [...c.playerDiscards, tile];
            const newTurnCount = c.turnCount + 1;
            let newState: State;
            if (c.wall.length === 0 || newTurnCount >= MAX_DRAWS) {
              newState = { ...c, playerHand: newHand, playerDrawnTile: null, playerDiscards: newDiscards, phase: 'exhausted', turnCount: newTurnCount };
            } else {
              newState = { ...c, playerHand: newHand, playerDrawnTile: null, playerDiscards: newDiscards, phase: 'cpuTurn', turnCount: newTurnCount };
            }
            const truncated = prev.slice(0, historyIndex + 1);
            return [...truncated, newState];
          });
          setHistoryIndex(prev => prev + 1);
        },
      });
      return;
    }
    setHistory(prev => {
      const cur = prev[historyIndex];
      if (!cur || cur.phase !== 'playerDiscard' || !cur.playerDrawnTile) return prev;
      let newHand: Tile[];
      if (tile.id === cur.playerDrawnTile.id) {
        newHand = cur.playerHand;
      } else {
        newHand = sortHand([...cur.playerHand.filter(t => t.id !== tile.id), cur.playerDrawnTile]);
      }
      const newDiscards = [...cur.playerDiscards, tile];
      const newTurnCount = cur.turnCount + 1;
      let newState: State;
      if (cur.wall.length === 0 || newTurnCount >= MAX_DRAWS) {
        newState = { ...cur, playerHand: newHand, playerDrawnTile: null, playerDiscards: newDiscards, phase: 'exhausted', turnCount: newTurnCount };
      } else {
        newState = { ...cur, playerHand: newHand, playerDrawnTile: null, playerDiscards: newDiscards, phase: 'cpuTurn', turnCount: newTurnCount };
      }
      const truncated = prev.slice(0, historyIndex + 1);
      return [...truncated, newState];
    });
    setHistoryIndex(prev => prev + 1);
  }, [historyIndex, isViewingPast, history]);

  const cpuTurn = useCallback(() => {
    setHistory(prev => {
      const cur = prev[historyIndex];
      if (!cur || cur.phase !== 'cpuTurn' || cur.wall.length === 0) return prev;
      const [drawn, ...rest] = cur.wall;
      const cpuDiscard = drawn;
      const cpuAfterDiscard = cur.cpuHand;
      const newCpuDiscards = [...cur.cpuDiscards, cpuDiscard];

      const rawRon = canRonConcealed(cur.playerHand, cpuDiscard, cur.playerFuro.length);
      const furiten = isFuriten(getWaits(cur.playerHand, cur.playerFuro), cur.playerDiscards);
      const ron = rawRon && !furiten && !cur.missedRonAfterRiichi;
      const naki = cur.isRiichi ? [] : findNakiOptions(cur.playerHand, cpuDiscard);

      let newState: State;
      if (ron || naki.length > 0) {
        newState = {
          ...cur, cpuHand: cpuAfterDiscard, wall: rest, wallDrawnCount: cur.wallDrawnCount + 1,
          cpuDiscards: newCpuDiscards, phase: 'naki',
          lastCpuDiscard: cpuDiscard, nakiOptions: naki, ronAvailable: ron,
        };
      } else if (rest.length === 0) {
        newState = { ...cur, cpuHand: cpuAfterDiscard, wall: rest, wallDrawnCount: cur.wallDrawnCount + 1, cpuDiscards: newCpuDiscards, phase: 'exhausted' };
      } else {
        newState = { ...cur, cpuHand: cpuAfterDiscard, wall: rest, wallDrawnCount: cur.wallDrawnCount + 1, cpuDiscards: newCpuDiscards, phase: 'playerDraw' };
      }
      const truncated = prev.slice(0, historyIndex + 1);
      return [...truncated, newState];
    });
    setHistoryIndex(prev => prev + 1);
  }, [historyIndex]);

  useEffect(() => {
    if (isViewingPast) {
      if (!isStopState(state) && historyIndex < history.length - 1) {
        timeoutRef.current = setTimeout(() => {
          setHistoryIndex(prev => Math.min(prev + 1, history.length - 1));
        }, 400);
        return () => { if (timeoutRef.current) clearTimeout(timeoutRef.current); };
      }
      return;
    }
    if (state.phase === 'cpuTurn' && state.wall.length > 0) {
      timeoutRef.current = setTimeout(() => cpuTurn(), 700);
      return () => { if (timeoutRef.current) clearTimeout(timeoutRef.current); };
    }
    if (state.phase === 'playerDraw' && state.wall.length > 0) {
      timeoutRef.current = setTimeout(() => playerDraw(), 500);
      return () => { if (timeoutRef.current) clearTimeout(timeoutRef.current); };
    }
    if (state.phase === 'playerDiscard' && state.isRiichi && state.playerDrawnTile && !isViewingPast) {
      const won = checkWinConcealed([...state.playerHand, state.playerDrawnTile], state.playerFuro.length);
      if (!won) {
        timeoutRef.current = setTimeout(() => playerDiscard(state.playerDrawnTile!), 700);
        return () => { if (timeoutRef.current) clearTimeout(timeoutRef.current); };
      }
    }
  }, [state.phase, state.wall.length, state.isRiichi, state.playerDrawnTile, state.playerHand, state.playerFuro, cpuTurn, playerDraw, playerDiscard, isViewingPast, historyIndex, history.length]);

  const callRon = useCallback(() => {
    if (isViewingPast) {
      const cur = history[historyIndex];
      const next = history[historyIndex + 1];
      if (cur && next && actionMatchesNext(cur, next, 'callRon')) {
        setHistoryIndex(prev => prev + 1);
        return;
      }
      setPendingAction({
        message: 'これ以降の牌譜は消去されますが、よろしいですか？',
        action: () => {
          setHistory(prev => {
            const cur = prev[historyIndex];
            if (!cur || cur.phase !== 'naki' || !cur.ronAvailable || !cur.lastCpuDiscard) return prev;
            const newState = { ...cur, phase: 'win' as Phase, winType: 'ron' as const };
            const truncated = prev.slice(0, historyIndex + 1);
            return [...truncated, newState];
          });
          setHistoryIndex(prev => prev + 1);
        },
      });
      return;
    }
    setHistory(prev => {
      const cur = prev[historyIndex];
      if (!cur || cur.phase !== 'naki' || !cur.ronAvailable || !cur.lastCpuDiscard) return prev;
      const newState = { ...cur, phase: 'win' as Phase, winType: 'ron' as const };
      const truncated = prev.slice(0, historyIndex + 1);
      return [...truncated, newState];
    });
    setHistoryIndex(prev => prev + 1);
  }, [historyIndex, isViewingPast, history]);

  const callNaki = useCallback((option: NakiOption) => {
    if (isViewingPast) {
      const cur = history[historyIndex];
      const next = history[historyIndex + 1];
      if (cur && next && actionMatchesNext(cur, next, 'callNaki', undefined, option)) {
        setHistoryIndex(prev => prev + 1);
        return;
      }
      setPendingAction({
        message: 'これ以降の牌譜は消去されますが、よろしいですか？',
        action: () => {
          setHistory(prev => {
            const cur = prev[historyIndex];
            if (!cur || cur.phase !== 'naki' || !cur.lastCpuDiscard) return prev;
            const tilesToRemove = new Set(option.tiles.map(t => t.id));
            const newHand = sortHand(cur.playerHand.filter(t => !tilesToRemove.has(t.id)));
            const newFuro: Furo = {
              tiles: [...option.tiles, cur.lastCpuDiscard],
              type: option.type,
              calledTile: cur.lastCpuDiscard,
            };
            const newState = {
              ...cur, playerHand: newHand, playerFuro: [...cur.playerFuro, newFuro],
              phase: 'playerNakiDiscard' as Phase, nakiOptions: [], ronAvailable: false,
            };
            const truncated = prev.slice(0, historyIndex + 1);
            return [...truncated, newState];
          });
          setHistoryIndex(prev => prev + 1);
        },
      });
      return;
    }
    setHistory(prev => {
      const cur = prev[historyIndex];
      if (!cur || cur.phase !== 'naki' || !cur.lastCpuDiscard) return prev;
      const tilesToRemove = new Set(option.tiles.map(t => t.id));
      const newHand = sortHand(cur.playerHand.filter(t => !tilesToRemove.has(t.id)));
      const newFuro: Furo = {
        tiles: [...option.tiles, cur.lastCpuDiscard],
        type: option.type,
        calledTile: cur.lastCpuDiscard,
      };
      const newState = {
        ...cur, playerHand: newHand, playerFuro: [...cur.playerFuro, newFuro],
        phase: 'playerNakiDiscard' as Phase, nakiOptions: [], ronAvailable: false,
      };
      const truncated = prev.slice(0, historyIndex + 1);
      return [...truncated, newState];
    });
    setHistoryIndex(prev => prev + 1);
  }, [historyIndex, isViewingPast, history]);

  const playerNakiDiscard = useCallback((tile: Tile) => {
    if (isViewingPast) {
      const cur = history[historyIndex];
      const next = history[historyIndex + 1];
      if (cur && next && actionMatchesNext(cur, next, 'playerNakiDiscard', tile)) {
        setHistoryIndex(prev => prev + 1);
        return;
      }
      setPendingAction({
        message: 'これ以降の牌譜は消去されますが、よろしいですか？',
        action: () => {
          setHistory(prev => {
            const cur = prev[historyIndex];
            if (!cur || cur.phase !== 'playerNakiDiscard') return prev;
            const newHand = sortHand(cur.playerHand.filter(t => t.id !== tile.id));
            const newDiscards = [...cur.playerDiscards, tile];
            let newState: State;
            if (cur.wall.length === 0) {
              newState = { ...cur, playerHand: newHand, playerDiscards: newDiscards, phase: 'exhausted' };
            } else {
              newState = { ...cur, playerHand: newHand, playerDiscards: newDiscards, phase: 'cpuTurn', lastCpuDiscard: null };
            }
            const truncated = prev.slice(0, historyIndex + 1);
            return [...truncated, newState];
          });
          setHistoryIndex(prev => prev + 1);
        },
      });
      return;
    }
    setHistory(prev => {
      const cur = prev[historyIndex];
      if (!cur || cur.phase !== 'playerNakiDiscard') return prev;
      const newHand = sortHand(cur.playerHand.filter(t => t.id !== tile.id));
      const newDiscards = [...cur.playerDiscards, tile];
      let newState: State;
      if (cur.wall.length === 0) {
        newState = { ...cur, playerHand: newHand, playerDiscards: newDiscards, phase: 'exhausted' };
      } else {
        newState = { ...cur, playerHand: newHand, playerDiscards: newDiscards, phase: 'cpuTurn', lastCpuDiscard: null };
      }
      const truncated = prev.slice(0, historyIndex + 1);
      return [...truncated, newState];
    });
    setHistoryIndex(prev => prev + 1);
  }, [historyIndex, isViewingPast, history]);

  const passNaki = useCallback(() => {
    if (isViewingPast) {
      const cur = history[historyIndex];
      const next = history[historyIndex + 1];
      if (cur && next && actionMatchesNext(cur, next, 'passNaki')) {
        setHistoryIndex(prev => prev + 1);
        return;
      }
      setPendingAction({
        message: 'これ以降の牌譜は消去されますが、よろしいですか？',
        action: () => {
          setHistory(prev => {
            const cur = prev[historyIndex];
            if (!cur || cur.phase !== 'naki') return prev;
            const missed = cur.isRiichi && cur.ronAvailable;
            let newState: State;
            if (cur.wall.length === 0) {
              newState = { ...cur, phase: 'exhausted', nakiOptions: [], ronAvailable: false, missedRonAfterRiichi: cur.missedRonAfterRiichi || missed };
            } else {
              newState = { ...cur, phase: 'playerDraw', nakiOptions: [], ronAvailable: false, lastCpuDiscard: null, missedRonAfterRiichi: cur.missedRonAfterRiichi || missed };
            }
            const truncated = prev.slice(0, historyIndex + 1);
            return [...truncated, newState];
          });
          setHistoryIndex(prev => prev + 1);
        },
      });
      return;
    }
    setHistory(prev => {
      const cur = prev[historyIndex];
      if (!cur || cur.phase !== 'naki') return prev;
      const missed = cur.isRiichi && cur.ronAvailable;
      let newState: State;
      if (cur.wall.length === 0) {
        newState = { ...cur, phase: 'exhausted', nakiOptions: [], ronAvailable: false, missedRonAfterRiichi: cur.missedRonAfterRiichi || missed };
      } else {
        newState = { ...cur, phase: 'playerDraw', nakiOptions: [], ronAvailable: false, lastCpuDiscard: null, missedRonAfterRiichi: cur.missedRonAfterRiichi || missed };
      }
      const truncated = prev.slice(0, historyIndex + 1);
      return [...truncated, newState];
    });
    setHistoryIndex(prev => prev + 1);
  }, [historyIndex, isViewingPast, history]);

  const declareTsumo = useCallback(() => {
    if (isViewingPast) {
      const cur = history[historyIndex];
      const next = history[historyIndex + 1];
      if (cur && next && actionMatchesNext(cur, next, 'declareTsumo')) {
        setHistoryIndex(prev => prev + 1);
        return;
      }
      setPendingAction({
        message: 'これ以降の牌譜は消去されますが、よろしいですか？',
        action: () => {
          setHistory(prev => {
            const cur = prev[historyIndex];
            if (!cur) return prev;
            const newState = { ...cur, phase: 'win' as Phase, winType: 'tsumo' as const };
            const truncated = prev.slice(0, historyIndex + 1);
            return [...truncated, newState];
          });
          setHistoryIndex(prev => prev + 1);
        },
      });
      return;
    }
    setHistory(prev => {
      const cur = prev[historyIndex];
      if (!cur) return prev;
      const newState = { ...cur, phase: 'win' as Phase, winType: 'tsumo' as const };
      const truncated = prev.slice(0, historyIndex + 1);
      return [...truncated, newState];
    });
    setHistoryIndex(prev => prev + 1);
  }, [historyIndex, isViewingPast, history]);

  const declareKan = useCallback((option: NakiOption) => {
    const executeKan = (cur: State): State | null => {
      const tilesToRemove = new Set(option.tiles.map(t => t.id));
      const isAnkan = option.type === 'ankan';
      const isKakan = option.type === 'kakan';
      const isDaiminkan = option.type === 'daiminkan';

      let newHand: Tile[];
      let newFuroList: Furo[];

      if (isKakan) {
        // 加槓: find the pung furo to upgrade, remove the 4th tile from hand/drawn
        const kakanTile = option.tiles[0];
        const targetKey = `${kakanTile.suit}-${kakanTile.value}`;
        const pungIdx = cur.playerFuro.findIndex(f => f.type === 'pung' && sameTile(f.tiles[0], kakanTile));
        if (pungIdx === -1) return null;
        const pungFuro = cur.playerFuro[pungIdx];
        const upgradedFuro: Furo = {
          tiles: [...pungFuro.tiles, kakanTile],
          type: 'kakan',
          calledTile: pungFuro.calledTile,
        };
        newFuroList = [...cur.playerFuro];
        newFuroList[pungIdx] = upgradedFuro;
        // Remove the kakan tile from hand or drawn
        if (cur.playerDrawnTile && kakanTile.id === cur.playerDrawnTile.id) {
          newHand = cur.playerHand;
        } else {
          newHand = sortHand(cur.playerHand.filter(t => t.id !== kakanTile.id));
        }
      } else if (isAnkan) {
        newHand = sortHand(cur.playerHand.filter(t => !tilesToRemove.has(t.id)));
        const newFuro: Furo = {
          tiles: option.tiles,
          type: 'ankan',
          calledTile: option.tiles[0],
        };
        newFuroList = [...cur.playerFuro, newFuro];
      } else if (isDaiminkan) {
        newHand = sortHand(cur.playerHand.filter(t => !tilesToRemove.has(t.id)));
        const newFuro: Furo = {
          tiles: [...option.tiles, cur.lastCpuDiscard!],
          type: 'daiminkan',
          calledTile: cur.lastCpuDiscard!,
        };
        newFuroList = [...cur.playerFuro, newFuro];
      } else {
        // Legacy 'kan' type (shouldn't occur anymore, but handle gracefully)
        newHand = sortHand(cur.playerHand.filter(t => !tilesToRemove.has(t.id)));
        const newFuro: Furo = {
          tiles: option.tiles,
          type: 'kan',
          calledTile: cur.lastCpuDiscard ?? option.tiles[0],
        };
        newFuroList = [...cur.playerFuro, newFuro];
      }

      // 嶺上ツモ: take from wanpai[0] (rinshan tiles)
      const [rinshan, ...restWanpai] = cur.wanpai;
      if (!rinshan) return null;

      // 王牌補充: move last tile from wall to end of wanpai
      let newWall = cur.wall;
      let newWanpai = restWanpai;
      if (cur.wall.length > 0) {
        const supplement = cur.wall[cur.wall.length - 1];
        newWall = cur.wall.slice(0, -1);
        newWanpai = [...restWanpai, supplement];
      }

      // カンドラ開帳
      const newDoraCount = cur.doraCount + 1;

      // ツモアガリ判定
      const won = checkWinConcealed([...newHand, rinshan], newFuroList.length);

      const newState: State = {
        ...cur,
        playerHand: newHand,
        playerFuro: newFuroList,
        playerDrawnTile: rinshan,
        wall: newWall,
        wanpai: newWanpai,
        doraCount: newDoraCount,
        phase: won ? 'win' : 'playerDiscard',
        winType: won ? ('tsumo' as const) : null,
        nakiOptions: [],
        ronAvailable: false,
        lastCpuDiscard: null,
      };
      return newState;
    };

    if (isViewingPast) {
      setPendingAction({
        message: 'これ以降の牌譜は消去されますが、よろしいですか？',
        action: () => {
          setHistory(prev => {
            const cur = prev[historyIndex];
            if (!cur) return prev;
            const newState = executeKan(cur);
            if (!newState) return prev;
            const truncated = prev.slice(0, historyIndex + 1);
            return [...truncated, newState];
          });
          setHistoryIndex(prev => prev + 1);
        },
      });
      return;
    }
    setHistory(prev => {
      const cur = prev[historyIndex];
      if (!cur) return prev;
      const newState = executeKan(cur);
      if (!newState) return prev;
      const truncated = prev.slice(0, historyIndex + 1);
      return [...truncated, newState];
    });
    setHistoryIndex(prev => prev + 1);
  }, [historyIndex, isViewingPast]);

  const declareRiichi = useCallback(() => {
    if (isViewingPast) {
      setPendingAction({
        message: 'これ以降の牌譜は消去されますが、よろしいですか？',
        action: () => {
          setHistory(prev => {
            const cur = prev[historyIndex];
            if (!cur || cur.phase !== 'playerDiscard') return prev;
            const newState: State = { ...cur, phase: 'riichiSelect' as Phase };
            const truncated = prev.slice(0, historyIndex + 1);
            return [...truncated, newState];
          });
          setHistoryIndex(prev => prev + 1);
        },
      });
      return;
    }
    setHistory(prev => {
      const cur = prev[historyIndex];
      if (!cur || cur.phase !== 'playerDiscard') return prev;
      const newState: State = { ...cur, phase: 'riichiSelect' as Phase };
      const truncated = prev.slice(0, historyIndex + 1);
      return [...truncated, newState];
    });
    setHistoryIndex(prev => prev + 1);
  }, [historyIndex, isViewingPast]);

  const riichiDiscard = useCallback((tile: Tile) => {
    if (isViewingPast) {
      const cur = history[historyIndex];
      const next = history[historyIndex + 1];
      if (cur && next && next.phase === 'cpuTurn' && next.isRiichi === true && next.playerDiscards.length === cur.playerDiscards.length + 1 && next.playerDiscards[next.playerDiscards.length - 1]?.id === tile.id) {
        setHistoryIndex(prev => prev + 1);
        return;
      }
      setPendingAction({
        message: 'これ以降の牌譜は消去されますが、よろしいですか？',
        action: () => {
          setHistory(prev => {
            const cur = prev[historyIndex];
            if (!cur || cur.phase !== 'riichiSelect' || !cur.playerDrawnTile) return prev;
            let newHand: Tile[];
            if (tile.id === cur.playerDrawnTile.id) {
              newHand = cur.playerHand;
            } else {
              newHand = sortHand([...cur.playerHand.filter(t => t.id !== tile.id), cur.playerDrawnTile]);
            }
            const newDiscards = [...cur.playerDiscards, tile];
            const newTurnCount = cur.turnCount + 1;
            let newState: State;
            if (cur.wall.length === 0 || newTurnCount >= MAX_DRAWS) {
              newState = { ...cur, playerHand: newHand, playerDrawnTile: null, playerDiscards: newDiscards, phase: 'exhausted', turnCount: newTurnCount, isRiichi: true };
            } else {
              newState = { ...cur, playerHand: newHand, playerDrawnTile: null, playerDiscards: newDiscards, phase: 'cpuTurn', turnCount: newTurnCount, isRiichi: true };
            }
            const truncated = prev.slice(0, historyIndex + 1);
            return [...truncated, newState];
          });
          setHistoryIndex(prev => prev + 1);
        },
      });
      return;
    }
    setHistory(prev => {
      const cur = prev[historyIndex];
      if (!cur || cur.phase !== 'riichiSelect' || !cur.playerDrawnTile) return prev;
      let newHand: Tile[];
      if (tile.id === cur.playerDrawnTile.id) {
        newHand = cur.playerHand;
      } else {
        newHand = sortHand([...cur.playerHand.filter(t => t.id !== tile.id), cur.playerDrawnTile]);
      }
      const newDiscards = [...cur.playerDiscards, tile];
      const newTurnCount = cur.turnCount + 1;
      let newState: State;
      if (cur.wall.length === 0 || newTurnCount >= MAX_DRAWS) {
        newState = { ...cur, playerHand: newHand, playerDrawnTile: null, playerDiscards: newDiscards, phase: 'exhausted', turnCount: newTurnCount, isRiichi: true };
      } else {
        newState = { ...cur, playerHand: newHand, playerDrawnTile: null, playerDiscards: newDiscards, phase: 'cpuTurn', turnCount: newTurnCount, isRiichi: true };
      }
      const truncated = prev.slice(0, historyIndex + 1);
      return [...truncated, newState];
    });
    setHistoryIndex(prev => prev + 1);
  }, [historyIndex, isViewingPast, history]);

  // "待った" — undo last move or commit rollback from past view
  const matta = useCallback(() => {
    if (historyIndex === 0) return;
    if (isViewingPast) {
      setPendingAction({
        message: 'この局面まで戻って打ち直しますか？（これ以降の牌譜は消去されます）',
        action: () => {
          setHistory(prev => prev.slice(0, historyIndex + 1));
          setDismissedIndex(-1);
        },
      });
      return;
    }
    // Latest step: go back to previous stop state, no popup
    let idx = historyIndex - 1;
    while (idx > 0 && !isStopState(history[idx])) idx--;
    setHistory(prev => prev.slice(0, idx + 1));
    setHistoryIndex(idx);
    setDismissedIndex(-1);
  }, [historyIndex, history, isViewingPast]);

  // "1手戻る" — navigate back to previous stop state for viewing
  const stepBack = useCallback(() => {
    if (historyIndex <= 0) return;
    let idx = historyIndex - 1;
    while (idx > 0 && !isStopState(history[idx])) idx--;
    setHistoryIndex(Math.max(0, idx));
  }, [historyIndex, history]);

  // "1手進む" — navigate forward to next stop state for viewing
  const stepForward = useCallback(() => {
    if (historyIndex >= history.length - 1) return;
    let idx = historyIndex + 1;
    while (idx < history.length - 1 && !isStopState(history[idx])) idx++;
    setHistoryIndex(Math.min(history.length - 1, idx));
  }, [historyIndex, history]);

  const confirmPendingAction = useCallback(() => {
    if (pendingAction) {
      pendingAction.action();
      setPendingAction(null);
    }
  }, [pendingAction]);

  const cancelPendingAction = useCallback(() => {
    setPendingAction(null);
  }, []);

  const { playerHand, playerDrawnTile, cpuHand, wall, fullWall, wallDrawnCount, wanpai, playerDiscards, cpuDiscards, playerFuro, phase, turnCount, lastCpuDiscard, nakiOptions, ronAvailable, winType, doraCount, isRiichi } = state;

  const canTsumo = playerDrawnTile && checkWinConcealed([...playerHand, playerDrawnTile], playerFuro.length);
  const ankanOptions = playerDrawnTile ? findAnkanOptions(playerHand, playerDrawnTile) : [];
  const kakanOptions = playerDrawnTile ? findKakanOptions(playerHand, playerDrawnTile, playerFuro) : [];

  const isMenzen = isMenzenLogic(playerFuro);
  const canRiichi = !isRiichi && isMenzen && phase === 'playerDiscard' && playerDrawnTile && canRiichiLogic(playerHand, playerDrawnTile, playerFuro);
  const riichiValidTiles = phase === 'riichiSelect' && playerDrawnTile ? validRiichiDiscards(playerHand, playerDrawnTile, playerFuro) : new Set<string>();

  return (
    <div className="min-h-screen bg-[#1a2e1a] flex flex-col" style={{ fontFamily: "'Segoe UI', system-ui', sans-serif" }}>
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-3 bg-[#0f1f0f] border-b border-[#2d4a2d]">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-green-700 flex items-center justify-center">
            <span className="text-white font-black text-sm">麻</span>
          </div>
          <h1 className="text-white font-bold text-xl tracking-wide">麻雀ソリティア</h1>
        </div>
        <div className="flex items-center gap-3 text-sm text-green-300">
          {isViewingPast && (
            <span className="text-amber-400 text-xs font-semibold">
              牌譜 {historyIndex + 1}/{history.length}
            </span>
          )}
          <span>巡目 <span className="text-white font-bold">{turnCount}</span>/{MAX_DRAWS}</span>
          <span>山 <span className="text-white font-bold">{wall.length}</span>枚</span>
          <button
            onClick={restart}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-green-700 hover:bg-green-600 text-white text-sm font-medium transition-colors"
          >
            <RefreshCw size={14} />
            新局
          </button>
        </div>
      </header>

      {/* Dora indicator area */}
      <div className="flex items-center gap-3 px-4 py-2 bg-[#0a1a0a] border-b border-[#2d4a2d]">
        <span className="text-red-400 text-xs font-bold tracking-wider">ドラ表示</span>
        <div className="flex gap-0.5">
          {Array.from({ length: 5 }).map((_, i) => {
            const isRevealed = i < doraCount;
            return (
              <TileCard
                key={i}
                tile={wanpai[i * 2] ?? { id: `dummy-${i}`, suit: 'man', value: 1 }}
                size="sm"
                faceDown={!isRevealed}
              />
            );
          })}
        </div>
        {((ankanOptions.length > 0 || kakanOptions.length > 0) && phase === 'playerDiscard' && !isViewingPast) && (
          <div className="flex items-center gap-2 ml-4">
            {(ankanOptions.length > 0 || kakanOptions.length > 0) && (
              <span className="text-blue-400 text-xs font-semibold">カン可能:</span>
            )}
            {ankanOptions.map((opt, idx) => (
              <button
                key={`ankan-${idx}`}
                onClick={() => declareKan(opt)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-700 hover:bg-purple-600 active:scale-95 text-white font-bold text-xs transition-all shadow-md"
              >
                <span>暗カン</span>
                <span className="flex gap-0.5 ml-1 bg-[#f8f4e8] rounded p-0.5">
                  {opt.tiles.map(t => (
                    <MiniTile key={t.id} tile={t} />
                  ))}
                </span>
              </button>
            ))}
            {kakanOptions.map((opt, idx) => (
              <button
                key={`kakan-${idx}`}
                onClick={() => declareKan(opt)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 active:scale-95 text-white font-bold text-xs transition-all shadow-md"
              >
                <span>加槓</span>
                <span className="flex gap-0.5 ml-1 bg-[#f8f4e8] rounded p-0.5">
                  <MiniTile key={opt.tiles[0].id} tile={opt.tiles[0]} />
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* History controls */}
      <div className="flex items-center justify-center gap-2 px-4 py-2 bg-[#0f1f0f] border-b border-[#2d4a2d]">
        <button
          onClick={matta}
          disabled={historyIndex === 0}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-orange-700 hover:bg-orange-600 active:scale-95 text-white text-sm font-bold transition-all shadow-md disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <Undo size={14} />
          待った
        </button>
        <button
          onClick={stepBack}
          disabled={historyIndex === 0}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-gray-700 hover:bg-gray-600 active:scale-95 text-white text-sm font-bold transition-all shadow-md disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <Undo2 size={14} />
          1手戻る
        </button>
        <button
          onClick={stepForward}
          disabled={historyIndex >= history.length - 1}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-gray-700 hover:bg-gray-600 active:scale-95 text-white text-sm font-bold transition-all shadow-md disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <Redo2 size={14} />
          1手進む
        </button>
      </div>

      {/* Debug test buttons */}
      <div className="flex items-center justify-center gap-2 px-4 py-1.5 bg-[#0a1a0a] border-b border-[#2d4a2d]">
        <span className="text-gray-500 text-xs font-semibold flex items-center gap-1">
          <Bug size={12} />
          テスト:
        </span>
        <button
          onClick={() => setupTestState('ankan')}
          className="px-3 py-1 rounded-md bg-gray-800 hover:bg-gray-700 active:scale-95 text-gray-300 text-xs font-medium transition-all"
        >
          暗カン準備
        </button>
        <button
          onClick={() => setupTestState('kakan')}
          className="px-3 py-1 rounded-md bg-gray-800 hover:bg-gray-700 active:scale-95 text-gray-300 text-xs font-medium transition-all"
        >
          加槓準備
        </button>
        <button
          onClick={() => setupTestState('daiminkan')}
          className="px-3 py-1 rounded-md bg-gray-800 hover:bg-gray-700 active:scale-95 text-gray-300 text-xs font-medium transition-all"
        >
          大明槓準備
        </button>
      </div>

      <div className="flex flex-col flex-1 gap-0 overflow-hidden">
        {/* CPU section */}
        <section className="px-4 py-3 bg-[#152615] border-b border-[#2d4a2d]">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-green-400 text-sm font-semibold tracking-widest uppercase">
              対面 (CPU)
            </h2>
            <span className="text-green-600 text-xs">{cpuHand.length}枚</span>
          </div>
          <div className="flex flex-wrap gap-1">
            {cpuHand.map((tile, idx) => (
              <TileCard key={tile.id ?? idx} tile={tile} size="sm" faceDown />
            ))}
          </div>
          {/* CPU furo */}
          {state.cpuFuro.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-3">
              {state.cpuFuro.map((f, i) => (
                <div key={i} className="flex gap-0.5 bg-[#0e1e0e] rounded p-1 items-center">
                  {f.tiles.map(t => (
                    <TileCard key={t.id} tile={t} size="xs" rotated={t.id === f.calledTile.id} />
                  ))}
                </div>
              ))}
            </div>
          )}
          {cpuDiscards.length > 0 && (
            <div className="mt-2">
              <span className="text-green-600 text-xs">捨て牌: </span>
              <div className="inline-flex flex-wrap gap-0.5 mt-1">
                {cpuDiscards.map(tile => (
                  <TileCard
                    key={tile.id}
                    tile={tile}
                    size="xs"
                    className={tile.id === lastCpuDiscard?.id ? 'ring-2 ring-red-400' : ''}
                  />
                ))}
              </div>
            </div>
          )}
        </section>

        {/* Player discards */}
        {playerDiscards.length > 0 && (
          <section className="px-4 py-2 bg-[#172917] border-b border-[#2d4a2d]">
            <span className="text-green-600 text-xs">自分の捨て牌: </span>
            <div className="inline-flex flex-wrap gap-0.5 mt-1">
              {playerDiscards.map(tile => (
                <TileCard key={tile.id} tile={tile} size="xs" />
              ))}
            </div>
          </section>
        )}

        {/* Player furo (副露エリア) */}
        {playerFuro.length > 0 && (
          <section className="px-4 py-2 bg-[#1e3a1e] border-b border-[#2d4a2d]">
            <span className="text-amber-400 text-xs font-semibold">副露（晒し牌）: </span>
            <div className="flex flex-wrap gap-3 mt-1">
              {playerFuro.map((f, i) => {
                if (f.type === 'ankan') {
                  return (
                    <div key={i} className="flex gap-0.5 bg-[#0e1e0e] rounded p-1 items-end">
                      {f.tiles.map((t, idx) => (
                        <TileCard
                          key={t.id}
                          tile={t}
                          size="sm"
                          faceDown={idx === 0 || idx === 3}
                        />
                      ))}
                    </div>
                  );
                }
                if (f.type === 'kakan') {
                  const extraTile = f.tiles[3];
                  return (
                    <div key={i} className="flex gap-0.5 bg-[#0e1e0e] rounded p-1 items-end">
                      {f.tiles.slice(0, 3).map(t => {
                        const isCalled = t.id === f.calledTile.id;
                        if (isCalled) {
                          return (
                            <div key={t.id} className="flex flex-col gap-0">
                              <TileCard tile={extraTile} size="sm" rotated />
                              <TileCard tile={t} size="sm" rotated />
                            </div>
                          );
                        }
                        return <TileCard key={t.id} tile={t} size="sm" />;
                      })}
                    </div>
                  );
                }
                return (
                  <div key={i} className="flex gap-0.5 bg-[#0e1e0e] rounded p-1 items-center">
                    {f.tiles.map(t => (
                      <TileCard
                        key={t.id}
                        tile={t}
                        size="sm"
                        rotated={t.id === f.calledTile.id}
                      />
                    ))}
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Naki / Ron buttons */}
        {phase === 'naki' && lastCpuDiscard && (
          <div className="px-4 py-3 bg-[#1e3a1e] border-b border-[#2d4a2d] flex items-center justify-center gap-3 flex-wrap">
            {ronAvailable && (
              <button
                onClick={callRon}
                className="flex items-center gap-2 px-6 py-2.5 rounded-lg bg-red-600 hover:bg-red-500 active:scale-95 text-white font-bold text-base transition-all shadow-lg animate-pulse"
              >
                <Trophy size={18} />
                ロン
              </button>
            )}
            {nakiOptions.map((opt, idx) => (
              <button
                key={idx}
                onClick={() => (opt.type === 'daiminkan' || opt.type === 'kan') ? declareKan(opt) : callNaki(opt)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg ${(opt.type === 'daiminkan' || opt.type === 'kan') ? 'bg-purple-600 hover:bg-purple-500' : 'bg-blue-600 hover:bg-blue-500'} active:scale-95 text-white font-bold text-sm transition-all shadow-lg`}
              >
                <Hand size={16} />
                <span>{opt.type === 'pung' ? 'ポン' : (opt.type === 'daiminkan' || opt.type === 'kan') ? 'カン' : 'チー'}</span>
                <span className="flex gap-0.5 ml-1 bg-[#f8f4e8] rounded p-0.5">
                  {[...opt.tiles, opt.calledTile].sort((a, b) =>
                    a.suit === b.suit ? a.value - b.value : 0
                  ).map(t => (
                    <MiniTile key={t.id} tile={t} />
                  ))}
                </span>
              </button>
            ))}
            <button
              onClick={passNaki}
              className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-gray-600 hover:bg-gray-500 active:scale-95 text-white font-bold text-base transition-all shadow-lg"
            >
              スルー
            </button>
          </div>
        )}

        {/* Status bar */}
        <div className="px-4 py-2 bg-[#1a2e1a]">
          <StatusBar phase={phase} wallCount={wall.length} isViewingPast={isViewingPast} />
        </div>

        {/* Hand section */}
        <section className="flex-1 flex flex-col items-center justify-center px-4 py-6">
          <div className="flex items-center gap-3 mb-4 flex-wrap justify-center">
            <h2 className="text-green-400 text-sm font-semibold tracking-widest uppercase">
              手牌 — {playerHand.length}枚
              {playerDrawnTile && <span className="text-amber-400"> + ツモ1枚</span>}
            </h2>
            <button
              onClick={() => setShowWall(true)}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-amber-700 hover:bg-amber-600 active:scale-95 text-white font-bold text-sm transition-all shadow-md"
            >
              <Layers size={14} />
              ツモ山を確認
            </button>
            {canTsumo && (
              <button
                onClick={declareTsumo}
                className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-yellow-500 hover:bg-yellow-400 active:scale-95 text-yellow-900 font-bold text-sm transition-all shadow-md animate-pulse"
              >
                <Trophy size={14} />
                ツモアガリ
              </button>
            )}
            {canRiichi && !isViewingPast && (
              <button
                onClick={declareRiichi}
                className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 active:scale-95 text-white font-bold text-sm transition-all shadow-md"
              >
                <Zap size={14} />
                リーチ
              </button>
            )}
            {phase === 'riichiSelect' && !isViewingPast && (
              <span className="text-blue-400 font-normal normal-case text-xs animate-pulse">
                リーチ — 宣言牌（捨て牌）をクリック
              </span>
            )}
            {phase === 'playerDiscard' && !canTsumo && !isViewingPast && (
              <span className="text-amber-400 font-normal normal-case text-xs animate-pulse">
                捨てる牌をクリック
              </span>
            )}
            {phase === 'playerNakiDiscard' && !isViewingPast && (
              <span className="text-blue-400 font-normal normal-case text-xs animate-pulse">
                鳴きました — 捨てる牌をクリック
              </span>
            )}
            {isViewingPast && (phase === 'playerDiscard' || phase === 'playerNakiDiscard') && (
              <span className="text-amber-400 font-normal normal-case text-xs">
                牌譜閲覧中 — 牌をクリックで新しく打ち直せます
              </span>
            )}
          </div>

          <div className="flex flex-wrap justify-center gap-2 items-end">
            {playerHand.map(tile => {
              const isRiichiInvalid = phase === 'riichiSelect' && !riichiValidTiles.has(tile.id);
              return (
                <TileCard
                  key={tile.id}
                  tile={tile}
                  size="lg"
                  className={isRiichiInvalid ? 'opacity-30 grayscale pointer-events-none' : ''}
                  onClick={
                    phase === 'playerDiscard' ? () => playerDiscard(tile) :
                    phase === 'playerNakiDiscard' ? () => playerNakiDiscard(tile) :
                    phase === 'riichiSelect' && !isRiichiInvalid ? () => riichiDiscard(tile) :
                    undefined
                  }
                />
              );
            })}
            {playerDrawnTile && (
              <div className="ml-4">
                <TileCard
                  tile={playerDrawnTile}
                  size="lg"
                  highlighted
                  className={phase === 'riichiSelect' && !riichiValidTiles.has(playerDrawnTile.id) ? 'opacity-30 grayscale pointer-events-none' : ''}
                  onClick={
                    phase === 'playerDiscard' ? () => playerDiscard(playerDrawnTile) :
                    phase === 'playerNakiDiscard' ? () => playerNakiDiscard(playerDrawnTile) :
                    phase === 'riichiSelect' && riichiValidTiles.has(playerDrawnTile.id) ? () => riichiDiscard(playerDrawnTile) :
                    undefined
                  }
                />
              </div>
            )}
          </div>
        </section>
      </div>

      {/* Wall modal — shows full wall and wanpai */}
      {showWall && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50" onClick={() => setShowWall(false)}>
          <div className="bg-[#152615] border border-green-700 rounded-2xl p-6 max-w-4xl w-full mx-4 shadow-2xl max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-white font-bold text-lg flex items-center gap-2">
                <Layers size={20} className="text-amber-400" />
                ツモ山 — 残り{wall.length}枚 / 全{fullWall.length}枚
              </h2>
              <button
                onClick={() => setShowWall(false)}
                className="text-green-400 hover:text-white transition-colors"
              >
                <X size={24} />
              </button>
            </div>

            {/* Live wall */}
            <div className="rounded-lg p-3 bg-[#0e1e0e]">
              {fullWall.length === 0 ? (
                <p className="text-green-700 text-sm text-center py-8">山がありません</p>
              ) : (
                <div className="flex flex-wrap gap-1">
                  {fullWall.map((tile, idx) => {
                    const isDrawn = idx < wallDrawnCount;
                    const isNext = idx === wallDrawnCount && idx < fullWall.length;
                    return (
                      <div key={tile.id} className="flex flex-col items-center gap-1">
                        <span className={`text-[10px] ${isNext ? 'text-amber-400 font-bold' : isDrawn ? 'text-gray-600' : 'text-green-600'}`}>
                          {idx + 1}
                        </span>
                        <TileCard
                          tile={tile}
                          size="sm"
                          className={`${isDrawn ? 'opacity-30 grayscale' : ''} ${isNext ? 'ring-2 ring-amber-400 border-amber-400' : ''}`}
                        />
                        {isNext && <span className="text-amber-400 text-[9px] font-bold">次</span>}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Wanpai section — below the live wall, simple flex-wrap, no gap */}
            <div className="mt-4 rounded-lg p-3 bg-[#0e1e0e]">
              <h3 className="text-amber-400 text-sm font-bold mb-3 flex items-center gap-2">
                <Layers size={14} />
                王牌（{WANPAI_COUNT}枚）
              </h3>
              {(() => {
                type WanpaiSlot = { tile: Tile | undefined; label: string; labelColor: string };
                const slots: WanpaiSlot[] = [];

                // 1-4: 嶺上牌 (rinshan tiles) — wanpai[0..3]
                for (let i = 0; i < 4; i++) {
                  slots.push({ tile: wanpai[i], label: '嶺上牌', labelColor: 'text-blue-400' });
                }
                // 5: 表ドラ表示牌 — wanpai[4]
                slots.push({ tile: wanpai[4], label: '表ドラ', labelColor: 'text-red-400 font-bold' });
                // 6: 裏ドラ表示牌 — wanpai[9]
                slots.push({ tile: wanpai[9], label: '裏ドラ', labelColor: 'text-purple-400 font-bold' });
                // 7-8: 槓ドラ1 / 槓裏ドラ1 — wanpai[5], wanpai[10]
                slots.push({ tile: wanpai[5], label: '槓ドラ1', labelColor: 'text-red-400 font-bold' });
                slots.push({ tile: wanpai[10], label: '槓裏ドラ1', labelColor: 'text-purple-400 font-bold' });
                // 9-10: 槓ドラ2 / 槓裏ドラ2 — wanpai[6], wanpai[11]
                slots.push({ tile: wanpai[6], label: '槓ドラ2', labelColor: 'text-red-400 font-bold' });
                slots.push({ tile: wanpai[11], label: '槓裏ドラ2', labelColor: 'text-purple-400 font-bold' });
                // 11-12: 槓ドラ3 / 槓裏ドラ3 — wanpai[7], wanpai[12]
                slots.push({ tile: wanpai[7], label: '槓ドラ3', labelColor: 'text-red-400 font-bold' });
                slots.push({ tile: wanpai[12], label: '槓裏ドラ3', labelColor: 'text-purple-400 font-bold' });
                // 13-14: 槓ドラ4 / 槓裏ドラ4 — wanpai[8], wanpai[13]
                slots.push({ tile: wanpai[8], label: '槓ドラ4', labelColor: 'text-red-400 font-bold' });
                slots.push({ tile: wanpai[13], label: '槓裏ドラ4', labelColor: 'text-purple-400 font-bold' });

                return (
                  <div className="flex flex-wrap gap-0">
                    {slots.map((slot, i) => (
                      <div key={i} className="flex flex-col items-center gap-0.5">
                        <span className={`text-[8px] ${slot.labelColor} whitespace-nowrap`}>{slot.label}</span>
                        {slot.tile ? (
                          <TileCard tile={slot.tile} size="sm" />
                        ) : (
                          <div className="w-10 h-14 rounded-md border border-[#3a5a3a] bg-[#1a3a1a]" />
                        )}
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>

            <div className="flex items-center gap-4 mt-3 text-xs flex-wrap">
              <span className="flex items-center gap-1.5 text-gray-400">
                <span className="w-4 h-5 bg-[#f8f4e8] opacity-30 grayscale rounded-sm"></span>
                ツモ済み
              </span>
              <span className="flex items-center gap-1.5 text-amber-400">
                <span className="w-4 h-5 bg-[#f8f4e8] rounded-sm ring-2 ring-amber-400"></span>
                次にツモる牌
              </span>
              <span className="flex items-center gap-1.5 text-green-400">
                <span className="w-4 h-5 bg-[#f8f4e8] rounded-sm"></span>
                未来の牌
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Confirm overwrite popup */}
      {pendingAction && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[60]">
          <div className="bg-[#1e2a1e] border border-amber-500 rounded-2xl p-6 max-w-sm w-full mx-4 shadow-2xl flex flex-col items-center gap-4">
            <h2 className="text-amber-300 font-bold text-lg text-center">確認</h2>
            <p className="text-green-200 text-sm text-center">
              {pendingAction.message}
            </p>
            <div className="flex gap-3 mt-2">
              <button
                onClick={confirmPendingAction}
                className="px-6 py-2.5 rounded-lg bg-red-600 hover:bg-red-500 active:scale-95 text-white font-bold text-sm transition-all shadow-md"
              >
                OK
              </button>
              <button
                onClick={cancelPendingAction}
                className="px-6 py-2.5 rounded-lg bg-gray-600 hover:bg-gray-500 active:scale-95 text-white font-bold text-sm transition-all shadow-md"
              >
                キャンセル
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Game over overlays */}
      {(() => {
        const isGameOver = (phase === 'win' || phase === 'exhausted') && !isViewingPast;
        const showGameOver = isGameOver && dismissedIndex !== historyIndex;
        if (!showGameOver) return null;
        return phase === 'exhausted' ? (
          <GameOverOverlay
            title="流局"
            message={`ツモ${MAX_DRAWS}回に達しました`}
            onRestart={restart}
            onOk={() => setDismissedIndex(historyIndex)}
          />
        ) : (
          <GameOverOverlay
            title={winType === 'ron' ? 'ロン！' : 'ツモ！'}
            message="おめでとうございます — あがり！"
            onRestart={restart}
            onOk={() => setDismissedIndex(historyIndex)}
            isWin
          />
        );
      })()}
    </div>
  );
}

function MiniTile({ tile }: { tile: Tile }) {
  const label = (() => {
    switch (tile.suit) {
      case 'man': return `${tile.value}m`;
      case 'pin': return `${tile.value}p`;
      case 'sou': return `${tile.value}s`;
      case 'wind': return ['東', '南', '西', '北'][tile.value - 1];
      case 'dragon': return ['白', '發', '中'][tile.value - 1];
    }
  })();
  return (
    <span className="inline-flex items-center justify-center w-6 h-8 text-[10px] font-bold text-[#1a237e] bg-[#f8f4e8] rounded-sm border border-[#d0c8b0]">
      {label}
    </span>
  );
}

function StatusBar({ phase, wallCount, isViewingPast }: { phase: Phase; wallCount: number; isViewingPast: boolean }) {
  if (isViewingPast) {
    return <p className="text-sm text-center text-amber-300">牌譜閲覧中</p>;
  }
  const messages: Record<string, string> = {
    playerDraw: wallCount > 0 ? 'ツモ中...' : '山牌がなくなりました',
    playerDiscard: '手牌から1枚選んで捨ててください',
    cpuTurn: 'CPUが思考中...',
    naki: 'CPUの捨て牌に対してアクションを選んでください',
    playerNakiDiscard: '鳴いた牌を含めて1枚を捨ててください',
    win: 'あがり！',
    exhausted: '流局です',
  };

  const colors: Record<string, string> = {
    playerDraw: 'text-green-300',
    playerDiscard: 'text-amber-300',
    cpuTurn: 'text-blue-300',
    naki: 'text-red-300',
    playerNakiDiscard: 'text-blue-300',
    win: 'text-yellow-300',
    exhausted: 'text-gray-400',
  };

  return (
    <p className={`text-sm text-center ${colors[phase] ?? 'text-green-300'}`}>
      {messages[phase] ?? ''}
    </p>
  );
}

function GameOverOverlay({ title, message, onRestart, onOk, isWin }: { title: string; message: string; onRestart: () => void; onOk: () => void; isWin?: boolean }) {
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className={`border rounded-2xl p-8 flex flex-col items-center gap-4 shadow-2xl ${isWin ? 'bg-[#2a2a1a] border-yellow-500' : 'bg-[#1a2e1a] border-green-700'}`}>
        {isWin && <Trophy size={48} className="text-yellow-400" />}
        <h2 className={`text-3xl font-black ${isWin ? 'text-yellow-300' : 'text-white'}`}>{title}</h2>
        <p className={`text-base ${isWin ? 'text-yellow-200' : 'text-green-400'}`}>{message}</p>
        <div className="flex gap-3 mt-2">
          <button
            onClick={onOk}
            className="flex items-center gap-2 px-6 py-3 rounded-xl bg-gray-600 hover:bg-gray-500 text-white font-bold text-lg transition-colors"
          >
            OK
          </button>
          <button
            onClick={onRestart}
            className="flex items-center gap-2 px-6 py-3 rounded-xl bg-green-700 hover:bg-green-600 text-white font-bold text-lg transition-colors"
          >
            <RefreshCw size={18} />
            もう一局
          </button>
        </div>
      </div>
    </div>
  );
}
