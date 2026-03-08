'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';

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
  return (
    <div
      onClick={onClick}
      className={`${small ? 'w-10 h-14 text-xs' : 'w-14 h-20 text-sm'} bg-white rounded-lg border-2 flex flex-col items-center justify-center
        ${red ? 'text-red-600' : 'text-gray-900'}
        ${selected ? 'border-amber-400 ring-2 ring-amber-300 -translate-y-2' : 'border-gray-300'}
        ${onClick ? 'cursor-pointer hover:border-amber-400 hover:-translate-y-1' : ''}
        transition-all card-shadow select-none`}
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
  return (
    <div className={`flex flex-col items-center gap-0.5 transition-all ${isCurrentTurn ? 'scale-110' : ''}`}>
      {/* Avatar */}
      <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold border-2 transition-all
        ${sameTeam ? 'bg-emerald-800 border-emerald-500' : 'bg-rose-900 border-rose-500'}
        ${isCurrentTurn ? 'active-turn-glow border-amber-400' : ''}
        ${isMe ? 'border-emerald-300 ring-2 ring-emerald-400/50' : ''}`}
      >
        {(isMe ? 'You' : player.name).charAt(0).toUpperCase()}
      </div>
      {/* Name */}
      <div className={`text-[11px] font-semibold truncate max-w-[72px] text-center leading-tight
        ${isCurrentTurn ? 'text-amber-300' : sameTeam ? 'text-emerald-300' : 'text-rose-300'}`}
      >
        {isMe ? 'You' : player.name}
      </div>
      {/* Card count + Team */}
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
  // Arrange players around the table: "me" at bottom, others distributed clockwise
  const meIdx = game.players.findIndex(p => p.id === game.myPlayerId);
  const count = game.players.length;
  const arranged: Player[] = [];
  for (let i = 0; i < count; i++) {
    arranged.push(game.players[(meIdx + i) % count]);
  }

  return (
    <div className={`game-table ${count === 4 ? 'table-4p' : ''}`}>
      <div className="table-felt">
        {/* Center info */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <div className="text-emerald-600/60 text-xs font-mono">#{game.code}</div>
          <div className="flex gap-3 mt-1 text-xs">
            <span className="text-blue-400/70">T1: {game.team1Score}</span>
            <span className="text-red-400/70">T2: {game.team2Score}</span>
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

  const me = game.players.find(p => p.id === game.myPlayerId)!;
  const opponents = game.players.filter(p => p.team !== me.team && p.cardCount > 0);

  // Get valid cards to ask for: cards NOT in my hand but in half-suits where I have cards
  const myHalfSuits = new Set(game.myCards.map(getHalfSuit));
  const validCards = sortCards(
    Array.from(myHalfSuits).flatMap(hs =>
      getHalfSuitCards(hs).filter(c => !game.myCards.includes(c))
    )
  );

  // Group valid cards by half-suit
  const grouped: Record<string, string[]> = {};
  for (const c of validCards) {
    const hs = getHalfSuit(c);
    if (!grouped[hs]) grouped[hs] = [];
    grouped[hs].push(c);
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-emerald-900 rounded-2xl p-6 max-w-lg w-full border border-emerald-600 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <h3 className="text-xl font-bold text-amber-300 mb-4">Ask for a Card</h3>

        <div className="mb-4">
          <label className="block text-sm text-emerald-300 mb-2">Ask which opponent?</label>
          <div className="flex gap-2 flex-wrap">
            {opponents.map(p => (
              <button
                key={p.id}
                onClick={() => setTargetId(p.id)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors
                  ${targetId === p.id
                    ? 'bg-amber-600 text-white'
                    : 'bg-emerald-800 text-emerald-300 hover:bg-emerald-700'}`}
              >
                {p.name} ({p.cardCount})
              </button>
            ))}
          </div>
        </div>

        <div className="mb-6">
          <label className="block text-sm text-emerald-300 mb-2">Which card?</label>
          {Object.entries(grouped).map(([hs, cards]) => (
            <div key={hs} className="mb-3">
              <div className="text-xs text-emerald-500 mb-1">{halfSuitName(hs)}</div>
              <div className="flex gap-2 flex-wrap">
                {cards.map(c => (
                  <CardView key={c} card={c} small selected={selectedCard === c} onClick={() => setSelectedCard(c)} />
                ))}
              </div>
            </div>
          ))}
          {validCards.length === 0 && (
            <p className="text-emerald-500 text-sm">No valid cards to ask for.</p>
          )}
        </div>

        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 py-2 bg-emerald-800 hover:bg-emerald-700 rounded-lg text-emerald-300">
            Cancel
          </button>
          <button
            onClick={() => targetId && selectedCard && onAsk(targetId, selectedCard)}
            disabled={!targetId || !selectedCard}
            className="flex-1 py-2 bg-amber-600 hover:bg-amber-500 disabled:bg-gray-700 disabled:text-gray-500 rounded-lg text-white font-semibold"
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

  const me = game.players.find(p => p.id === game.myPlayerId)!;
  const teammates = game.players.filter(p => p.team === me.team);
  const claimedHs = new Set(game.claims.map(c => c.half_suit));
  const unclaimedHs = allHalfSuits().filter(hs => !claimedHs.has(hs));

  function selectHalfSuit(hs: string) {
    setSelectedHs(hs);
    // Pre-fill assignments for cards in my hand
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

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-emerald-900 rounded-2xl p-6 max-w-lg w-full border border-emerald-600 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <h3 className="text-xl font-bold text-amber-300 mb-4">Claim a Half-Suit</h3>

        <div className="mb-4">
          <label className="block text-sm text-emerald-300 mb-2">Select half-suit to claim</label>
          <div className="grid grid-cols-2 gap-2">
            {unclaimedHs.map(hs => {
              const [, suit] = hs.split('_');
              const suitIsRed = suit === 'H' || suit === 'D';
              return (
                <button
                  key={hs}
                  onClick={() => selectHalfSuit(hs)}
                  className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors
                    ${selectedHs === hs
                      ? 'bg-amber-600 text-white'
                      : 'bg-emerald-800 hover:bg-emerald-700'}
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
            <label className="block text-sm text-emerald-300 mb-2">
              Assign each card to a teammate
            </label>
            <div className="space-y-2">
              {hsCards.map(card => (
                <div key={card} className="flex items-center gap-3">
                  <CardView card={card} small />
                  <select
                    value={assignments[card] || ''}
                    onChange={e => setAssignments({ ...assignments, [card]: e.target.value })}
                    className="flex-1 px-3 py-2 bg-emerald-950 border border-emerald-600 rounded-lg text-white text-sm focus:outline-none focus:border-amber-400"
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
          <button onClick={onClose} className="flex-1 py-2 bg-emerald-800 hover:bg-emerald-700 rounded-lg text-emerald-300">
            Cancel
          </button>
          <button
            onClick={() => selectedHs && allAssigned && onClaim(selectedHs, assignments)}
            disabled={!allAssigned}
            className="flex-1 py-2 bg-amber-600 hover:bg-amber-500 disabled:bg-gray-700 disabled:text-gray-500 rounded-lg text-white font-semibold"
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

  // Check if user has a name set before loading the game
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
        <div className="text-emerald-200 text-xl">Loading game...</div>
      </div>
    );
  }

  if (needsName) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="bg-emerald-900/80 rounded-2xl shadow-2xl p-8 max-w-md w-full border border-emerald-700/50">
          <h1 className="text-3xl font-bold text-center mb-2 text-amber-300">Literature</h1>
          <p className="text-center text-emerald-300 mb-6 text-sm">Enter your name to join the game</p>
          {error && (
            <div className="bg-red-900/50 border border-red-500 text-red-200 px-4 py-2 rounded-lg mb-4 text-sm">
              {error}
            </div>
          )}
          <div className="space-y-4">
            <input
              type="text"
              value={nameInput}
              onChange={e => setNameInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSetName()}
              placeholder="Your name"
              maxLength={20}
              autoFocus
              className="w-full px-4 py-3 bg-emerald-950 border border-emerald-600 rounded-lg text-white placeholder-emerald-700 focus:outline-none focus:border-amber-400"
            />
            <button
              onClick={handleSetName}
              disabled={!nameInput.trim() || nameLoading}
              className="w-full py-3 bg-amber-600 hover:bg-amber-500 disabled:bg-gray-700 disabled:text-gray-500 text-white font-semibold rounded-lg transition-colors"
            >
              {nameLoading ? 'Setting name...' : 'Continue'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (error && !game) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="bg-emerald-900/80 rounded-2xl p-8 max-w-md w-full text-center">
          <div className="text-red-400 text-lg mb-4">{error}</div>
          <button onClick={() => router.push('/')} className="px-6 py-2 bg-emerald-700 hover:bg-emerald-600 rounded-lg">
            Back to Home
          </button>
        </div>
      </div>
    );
  }

  if (!game) return null;

  // ─── Waiting / Lobby ─────────────────────────────
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
      <header className="bg-black/30 px-4 py-2 flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-4">
          <h1 className="text-amber-300 font-bold text-lg">Literature</h1>
          <span className="text-emerald-500 text-xs font-mono">#{game.code}</span>
        </div>
        <div className="flex items-center gap-4 text-sm">
          <span className="text-blue-300">Team 1: {game.team1Score}</span>
          <span className="text-gray-500">|</span>
          <span className="text-red-300">Team 2: {game.team2Score}</span>
        </div>
      </header>

      {/* Game finished banner */}
      {game.status === 'finished' && (
        <div className="bg-amber-600/30 border-b border-amber-600 px-4 py-3 text-center">
          <div className="text-2xl font-bold text-amber-300">
            {game.winner === 0
              ? "It's a Tie!"
              : `Team ${game.winner} Wins!`}
          </div>
          <div className="text-emerald-300 text-sm mt-1">
            Final Score: Team 1 ({game.team1Score}) - Team 2 ({game.team2Score})
          </div>
          <button
            onClick={() => router.push('/')}
            className="mt-2 px-4 py-1 bg-emerald-700 hover:bg-emerald-600 rounded text-sm"
          >
            Back to Home
          </button>
        </div>
      )}

      {/* Turn indicator */}
      {game.status === 'playing' && (
        <div className={`px-4 py-2 text-center text-sm ${isMyTurn ? 'bg-amber-600/20 text-amber-300' : 'bg-black/20 text-emerald-400'}`}>
          {isMyTurn ? "It's your turn!" : `Waiting for ${turnPlayer?.name || '...'}...`}
          {game.endgameTeam && (
            <span className="ml-2 text-rose-300">(Claim-only mode - Team {game.endgameTeam === myTeam ? 'opponent' : 'your'} is out of cards)</span>
          )}
        </div>
      )}

      {/* Action message */}
      {actionMsg && (
        <div className="bg-amber-900/50 border-b border-amber-700 px-4 py-2 text-center text-amber-200 text-sm">
          {actionMsg}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="bg-red-900/50 px-4 py-2 text-center text-red-300 text-sm cursor-pointer" onClick={() => setError('')}>
          {error} (click to dismiss)
        </div>
      )}

      <div className="flex-1 flex flex-col lg:flex-row gap-2 p-2 lg:p-4 overflow-hidden">
        {/* Main game area */}
        <div className="flex-1 flex flex-col gap-3 min-w-0">
          {/* Game table with players */}
          <GameTable game={game} myTeam={myTeam} />

          {/* My cards */}
          <div className="bg-black/20 rounded-xl p-3 flex-shrink-0">
            <div className="text-xs text-emerald-400 mb-2 font-semibold">Your Cards ({sorted.length})</div>
            <div className="flex gap-1.5 flex-wrap justify-center">
              {sorted.length > 0 ? (
                sorted.map(c => <CardView key={c} card={c} />)
              ) : (
                <div className="text-emerald-600 text-sm py-4">No cards in hand</div>
              )}
            </div>
          </div>

          {/* Action buttons */}
          {game.status === 'playing' && isMyTurn && (
            <div className="flex gap-3 justify-center">
              <button
                onClick={() => setShowAsk(true)}
                disabled={!canAsk}
                className="px-6 py-3 bg-amber-600 hover:bg-amber-500 disabled:bg-gray-700 disabled:text-gray-500 rounded-xl font-semibold text-lg transition-colors"
              >
                Ask for a Card
              </button>
              <button
                onClick={() => setShowClaim(true)}
                disabled={!canClaim}
                className="px-6 py-3 bg-emerald-700 hover:bg-emerald-600 disabled:bg-gray-700 disabled:text-gray-500 rounded-xl font-semibold text-lg transition-colors"
              >
                Claim a Set
              </button>
            </div>
          )}
        </div>

        {/* Sidebar: Claimed sets + Log */}
        <div className="lg:w-80 flex flex-col gap-2 flex-shrink-0">
          {/* Claimed sets */}
          <div className="bg-black/20 rounded-xl p-3">
            <div className="text-xs text-amber-400 mb-2 font-semibold">Claimed Sets ({game.claims.length}/8)</div>
            <div className="space-y-1">
              {game.claims.length === 0 && <div className="text-emerald-700 text-sm">No sets claimed yet</div>}
              {game.claims.map(c => (
                <div key={c.half_suit} className="flex items-center justify-between text-sm px-2 py-1 rounded bg-black/20">
                  <span className={c.half_suit.split('_')[1] === 'H' || c.half_suit.split('_')[1] === 'D' ? 'text-red-300' : 'text-gray-300'}>
                    {halfSuitName(c.half_suit)}
                  </span>
                  <span className={c.claimed_by_team === 1 ? 'text-blue-300' : c.claimed_by_team === 2 ? 'text-red-300' : 'text-gray-500'}>
                    {c.claimed_by_team ? `Team ${c.claimed_by_team}` : 'Forfeited'}
                  </span>
                </div>
              ))}
              {/* Show unclaimed */}
              {allHalfSuits()
                .filter(hs => !game.claims.find(c => c.half_suit === hs))
                .map(hs => (
                  <div key={hs} className="flex items-center justify-between text-sm px-2 py-1 rounded opacity-40">
                    <span className={hs.split('_')[1] === 'H' || hs.split('_')[1] === 'D' ? 'text-red-300' : 'text-gray-300'}>
                      {halfSuitName(hs)}
                    </span>
                    <span className="text-gray-600">unclaimed</span>
                  </div>
                ))}
            </div>
          </div>

          {/* Game log */}
          {game.showLog && (
            <div className="bg-black/20 rounded-xl p-3 flex-1 min-h-0 overflow-hidden flex flex-col">
              <div className="text-xs text-emerald-500 mb-2 font-semibold">Game Log</div>
              <div className="overflow-y-auto flex-1 space-y-1 text-xs">
                {game.logs.map((log, i) => (
                  <div key={i} className="text-emerald-400/80 py-0.5 border-b border-emerald-900/50">
                    {log.details?.message || log.action}
                  </div>
                ))}
                {game.logs.length === 0 && <div className="text-emerald-700">No actions yet</div>}
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

// ─── Lobby View ─────────────────────────────────────────

function LobbyView({ game, onJoin, onStart, error }: {
  game: GameState; onJoin: () => void; onStart: () => void; error: string;
}) {
  const isHost = game.createdBy === game.myPlayerId;
  const isInGame = game.isPlayer;
  const team1 = game.players.filter(p => p.team === 1);
  const team2 = game.players.filter(p => p.team === 2);
  const perTeam = game.maxPlayers / 2;

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="bg-emerald-900/80 rounded-2xl shadow-2xl p-8 max-w-lg w-full border border-emerald-700/50">
        <h1 className="text-3xl font-bold text-amber-300 text-center mb-2">Game Lobby</h1>
        <p className="text-center text-emerald-500 text-xs mb-4">{game.maxPlayers}-player game</p>

        <div className="text-center mb-6">
          <div className="text-emerald-400 text-sm mb-1">Share this code with friends:</div>
          <div className="text-4xl font-mono font-bold text-white tracking-[0.3em] bg-black/30 rounded-xl py-3 select-all">
            {game.code}
          </div>
        </div>

        {error && (
          <div className="bg-red-900/50 border border-red-500 text-red-200 px-4 py-2 rounded-lg mb-4 text-sm">
            {error}
          </div>
        )}

        <div className="grid grid-cols-2 gap-4 mb-6">
          <div>
            <h3 className="text-blue-300 font-semibold text-sm mb-2">Team 1</h3>
            <div className="space-y-1">
              {team1.map(p => (
                <div key={p.id} className="bg-blue-900/30 px-3 py-2 rounded-lg text-sm flex items-center gap-2">
                  <span className="text-white">{p.name}</span>
                  {p.id === game.createdBy && <span className="text-amber-400 text-xs">(Host)</span>}
                  {p.id === game.myPlayerId && <span className="text-emerald-400 text-xs">(You)</span>}
                </div>
              ))}
              {Array.from({ length: perTeam - team1.length }).map((_, i) => (
                <div key={i} className="border border-dashed border-blue-800/50 px-3 py-2 rounded-lg text-sm text-blue-800">
                  Waiting...
                </div>
              ))}
            </div>
          </div>
          <div>
            <h3 className="text-red-300 font-semibold text-sm mb-2">Team 2</h3>
            <div className="space-y-1">
              {team2.map(p => (
                <div key={p.id} className="bg-red-900/30 px-3 py-2 rounded-lg text-sm flex items-center gap-2">
                  <span className="text-white">{p.name}</span>
                  {p.id === game.myPlayerId && <span className="text-emerald-400 text-xs">(You)</span>}
                </div>
              ))}
              {Array.from({ length: perTeam - team2.length }).map((_, i) => (
                <div key={i} className="border border-dashed border-red-800/50 px-3 py-2 rounded-lg text-sm text-red-800">
                  Waiting...
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="text-center text-emerald-500 text-sm mb-4">
          {game.players.length}/{game.maxPlayers} players joined
        </div>

        {!isInGame && game.players.length < game.maxPlayers && (
          <button
            onClick={onJoin}
            className="w-full py-3 bg-emerald-700 hover:bg-emerald-600 rounded-lg font-semibold text-lg mb-3"
          >
            Join Game
          </button>
        )}

        {isHost && (
          <button
            onClick={onStart}
            disabled={game.players.length !== game.maxPlayers}
            className="w-full py-3 bg-amber-600 hover:bg-amber-500 disabled:bg-gray-700 disabled:text-gray-500 rounded-lg font-semibold text-lg"
          >
            {game.players.length === game.maxPlayers ? 'Start Game' : `Waiting for ${game.maxPlayers - game.players.length} more player(s)`}
          </button>
        )}

        {isInGame && !isHost && (
          <div className="text-center text-emerald-500 text-sm">
            Waiting for the host to start the game...
          </div>
        )}
      </div>
    </div>
  );
}
