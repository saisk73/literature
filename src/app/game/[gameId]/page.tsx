'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import gsap from 'gsap';

// ─── Types ──────────────────────────────────────────────
interface Player {
  id: string;
  name: string;
  team: number;
  seatPosition: number;
  cardCount: number;
}

interface LogEntry {
  action: string;
  playerId: string;
  details: { message?: string; [key: string]: unknown } | null;
  createdAt: string;
}

interface Claim {
  half_suit: string;
  claimed_by_team: number | null;
}

interface GameState {
  id: string;
  code: string;
  status: 'waiting' | 'playing' | 'finished';
  maxPlayers: number;
  currentTurnPlayerId: string | null;
  createdBy: string;
  team1Score: number;
  team2Score: number;
  winner: number | null;
  showLog: boolean;
  updatedAt: string;
  isPlayer: boolean;
  myPlayerId: string;
  myCards: string[];
  endgameTeam: number | null;
  players: Player[];
  claims: Claim[];
  logs: LogEntry[];
}

// ─── Card Helpers ───────────────────────────────────────
const SUIT_SYMBOLS: Record<string, string> = { H: '\u2665', D: '\u2666', C: '\u2663', S: '\u2660' };
const SUIT_NAMES: Record<string, string> = { H: 'Hearts', D: 'Diamonds', C: 'Clubs', S: 'Spades' };
const LOW_RANKS = ['2', '3', '4', '5', '6', '7'];
const HIGH_RANKS = ['9', '10', 'J', 'Q', 'K', 'A'];

function cardSuit(card: string) { return card.slice(-1); }
function cardRank(card: string) { return card.slice(0, -1); }
function isRed(card: string) { const s = cardSuit(card); return s === 'H' || s === 'D'; }

function getHalfSuit(card: string): string {
  const s = cardSuit(card);
  const r = cardRank(card);
  return `${LOW_RANKS.includes(r) ? 'low' : 'high'}_${s}`;
}

function getHalfSuitCards(hs: string): string[] {
  const [type, suit] = hs.split('_');
  const ranks = type === 'low' ? LOW_RANKS : HIGH_RANKS;
  return ranks.map(r => `${r}${suit}`);
}

function halfSuitName(hs: string): string {
  const [type, suit] = hs.split('_');
  return `${type === 'low' ? 'Low' : 'High'} ${SUIT_NAMES[suit]} ${SUIT_SYMBOLS[suit]}`;
}

function allHalfSuits(): string[] {
  const result: string[] = [];
  for (const s of ['H', 'D', 'C', 'S']) {
    result.push(`low_${s}`, `high_${s}`);
  }
  return result;
}

function sortCards(cards: string[]): string[] {
  const so: Record<string, number> = { H: 0, D: 1, C: 2, S: 3 };
  const ro: Record<string, number> = { '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '9': 9, '10': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14 };
  return [...cards].sort((a, b) => {
    const sa = cardSuit(a), sb = cardSuit(b);
    if (so[sa] !== so[sb]) return so[sa] - so[sb];
    return ro[cardRank(a)] - ro[cardRank(b)];
  });
}

// ─── Components ─────────────────────────────────────────

function CardView({ card, onClick, selected, small }: {
  card: string; onClick?: () => void; selected?: boolean; small?: boolean;
}) {
  const r = cardRank(card);
  const s = cardSuit(card);
  const red = isRed(card);
  const cardRef = useRef<HTMLDivElement>(null);

  return (
    <div
      ref={cardRef}
      onClick={onClick}
      className={`${small ? 'w-10 h-14 text-xs' : 'w-14 h-20 text-sm'} playing-card flex flex-col items-center justify-center
        ${red ? 'text-red-600' : 'text-gray-900'}
        ${selected ? 'selected !border-amber-400 ring-2 ring-amber-300' : ''}
        ${onClick ? 'cursor-pointer' : ''}`}
    >
      <span className="font-bold leading-none">{r}</span>
      <span className={`${small ? 'text-base' : 'text-lg'} leading-none`}>{SUIT_SYMBOLS[s]}</span>
    </div>
  );
}

function TablePlayerBadge({ player, isCurrentTurn, isMe, myTeam }: {
  player: Player; isCurrentTurn: boolean; isMe: boolean; myTeam: number;
}) {
  const sameTeam = player.team === myTeam;
  const teamColor = player.team === 1 ? 'blue' : 'red';
  const badgeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isCurrentTurn && badgeRef.current) {
      gsap.fromTo(badgeRef.current,
        { scale: 1 },
        { scale: 1.12, duration: 0.3, ease: 'back.out(2)', yoyo: true, repeat: 1 }
      );
    }
  }, [isCurrentTurn]);

  return (
    <div ref={badgeRef} className={`flex flex-col items-center gap-0.5 transition-all ${isCurrentTurn ? 'scale-110' : ''}`}>
      <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold border-2 transition-all
        ${sameTeam ? 'bg-emerald-800/80 border-emerald-500' : 'bg-rose-900/80 border-rose-500'}
        ${isCurrentTurn ? 'active-turn-glow !border-amber-400' : ''}
        ${isMe ? '!border-emerald-300 ring-2 ring-emerald-400/50' : ''}`}
      >
        {(isMe ? 'You' : player.name).charAt(0).toUpperCase()}
      </div>
      <div className={`text-[11px] font-semibold truncate max-w-[72px] text-center leading-tight
        ${isCurrentTurn ? 'text-amber-300' : sameTeam ? 'text-emerald-300' : 'text-rose-300'}`}
      >
        {isMe ? 'You' : player.name}
      </div>
      <div className="flex items-center gap-1">
        <span className="text-[10px] text-gray-400">{player.cardCount}</span>
        <span className={`text-[9px] px-1.5 py-px rounded-full
          ${teamColor === 'blue' ? 'bg-blue-900/60 text-blue-300' : 'bg-red-900/60 text-red-300'}`}
        >
          T{player.team}
        </span>
      </div>
    </div>
  );
}

function GameTable({ game, myTeam }: { game: GameState; myTeam: number }) {
  const meIdx = game.players.findIndex(p => p.id === game.myPlayerId);
  const count = game.players.length;
  const arranged: Player[] = [];
  for (let i = 0; i < count; i++) {
    arranged.push(game.players[(meIdx + i) % count]);
  }
  const tableRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (tableRef.current) {
      const players = tableRef.current.querySelectorAll('.table-player');
      gsap.fromTo(players,
        { opacity: 0, scale: 0 },
        { opacity: 1, scale: 1, duration: 0.4, stagger: 0.06, ease: 'back.out(2)' }
      );
    }
  }, []);

  return (
    <div ref={tableRef} className={`game-table table-${count}p`}>
      <div className="table-felt">
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <div className="text-emerald-600/50 text-xs font-mono tracking-wider">#{game.code}</div>
          <div className="flex gap-3 mt-1.5 text-xs">
            <span className="score-badge text-blue-300">T1: {game.team1Score}</span>
            <span className="score-badge text-red-300">T2: {game.team2Score}</span>
          </div>
        </div>
      </div>
      {arranged.map((player, i) => (
        <div key={player.id} className={`table-player pos-${i}`}>
          <TablePlayerBadge
            player={player}
            isCurrentTurn={player.id === game.currentTurnPlayerId}
            isMe={player.id === game.myPlayerId}
            myTeam={myTeam}
          />
        </div>
      ))}
    </div>
  );
}

// ─── Ask Dialog ─────────────────────────────────────────

function AskDialog({ game, onClose, onAsk }: {
  game: GameState; onClose: () => void;
  onAsk: (targetId: string, card: string) => void;
}) {
  const [targetId, setTargetId] = useState('');
  const [selectedCard, setSelectedCard] = useState('');
  const overlayRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  const me = game.players.find(p => p.id === game.myPlayerId)!;
  const opponents = game.players.filter(p => p.team !== me.team && p.cardCount > 0);

  const myHalfSuits = new Set(game.myCards.map(getHalfSuit));
  const validCards = sortCards(
    Array.from(myHalfSuits).flatMap(hs =>
      getHalfSuitCards(hs).filter(c => !game.myCards.includes(c))
    )
  );

  const grouped: Record<string, string[]> = {};
  for (const c of validCards) {
    const hs = getHalfSuit(c);
    if (!grouped[hs]) grouped[hs] = [];
    grouped[hs].push(c);
  }

  useEffect(() => {
    gsap.fromTo(overlayRef.current, { opacity: 0 }, { opacity: 1, duration: 0.2 });
    gsap.fromTo(dialogRef.current,
      { scale: 0.9, opacity: 0, y: 30 },
      { scale: 1, opacity: 1, y: 0, duration: 0.35, ease: 'back.out(1.7)' }
    );
  }, []);

  function handleClose() {
    const tl = gsap.timeline({ onComplete: onClose });
    tl.to(dialogRef.current, { scale: 0.9, opacity: 0, y: 20, duration: 0.2, ease: 'power2.in' });
    tl.to(overlayRef.current, { opacity: 0, duration: 0.15 }, '-=0.1');
  }

  return (
    <div ref={overlayRef} className="fixed inset-0 bg-black/60 dialog-backdrop flex items-center justify-center z-50 p-4" onClick={handleClose}>
      <div ref={dialogRef} className="glass-panel rounded-2xl p-6 max-w-lg w-full max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <h3 className="text-xl font-bold text-amber-300 mb-4">Ask for a Card</h3>

        <div className="mb-4">
          <label className="block text-sm text-emerald-300/80 mb-2 font-medium">Ask which opponent?</label>
          <div className="flex gap-2 flex-wrap">
            {opponents.map(p => (
              <button
                key={p.id}
                onClick={() => setTargetId(p.id)}
                className={`px-4 py-2 rounded-xl text-sm font-medium transition-all
                  ${targetId === p.id
                    ? 'bg-amber-600 text-white shadow-lg shadow-amber-600/25 scale-105'
                    : 'bg-black/25 text-emerald-300 hover:bg-black/40 border border-emerald-700/30'}`}
              >
                {p.name} ({p.cardCount})
              </button>
            ))}
          </div>
        </div>

        <div className="mb-6">
          <label className="block text-sm text-emerald-300/80 mb-2 font-medium">Which card?</label>
          {Object.entries(grouped).map(([hs, cards]) => (
            <div key={hs} className="mb-3">
              <div className="text-xs text-emerald-500/70 mb-1 font-medium">{halfSuitName(hs)}</div>
              <div className="flex gap-2 flex-wrap">
                {cards.map(c => (
                  <CardView key={c} card={c} small selected={selectedCard === c} onClick={() => setSelectedCard(c)} />
                ))}
              </div>
            </div>
          ))}
          {validCards.length === 0 && (
            <p className="text-emerald-500/70 text-sm">No valid cards to ask for.</p>
          )}
        </div>

        <div className="flex gap-3">
          <button onClick={handleClose} className="flex-1 py-2.5 bg-black/25 hover:bg-black/40 rounded-xl text-emerald-300 transition-all border border-emerald-700/30">
            Cancel
          </button>
          <button
            onClick={() => targetId && selectedCard && onAsk(targetId, selectedCard)}
            disabled={!targetId || !selectedCard}
            className="flex-1 py-2.5 bg-amber-600 hover:bg-amber-500 disabled:bg-gray-700/50 disabled:text-gray-500 rounded-xl text-white font-semibold transition-all btn-glow"
          >
            Ask
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Claim Dialog ───────────────────────────────────────

function ClaimDialog({ game, onClose, onClaim }: {
  game: GameState; onClose: () => void;
  onClaim: (halfSuit: string, assignments: Record<string, string>) => void;
}) {
  const [selectedHs, setSelectedHs] = useState('');
  const [assignments, setAssignments] = useState<Record<string, string>>({});
  const overlayRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  const me = game.players.find(p => p.id === game.myPlayerId)!;
  const teammates = game.players.filter(p => p.team === me.team);
  const claimedHs = new Set(game.claims.map(c => c.half_suit));
  const unclaimedHs = allHalfSuits().filter(hs => !claimedHs.has(hs));

  function selectHalfSuit(hs: string) {
    setSelectedHs(hs);
    const cards = getHalfSuitCards(hs);
    const pre: Record<string, string> = {};
    for (const c of cards) {
      if (game.myCards.includes(c)) {
        pre[c] = game.myPlayerId;
      }
    }
    setAssignments(pre);
  }

  const hsCards = selectedHs ? getHalfSuitCards(selectedHs) : [];
  const allAssigned = hsCards.length > 0 && hsCards.every(c => assignments[c]);

  useEffect(() => {
    gsap.fromTo(overlayRef.current, { opacity: 0 }, { opacity: 1, duration: 0.2 });
    gsap.fromTo(dialogRef.current,
      { scale: 0.9, opacity: 0, y: 30 },
      { scale: 1, opacity: 1, y: 0, duration: 0.35, ease: 'back.out(1.7)' }
    );
  }, []);

  function handleClose() {
    const tl = gsap.timeline({ onComplete: onClose });
    tl.to(dialogRef.current, { scale: 0.9, opacity: 0, y: 20, duration: 0.2, ease: 'power2.in' });
    tl.to(overlayRef.current, { opacity: 0, duration: 0.15 }, '-=0.1');
  }

  return (
    <div ref={overlayRef} className="fixed inset-0 bg-black/60 dialog-backdrop flex items-center justify-center z-50 p-4" onClick={handleClose}>
      <div ref={dialogRef} className="glass-panel rounded-2xl p-6 max-w-lg w-full max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <h3 className="text-xl font-bold text-amber-300 mb-4">Claim a Half-Suit</h3>

        <div className="mb-4">
          <label className="block text-sm text-emerald-300/80 mb-2 font-medium">Select half-suit to claim</label>
          <div className="grid grid-cols-2 gap-2">
            {unclaimedHs.map(hs => {
              const [, suit] = hs.split('_');
              const suitIsRed = suit === 'H' || suit === 'D';
              return (
                <button
                  key={hs}
                  onClick={() => selectHalfSuit(hs)}
                  className={`px-3 py-2.5 rounded-xl text-sm font-medium transition-all
                    ${selectedHs === hs
                      ? 'bg-amber-600 text-white shadow-lg shadow-amber-600/25'
                      : 'bg-black/25 hover:bg-black/40 border border-emerald-700/30'}
                    ${suitIsRed ? 'text-red-300' : 'text-gray-300'}`}
                >
                  {halfSuitName(hs)}
                </button>
              );
            })}
          </div>
        </div>

        {selectedHs && (
          <div className="mb-6">
            <label className="block text-sm text-emerald-300/80 mb-2 font-medium">
              Assign each card to a teammate
            </label>
            <div className="space-y-2">
              {hsCards.map(card => (
                <div key={card} className="flex items-center gap-3">
                  <CardView card={card} small />
                  <select
                    value={assignments[card] || ''}
                    onChange={e => setAssignments({ ...assignments, [card]: e.target.value })}
                    className="flex-1 px-3 py-2 bg-black/30 border border-emerald-600/40 rounded-xl text-white text-sm focus:outline-none focus:border-amber-400/60 transition-all"
                  >
                    <option value="">-- Select player --</option>
                    {teammates.map(p => (
                      <option key={p.id} value={p.id}>
                        {p.id === game.myPlayerId ? `${p.name} (You)` : p.name}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex gap-3">
          <button onClick={handleClose} className="flex-1 py-2.5 bg-black/25 hover:bg-black/40 rounded-xl text-emerald-300 transition-all border border-emerald-700/30">
            Cancel
          </button>
          <button
            onClick={() => selectedHs && allAssigned && onClaim(selectedHs, assignments)}
            disabled={!allAssigned}
            className="flex-1 py-2.5 bg-amber-600 hover:bg-amber-500 disabled:bg-gray-700/50 disabled:text-gray-500 rounded-xl text-white font-semibold transition-all btn-glow"
          >
            Claim
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Game Page ─────────────────────────────────────

export default function GamePage() {
  const params = useParams();
  const router = useRouter();
  const gameId = params.gameId as string;

  const [game, setGame] = useState<GameState | null>(null);
  const [error, setError] = useState('');
  const [showAsk, setShowAsk] = useState(false);
  const [showClaim, setShowClaim] = useState(false);
  const [actionMsg, setActionMsg] = useState('');
  const [loading, setLoading] = useState(true);
  const [needsName, setNeedsName] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [nameLoading, setNameLoading] = useState(false);
  const prevUpdatedAt = useRef('');
  const cardsRef = useRef<HTMLDivElement>(null);
  const actionBtnsRef = useRef<HTMLDivElement>(null);
  const prevCardCount = useRef(0);

  const fetchGame = useCallback(async () => {
    try {
      const res = await fetch(`/api/games/${gameId}`);
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || 'Failed to load game');
        return;
      }
      const data: GameState = await res.json();
      if (data.updatedAt !== prevUpdatedAt.current) {
        setGame(data);
        prevUpdatedAt.current = data.updatedAt;
      }
    } catch {
      setError('Connection error');
    } finally {
      setLoading(false);
    }
  }, [gameId]);

  useEffect(() => {
    fetch('/api/auth')
      .then(r => r.json())
      .then(data => {
        if (!data.name) {
          setNeedsName(true);
          setLoading(false);
        } else {
          fetchGame();
        }
      })
      .catch(() => {
        setLoading(false);
      });
  }, [fetchGame]);

  useEffect(() => {
    if (needsName) return;
    const interval = setInterval(fetchGame, 1500);
    return () => clearInterval(interval);
  }, [fetchGame, needsName]);

  // Animate cards when they change
  useEffect(() => {
    if (game && cardsRef.current && game.myCards.length !== prevCardCount.current) {
      const cards = cardsRef.current.querySelectorAll('.playing-card');
      if (cards.length > 0) {
        gsap.fromTo(cards,
          { y: 30, opacity: 0, rotationY: 90 },
          { y: 0, opacity: 1, rotationY: 0, duration: 0.4, stagger: 0.04, ease: 'back.out(1.5)' }
        );
      }
      prevCardCount.current = game.myCards.length;
    }
  }, [game?.myCards.length, game]);

  // Animate action buttons
  useEffect(() => {
    if (actionBtnsRef.current) {
      gsap.fromTo(actionBtnsRef.current.children,
        { y: 15, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.35, stagger: 0.1, ease: 'power2.out' }
      );
    }
  }, [game?.currentTurnPlayerId]);

  async function handleSetName() {
    if (!nameInput.trim()) return;
    setNameLoading(true);
    setError('');
    const res = await fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: nameInput.trim() }),
    });
    if (res.ok) {
      setNeedsName(false);
      setNameLoading(false);
      prevUpdatedAt.current = '';
      fetchGame();
    } else {
      const data = await res.json();
      setError(data.error || 'Failed to set name');
      setNameLoading(false);
    }
  }

  async function handleJoin() {
    const res = await fetch(`/api/games/${gameId}/join`, { method: 'POST' });
    if (res.ok) {
      prevUpdatedAt.current = '';
      fetchGame();
    } else {
      const data = await res.json();
      setError(data.error);
    }
  }

  async function handleStart() {
    const res = await fetch(`/api/games/${gameId}/start`, { method: 'POST' });
    if (!res.ok) {
      const data = await res.json();
      setError(data.error);
    } else {
      prevUpdatedAt.current = '';
      fetchGame();
    }
  }

  async function handleAsk(targetId: string, card: string) {
    setShowAsk(false);
    const res = await fetch(`/api/games/${gameId}/ask`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetPlayerId: targetId, card }),
    });
    const data = await res.json();
    if (res.ok) {
      setActionMsg(data.gotCard ? 'Got the card!' : 'They don\'t have it. Turn passed.');
      setTimeout(() => setActionMsg(''), 3000);
      prevUpdatedAt.current = '';
      fetchGame();
    } else {
      setError(data.error);
    }
  }

  async function handleClaim(halfSuit: string, assignments: Record<string, string>) {
    setShowClaim(false);
    const res = await fetch(`/api/games/${gameId}/claim`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ halfSuit, assignments }),
    });
    const data = await res.json();
    if (res.ok) {
      const msgs: Record<string, string> = {
        correct: 'Correct! Your team wins the set!',
        opponent_wins: 'Wrong! An opponent had a card. They win the set.',
        forfeited: 'Wrong distribution. Set forfeited!',
      };
      setActionMsg(msgs[data.result] || 'Claimed.');
      setTimeout(() => setActionMsg(''), 4000);
      prevUpdatedAt.current = '';
      fetchGame();
    } else {
      setError(data.error);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-emerald-200 text-xl animate-pulse">Loading game...</div>
      </div>
    );
  }

  if (needsName) {
    return <NamePrompt error={error} nameInput={nameInput} setNameInput={setNameInput} nameLoading={nameLoading} onSubmit={handleSetName} />;
  }

  if (error && !game) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="glass-panel rounded-2xl p-8 max-w-md w-full text-center">
          <div className="text-red-400 text-lg mb-4">{error}</div>
          <button onClick={() => router.push('/')} className="px-6 py-2 bg-emerald-700/70 hover:bg-emerald-600/80 rounded-xl transition-all">
            Back to Home
          </button>
        </div>
      </div>
    );
  }

  if (!game) return null;

  if (game.status === 'waiting') {
    return <LobbyView game={game} onJoin={handleJoin} onStart={handleStart} error={error} />;
  }

  // ─── Playing / Finished ──────────────────────────
  const me = game.players.find(p => p.id === game.myPlayerId);
  const myTeam = me?.team || 0;
  const isMyTurn = game.currentTurnPlayerId === game.myPlayerId;
  const sorted = sortCards(game.myCards);
  const canAsk = isMyTurn && game.myCards.length > 0 && game.status === 'playing' && !game.endgameTeam;
  const canClaim = isMyTurn && game.status === 'playing';

  const turnPlayer = game.players.find(p => p.id === game.currentTurnPlayerId);

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="bg-black/40 backdrop-blur-sm px-4 py-2.5 flex items-center justify-between flex-wrap gap-2 border-b border-white/5">
        <div className="flex items-center gap-4">
          <h1 className="text-amber-300 font-bold text-lg tracking-tight">Literature</h1>
          <span className="text-emerald-500/60 text-xs font-mono bg-black/20 px-2 py-0.5 rounded-md">#{game.code}</span>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <span className="score-badge text-blue-300">Team 1: {game.team1Score}</span>
          <span className="score-badge text-red-300">Team 2: {game.team2Score}</span>
        </div>
      </header>

      {/* Game finished banner */}
      {game.status === 'finished' && <GameFinishedBanner game={game} router={router} />}

      {/* Turn indicator */}
      {game.status === 'playing' && (
        <div className={`px-4 py-2.5 text-center text-sm font-medium transition-all ${isMyTurn ? 'bg-amber-600/20 text-amber-300 border-b border-amber-600/20' : 'bg-black/20 text-emerald-400/80 border-b border-white/5'}`}>
          {isMyTurn ? "It's your turn!" : `Waiting for ${turnPlayer?.name || '...'}...`}
          {game.endgameTeam && (
            <span className="ml-2 text-rose-300/80 text-xs">(Claim-only mode - Team {game.endgameTeam === myTeam ? 'opponent' : 'your'} is out of cards)</span>
          )}
        </div>
      )}

      {/* Action message */}
      <ActionMessage message={actionMsg} />

      {/* Error */}
      {error && (
        <div className="bg-red-900/40 px-4 py-2 text-center text-red-300 text-sm cursor-pointer border-b border-red-800/30" onClick={() => setError('')}>
          {error} (click to dismiss)
        </div>
      )}

      <div className="flex-1 flex flex-col lg:flex-row gap-2 p-2 lg:p-4 overflow-hidden">
        {/* Main game area */}
        <div className="flex-1 flex flex-col gap-3 min-w-0">
          <GameTable game={game} myTeam={myTeam} />

          {/* My cards */}
          <div className="bg-black/20 rounded-xl p-3 flex-shrink-0 border border-white/5">
            <div className="text-xs text-emerald-400/80 mb-2 font-semibold tracking-wide">Your Cards ({sorted.length})</div>
            <div ref={cardsRef} className="flex gap-1.5 flex-wrap justify-center">
              {sorted.length > 0 ? (
                sorted.map(c => <CardView key={c} card={c} />)
              ) : (
                <div className="text-emerald-600/60 text-sm py-4">No cards in hand</div>
              )}
            </div>
          </div>

          {/* Action buttons */}
          {game.status === 'playing' && isMyTurn && (
            <div ref={actionBtnsRef} className="flex gap-3 justify-center">
              <button
                onClick={() => setShowAsk(true)}
                disabled={!canAsk}
                className="px-6 py-3 bg-amber-600 hover:bg-amber-500 disabled:bg-gray-700/50 disabled:text-gray-500 rounded-xl font-semibold text-lg transition-all btn-glow hover:shadow-lg hover:shadow-amber-600/25 active:scale-[0.97]"
              >
                Ask for a Card
              </button>
              <button
                onClick={() => setShowClaim(true)}
                disabled={!canClaim}
                className="px-6 py-3 bg-emerald-700/70 hover:bg-emerald-600/80 disabled:bg-gray-700/50 disabled:text-gray-500 rounded-xl font-semibold text-lg transition-all hover:shadow-lg hover:shadow-emerald-600/15 active:scale-[0.97]"
              >
                Claim a Set
              </button>
            </div>
          )}
        </div>

        {/* Sidebar: Claimed sets + Log */}
        <div className="lg:w-80 flex flex-col gap-2 flex-shrink-0">
          {/* Claimed sets */}
          <div className="bg-black/20 rounded-xl p-3 border border-white/5">
            <div className="text-xs text-amber-400/80 mb-2 font-semibold tracking-wide">Claimed Sets ({game.claims.length}/8)</div>
            <div className="space-y-1">
              {game.claims.length === 0 && <div className="text-emerald-700/60 text-sm">No sets claimed yet</div>}
              {game.claims.map(c => (
                <div key={c.half_suit} className="flex items-center justify-between text-sm px-2.5 py-1.5 rounded-lg bg-black/20 border border-white/5">
                  <span className={c.half_suit.split('_')[1] === 'H' || c.half_suit.split('_')[1] === 'D' ? 'text-red-300' : 'text-gray-300'}>
                    {halfSuitName(c.half_suit)}
                  </span>
                  <span className={c.claimed_by_team === 1 ? 'text-blue-300' : c.claimed_by_team === 2 ? 'text-red-300' : 'text-gray-500'}>
                    {c.claimed_by_team ? `Team ${c.claimed_by_team}` : 'Forfeited'}
                  </span>
                </div>
              ))}
              {allHalfSuits()
                .filter(hs => !game.claims.find(c => c.half_suit === hs))
                .map(hs => (
                  <div key={hs} className="flex items-center justify-between text-sm px-2.5 py-1.5 rounded-lg opacity-30">
                    <span className={hs.split('_')[1] === 'H' || hs.split('_')[1] === 'D' ? 'text-red-300' : 'text-gray-300'}>
                      {halfSuitName(hs)}
                    </span>
                    <span className="text-gray-600 text-xs">unclaimed</span>
                  </div>
                ))}
            </div>
          </div>

          {/* Game log */}
          {game.showLog && (
            <div className="bg-black/20 rounded-xl p-3 flex-1 min-h-0 overflow-hidden flex flex-col border border-white/5">
              <div className="text-xs text-emerald-500/70 mb-2 font-semibold tracking-wide">Game Log</div>
              <div className="overflow-y-auto flex-1 space-y-1 text-xs game-log">
                {game.logs.map((log, i) => (
                  <div key={i} className="text-emerald-400/60 py-1 border-b border-emerald-900/30">
                    {log.details?.message || log.action}
                  </div>
                ))}
                {game.logs.length === 0 && <div className="text-emerald-700/50">No actions yet</div>}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Dialogs */}
      {showAsk && <AskDialog game={game} onClose={() => setShowAsk(false)} onAsk={handleAsk} />}
      {showClaim && <ClaimDialog game={game} onClose={() => setShowClaim(false)} onClaim={handleClaim} />}
    </div>
  );
}

// ─── Sub Components ─────────────────────────────────────

function ActionMessage({ message }: { message: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (message && ref.current) {
      gsap.fromTo(ref.current,
        { y: -20, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.35, ease: 'power2.out' }
      );
    }
  }, [message]);

  if (!message) return null;

  return (
    <div ref={ref} className="bg-amber-900/30 border-b border-amber-700/30 px-4 py-2.5 text-center text-amber-200 text-sm font-medium">
      {message}
    </div>
  );
}

function GameFinishedBanner({ game, router }: { game: GameState; router: ReturnType<typeof useRouter> }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (ref.current) {
      const tl = gsap.timeline();
      tl.fromTo(ref.current,
        { scaleY: 0, opacity: 0 },
        { scaleY: 1, opacity: 1, duration: 0.5, ease: 'back.out(1.7)' }
      );
      const text = ref.current.querySelector('.winner-text');
      if (text) {
        tl.fromTo(text,
          { scale: 0.5, opacity: 0 },
          { scale: 1, opacity: 1, duration: 0.5, ease: 'elastic.out(1, 0.5)' },
          '-=0.2'
        );
      }
    }
  }, []);

  return (
    <div ref={ref} className="bg-gradient-to-r from-amber-600/20 via-amber-600/30 to-amber-600/20 border-b border-amber-600/30 px-4 py-4 text-center origin-top">
      <div className="winner-text text-2xl font-bold text-amber-300">
        {game.winner === 0
          ? "It's a Tie!"
          : `Team ${game.winner} Wins!`}
      </div>
      <div className="text-emerald-300/80 text-sm mt-1">
        Final Score: Team 1 ({game.team1Score}) - Team 2 ({game.team2Score})
      </div>
      <button
        onClick={() => router.push('/')}
        className="mt-3 px-5 py-1.5 bg-emerald-700/70 hover:bg-emerald-600/80 rounded-xl text-sm transition-all"
      >
        Back to Home
      </button>
    </div>
  );
}

function NamePrompt({ error, nameInput, setNameInput, nameLoading, onSubmit }: {
  error: string; nameInput: string; setNameInput: (v: string) => void; nameLoading: boolean; onSubmit: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (panelRef.current) {
      gsap.fromTo(panelRef.current,
        { y: 30, opacity: 0, scale: 0.95 },
        { y: 0, opacity: 1, scale: 1, duration: 0.5, ease: 'back.out(1.4)' }
      );
    }
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div ref={panelRef} className="glass-panel rounded-2xl p-8 max-w-md w-full" style={{ opacity: 0 }}>
        <h1 className="text-3xl font-bold text-center mb-2 title-shimmer">Literature</h1>
        <p className="text-center text-emerald-300/70 mb-6 text-sm">Enter your name to join the game</p>
        {error && (
          <div className="bg-red-900/40 border border-red-500/50 text-red-200 px-4 py-2 rounded-lg mb-4 text-sm">
            {error}
          </div>
        )}
        <div className="space-y-4">
          <input
            type="text"
            value={nameInput}
            onChange={e => setNameInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && onSubmit()}
            placeholder="Your name"
            maxLength={20}
            autoFocus
            className="w-full px-4 py-3 bg-black/30 border border-emerald-600/40 rounded-xl text-white placeholder-emerald-700 focus:outline-none focus:border-amber-400/60 focus:ring-1 focus:ring-amber-400/30 transition-all"
          />
          <button
            onClick={onSubmit}
            disabled={!nameInput.trim() || nameLoading}
            className="w-full py-3 bg-amber-600 hover:bg-amber-500 disabled:bg-gray-700/50 disabled:text-gray-500 text-white font-semibold rounded-xl transition-all btn-glow"
          >
            {nameLoading ? 'Setting name...' : 'Continue'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Lobby View ─────────────────────────────────────────

function LobbyView({ game, onJoin, onStart, error }: {
  game: GameState; onJoin: () => void; onStart: () => void; error: string;
}) {
  const isHost = game.createdBy === game.myPlayerId;
  const isInGame = game.isPlayer;
  const team1 = game.players.filter(p => p.team === 1);
  const team2 = game.players.filter(p => p.team === 2);
  const perTeam = game.maxPlayers / 2;
  const panelRef = useRef<HTMLDivElement>(null);
  const slotsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (panelRef.current) {
      gsap.fromTo(panelRef.current,
        { y: 40, opacity: 0, scale: 0.95 },
        { y: 0, opacity: 1, scale: 1, duration: 0.6, ease: 'back.out(1.4)' }
      );
    }
  }, []);

  useEffect(() => {
    if (slotsRef.current) {
      const slots = slotsRef.current.querySelectorAll('.lobby-slot');
      gsap.fromTo(slots,
        { x: -15, opacity: 0 },
        { x: 0, opacity: 1, duration: 0.3, stagger: 0.05, ease: 'power2.out' }
      );
    }
  }, [game.players.length]);

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div ref={panelRef} className="glass-panel rounded-2xl p-8 max-w-lg w-full" style={{ opacity: 0 }}>
        <h1 className="text-3xl font-bold title-shimmer text-center mb-2">Game Lobby</h1>
        <p className="text-center text-emerald-500/60 text-xs mb-4 tracking-wide">{game.maxPlayers}-player game</p>

        <div className="text-center mb-6">
          <div className="text-emerald-400/70 text-sm mb-1.5">Share this code with friends:</div>
          <div className="text-4xl font-mono font-bold text-white tracking-[0.3em] bg-black/30 rounded-xl py-3 select-all border border-white/5">
            {game.code}
          </div>
        </div>

        {error && (
          <div className="bg-red-900/40 border border-red-500/50 text-red-200 px-4 py-2 rounded-lg mb-4 text-sm">
            {error}
          </div>
        )}

        <div ref={slotsRef} className="grid grid-cols-2 gap-4 mb-6">
          <div>
            <h3 className="text-blue-300 font-semibold text-sm mb-2">Team 1</h3>
            <div className="space-y-1.5">
              {team1.map(p => (
                <div key={p.id} className="lobby-slot bg-blue-900/25 px-3 py-2.5 rounded-xl text-sm flex items-center gap-2 border border-blue-500/10">
                  <span className="text-white">{p.name}</span>
                  {p.id === game.createdBy && <span className="text-amber-400 text-xs">(Host)</span>}
                  {p.id === game.myPlayerId && <span className="text-emerald-400 text-xs">(You)</span>}
                </div>
              ))}
              {Array.from({ length: perTeam - team1.length }).map((_, i) => (
                <div key={i} className="lobby-slot border border-dashed border-blue-800/30 px-3 py-2.5 rounded-xl text-sm text-blue-800/50 animate-pulse">
                  Waiting...
                </div>
              ))}
            </div>
          </div>
          <div>
            <h3 className="text-red-300 font-semibold text-sm mb-2">Team 2</h3>
            <div className="space-y-1.5">
              {team2.map(p => (
                <div key={p.id} className="lobby-slot bg-red-900/25 px-3 py-2.5 rounded-xl text-sm flex items-center gap-2 border border-red-500/10">
                  <span className="text-white">{p.name}</span>
                  {p.id === game.myPlayerId && <span className="text-emerald-400 text-xs">(You)</span>}
                </div>
              ))}
              {Array.from({ length: perTeam - team2.length }).map((_, i) => (
                <div key={i} className="lobby-slot border border-dashed border-red-800/30 px-3 py-2.5 rounded-xl text-sm text-red-800/50 animate-pulse">
                  Waiting...
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="text-center text-emerald-500/60 text-sm mb-4">
          {game.players.length}/{game.maxPlayers} players joined
        </div>

        {!isInGame && game.players.length < game.maxPlayers && (
          <button
            onClick={onJoin}
            className="w-full py-3 bg-emerald-700/70 hover:bg-emerald-600/80 rounded-xl font-semibold text-lg mb-3 transition-all hover:shadow-lg hover:shadow-emerald-600/15 active:scale-[0.98]"
          >
            Join Game
          </button>
        )}

        {isHost && (
          <button
            onClick={onStart}
            disabled={game.players.length !== game.maxPlayers}
            className="w-full py-3 bg-amber-600 hover:bg-amber-500 disabled:bg-gray-700/50 disabled:text-gray-500 rounded-xl font-semibold text-lg transition-all btn-glow hover:shadow-lg hover:shadow-amber-600/25 active:scale-[0.98]"
          >
            {game.players.length === game.maxPlayers ? 'Start Game' : `Waiting for ${game.maxPlayers - game.players.length} more player(s)`}
          </button>
        )}

        {isInGame && !isHost && (
          <div className="text-center text-emerald-500/60 text-sm animate-pulse">
            Waiting for the host to start the game...
          </div>
        )}
      </div>
    </div>
  );
}
