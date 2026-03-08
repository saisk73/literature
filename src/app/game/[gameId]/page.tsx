'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import gsap from 'gsap';

// ─── Constants ───────────────────────────────────────
const AVATARS = [
  '😀','😎','🤓','🧐','😏','🥳','🤩','😤','🫡','🤠',
  '🦊','🐱','🐶','🦁','🐸','🐵','🦄','🐧','🐼','🐨',
  '🦋','🐝','🐙','🦈','🐉','🦅','🐺','🦖','🐯','🐻',
  '🌟','🔥','💎','🎯','🎲','🎪','⚡','🍀','🎭','🏆',
  '👑','💫','🌸','🎸','🚀','🌊','🎵','🍕','👻','💀',
];

// ─── Types ───────────────────────────────────────────
interface Player {
  id: string;
  name: string;
  avatar: string;
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
  claimed_by: string | null;
}

interface GameState {
  id: string;
  code: string;
  status: 'waiting' | 'playing' | 'finished';
  maxPlayers: number;
  currentTurnPlayerId: string | null;
  createdBy: string;
  scores: Record<string, number>;
  winner: string | null;
  showLog: boolean;
  updatedAt: string;
  isPlayer: boolean;
  myPlayerId: string;
  myCards: string[];
  players: Player[];
  claims: Claim[];
  logs: LogEntry[];
}

// ─── Card Helpers ────────────────────────────────────
const SUIT_SYMBOLS: Record<string, string> = { H: '\u2665', D: '\u2666', C: '\u2663', S: '\u2660' };
const SUIT_NAMES: Record<string, string> = { H: 'Hearts', D: 'Diamonds', C: 'Clubs', S: 'Spades' };
const LOW_RANKS = ['A', '2', '3', '4', '5', '6'];
const HIGH_RANKS = ['8', '9', '10', 'J', 'Q', 'K'];

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
  const ro: Record<string, number> = { 'A': 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '8': 8, '9': 9, '10': 10, 'J': 11, 'Q': 12, 'K': 13 };
  return [...cards].sort((a, b) => {
    const sa = cardSuit(a), sb = cardSuit(b);
    if (so[sa] !== so[sb]) return so[sa] - so[sb];
    return ro[cardRank(a)] - ro[cardRank(b)];
  });
}

// ─── Avatar Component ────────────────────────────────
function PlayerAvatar({ player, size = 'md', isTurn = false }: { player: Player; size?: 'sm' | 'md' | 'lg'; isTurn?: boolean }) {
  const sizeClass = size === 'sm' ? 'sm' : size === 'lg' ? 'lg' : '';
  return (
    <div className={`avatar-circle ${sizeClass} ${isTurn ? 'active-turn' : ''}`}>
      {player.avatar || player.name.charAt(0).toUpperCase()}
    </div>
  );
}

// ─── Card View ───────────────────────────────────────
function CardView({ card, onClick, selected, small }: {
  card: string; onClick?: () => void; selected?: boolean; small?: boolean;
}) {
  const r = cardRank(card);
  const s = cardSuit(card);
  const red = isRed(card);

  return (
    <div
      onClick={onClick}
      className={`${small ? 'w-10 h-14 text-xs' : 'w-14 h-20 text-sm'} playing-card flex flex-col items-center justify-center
        ${red ? 'text-red-400' : 'text-slate-200'}
        ${selected ? 'selected !border-amber-400 ring-2 ring-amber-400/30' : ''}
        ${onClick ? 'cursor-pointer' : ''}`}
    >
      <span className="font-bold leading-none">{r}</span>
      <span className={`${small ? 'text-base' : 'text-lg'} leading-none`}>{SUIT_SYMBOLS[s]}</span>
    </div>
  );
}

// ─── Player Strip ────────────────────────────────────
function PlayerStrip({ game }: { game: GameState }) {
  const stripRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (stripRef.current) {
      const chips = stripRef.current.querySelectorAll('.player-chip');
      gsap.fromTo(chips,
        { opacity: 0, y: -10 },
        { opacity: 1, y: 0, duration: 0.3, stagger: 0.05, ease: 'power2.out' }
      );
    }
  }, []);

  return (
    <div ref={stripRef} className="player-strip panel-section">
      {game.players.map(player => {
        const isTurn = player.id === game.currentTurnPlayerId;
        const isMe = player.id === game.myPlayerId;
        return (
          <div
            key={player.id}
            className={`player-chip ${isTurn ? 'is-turn' : ''} ${isMe ? 'is-me' : ''}`}
          >
            <PlayerAvatar player={player} size="sm" isTurn={isTurn} />
            <div className="flex flex-col">
              <span className={`text-sm font-medium leading-tight ${isTurn ? 'text-amber-300' : isMe ? 'text-indigo-300' : 'text-slate-300'}`}>
                {isMe ? 'You' : player.name}
              </span>
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] text-slate-500">{player.cardCount} cards</span>
                {(game.scores[player.id] || 0) > 0 && (
                  <span className="text-[9px] px-1.5 py-px rounded-full bg-amber-900/40 text-amber-300 border border-amber-700/30">
                    {game.scores[player.id]} pts
                  </span>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Ask Dialog ──────────────────────────────────────
function AskDialog({ game, onClose, onAsk }: {
  game: GameState; onClose: () => void;
  onAsk: (targetId: string, card: string) => void;
}) {
  const [targetId, setTargetId] = useState('');
  const [selectedCard, setSelectedCard] = useState('');
  const overlayRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  const otherPlayers = game.players.filter(p => p.id !== game.myPlayerId && p.cardCount > 0);

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
    <div ref={overlayRef} className="fixed inset-0 bg-black/70 dialog-backdrop flex items-center justify-center z-50 p-4" onClick={handleClose}>
      <div ref={dialogRef} className="glass-panel rounded-2xl p-6 max-w-lg w-full max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <h3 className="text-xl font-bold text-amber-400 mb-5">Ask for a Card</h3>

        <div className="mb-5">
          <label className="block text-sm text-slate-400 mb-2 font-medium">Ask which player?</label>
          <div className="flex gap-2 flex-wrap">
            {otherPlayers.map(p => (
              <button
                key={p.id}
                onClick={() => setTargetId(p.id)}
                className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium transition-all
                  ${targetId === p.id
                    ? 'bg-amber-600 text-white shadow-lg shadow-amber-600/20'
                    : 'panel-section text-slate-300 hover:bg-white/5'}`}
              >
                <PlayerAvatar player={p} size="sm" />
                <span>{p.name} ({p.cardCount})</span>
              </button>
            ))}
          </div>
        </div>

        <div className="mb-6">
          <label className="block text-sm text-slate-400 mb-2 font-medium">Which card?</label>
          {Object.entries(grouped).map(([hs, cards]) => (
            <div key={hs} className="mb-3">
              <div className="text-xs text-slate-500 mb-1 font-medium">{halfSuitName(hs)}</div>
              <div className="flex gap-2 flex-wrap">
                {cards.map(c => (
                  <CardView key={c} card={c} small selected={selectedCard === c} onClick={() => setSelectedCard(c)} />
                ))}
              </div>
            </div>
          ))}
          {validCards.length === 0 && (
            <p className="text-slate-600 text-sm">No valid cards to ask for.</p>
          )}
        </div>

        <div className="flex gap-3">
          <button onClick={handleClose} className="btn-secondary flex-1 py-2.5">Cancel</button>
          <button
            onClick={() => targetId && selectedCard && onAsk(targetId, selectedCard)}
            disabled={!targetId || !selectedCard}
            className="btn-primary flex-1 py-2.5"
          >
            Ask
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Claim Dialog ────────────────────────────────────
function ClaimDialog({ game, onClose, onClaim }: {
  game: GameState; onClose: () => void;
  onClaim: (halfSuit: string, assignments: Record<string, string>) => void;
}) {
  const [selectedHs, setSelectedHs] = useState('');
  const [assignments, setAssignments] = useState<Record<string, string>>({});
  const overlayRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

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
    <div ref={overlayRef} className="fixed inset-0 bg-black/70 dialog-backdrop flex items-center justify-center z-50 p-4" onClick={handleClose}>
      <div ref={dialogRef} className="glass-panel rounded-2xl p-6 max-w-lg w-full max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <h3 className="text-xl font-bold text-amber-400 mb-5">Claim a Half-Suit</h3>

        <div className="mb-5">
          <label className="block text-sm text-slate-400 mb-2 font-medium">Select half-suit</label>
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
                      ? 'bg-amber-600 text-white shadow-lg shadow-amber-600/20'
                      : 'panel-section hover:bg-white/5'}
                    ${suitIsRed && selectedHs !== hs ? 'text-red-300' : selectedHs !== hs ? 'text-slate-300' : ''}`}
                >
                  {halfSuitName(hs)}
                </button>
              );
            })}
          </div>
        </div>

        {selectedHs && (
          <div className="mb-6">
            <label className="block text-sm text-slate-400 mb-2 font-medium">
              Assign each card to a player
            </label>
            <div className="space-y-2">
              {hsCards.map(card => (
                <div key={card} className="flex items-center gap-3">
                  <CardView card={card} small />
                  <select
                    value={assignments[card] || ''}
                    onChange={e => setAssignments({ ...assignments, [card]: e.target.value })}
                    className="flex-1 px-3 py-2 bg-[rgba(15,15,30,0.6)] border border-white/10 rounded-xl text-white text-sm focus:outline-none focus:border-amber-400/40 transition-all"
                  >
                    <option value="">-- Select player --</option>
                    {game.players.map(p => (
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
          <button onClick={handleClose} className="btn-secondary flex-1 py-2.5">Cancel</button>
          <button
            onClick={() => selectedHs && allAssigned && onClaim(selectedHs, assignments)}
            disabled={!allAssigned}
            className="btn-primary flex-1 py-2.5"
          >
            Claim
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Profile Edit Dialog ─────────────────────────────
function ProfileEditDialog({ currentName, currentAvatar, onClose, onSave }: {
  currentName: string; currentAvatar: string;
  onClose: () => void; onSave: (name: string, avatar: string) => void;
}) {
  const [name, setName] = useState(currentName);
  const [avatar, setAvatar] = useState(currentAvatar);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const overlayRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

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

  async function handleSave() {
    if (!name.trim()) return;
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), avatar }),
      });
      if (res.ok) {
        onSave(name.trim(), avatar);
        handleClose();
      } else {
        const data = await res.json();
        setError(data.error || 'Failed to update profile');
      }
    } catch {
      setError('Connection error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div ref={overlayRef} className="fixed inset-0 bg-black/70 dialog-backdrop flex items-center justify-center z-50 p-4" onClick={handleClose}>
      <div ref={dialogRef} className="glass-panel rounded-2xl p-6 max-w-lg w-full max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <h3 className="text-xl font-bold text-amber-400 mb-5">Edit Profile</h3>

        {error && (
          <div className="bg-red-900/30 border border-red-500/30 text-red-300 px-4 py-2 rounded-xl mb-4 text-sm">
            {error}
          </div>
        )}

        <div className="space-y-5">
          <div>
            <label className="block text-sm text-slate-400 mb-2 font-medium">Pick your avatar</label>
            <div className="avatar-grid">
              {AVATARS.map(a => (
                <button
                  key={a}
                  type="button"
                  onClick={() => setAvatar(a)}
                  className={avatar === a ? 'selected' : ''}
                >
                  {a}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm text-slate-400 mb-2 font-medium">Your name</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSave()}
              placeholder="Enter your name"
              maxLength={20}
              autoFocus
              className="input-field"
            />
          </div>

          <div className="flex gap-3">
            <button onClick={handleClose} className="btn-secondary flex-1 py-2.5">Cancel</button>
            <button
              onClick={handleSave}
              disabled={!name.trim() || saving}
              className="btn-primary flex-1 py-2.5"
            >
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main Game Page ──────────────────────────────────
export default function GamePage() {
  const params = useParams();
  const router = useRouter();
  const gameId = params.gameId as string;

  const [game, setGame] = useState<GameState | null>(null);
  const [error, setError] = useState('');
  const [showAsk, setShowAsk] = useState(false);
  const [showClaim, setShowClaim] = useState(false);
  const [showProfileEdit, setShowProfileEdit] = useState(false);
  const [actionMsg, setActionMsg] = useState('');
  const [loading, setLoading] = useState(true);
  const [needsName, setNeedsName] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [avatarInput, setAvatarInput] = useState('');
  const [nameLoading, setNameLoading] = useState(false);
  const [myName, setMyName] = useState('');
  const [myAvatar, setMyAvatar] = useState('');
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
          setMyName(data.name);
          setMyAvatar(data.avatar || '');
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
      body: JSON.stringify({ name: nameInput.trim(), avatar: avatarInput }),
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
        correct: 'Correct! You win the set!',
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

  // ─── Render States ─────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-slate-400 text-xl animate-pulse">Loading game...</div>
      </div>
    );
  }

  if (needsName) {
    return (
      <NamePrompt
        error={error}
        nameInput={nameInput}
        setNameInput={setNameInput}
        avatarInput={avatarInput}
        setAvatarInput={setAvatarInput}
        nameLoading={nameLoading}
        onSubmit={handleSetName}
      />
    );
  }

  if (error && !game) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="glass-panel rounded-2xl p-8 max-w-md w-full text-center">
          <div className="text-red-400 text-lg mb-4">{error}</div>
          <button onClick={() => router.push('/')} className="btn-secondary px-6 py-2">
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

  // ─── Playing / Finished ────────────────────────
  const isMyTurn = game.currentTurnPlayerId === game.myPlayerId;
  const sorted = sortCards(game.myCards);
  const canAsk = isMyTurn && game.myCards.length > 0 && game.status === 'playing';
  const canClaim = isMyTurn && game.status === 'playing';
  const turnPlayer = game.players.find(p => p.id === game.currentTurnPlayerId);

  // Group cards by suit for display
  const cardsBySuit: Record<string, string[]> = {};
  for (const c of sorted) {
    const s = cardSuit(c);
    if (!cardsBySuit[s]) cardsBySuit[s] = [];
    cardsBySuit[s].push(c);
  }

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="bg-black/30 backdrop-blur-sm px-4 py-2.5 flex items-center justify-between flex-wrap gap-2 border-b border-white/5">
        <div className="flex items-center gap-3">
          <h1 className="text-amber-400 font-bold text-lg tracking-tight">Literature</h1>
          <span className="text-slate-600 text-xs font-mono bg-black/20 px-2 py-0.5 rounded-md border border-white/5">#{game.code}</span>
        </div>
        <div className="flex items-center gap-2 text-xs">
          {game.players
            .map(p => ({ ...p, score: game.scores[p.id] || 0 }))
            .sort((a, b) => b.score - a.score)
            .map(p => (
              <span key={p.id} className={`score-badge ${p.id === game.myPlayerId ? 'text-amber-300' : 'text-slate-400'}`}>
                {p.avatar && <span className="mr-1">{p.avatar}</span>}
                {p.id === game.myPlayerId ? 'You' : p.name}: {p.score}
              </span>
            ))}
          <button
            onClick={() => setShowProfileEdit(true)}
            className="profile-btn ml-1"
            title="Edit Profile"
          >
            <span className="avatar-circle sm">
              {myAvatar || myName.charAt(0).toUpperCase() || '?'}
            </span>
          </button>
        </div>
      </header>

      {/* Game Finished Banner */}
      {game.status === 'finished' && <GameFinishedBanner game={game} router={router} />}

      {/* Turn Indicator */}
      {game.status === 'playing' && (
        <div className={`px-4 py-2.5 text-center text-sm font-medium ${isMyTurn ? 'turn-banner text-amber-300' : 'bg-black/15 text-slate-500 border-b border-white/5'}`}>
          {isMyTurn ? "Your turn - ask for a card or claim a set" : `Waiting for ${turnPlayer?.name || '...'}...`}
        </div>
      )}

      {/* Action Message */}
      <ActionMessage message={actionMsg} />

      {/* Error */}
      {error && (
        <div className="bg-red-900/30 px-4 py-2 text-center text-red-300 text-sm cursor-pointer border-b border-red-800/20" onClick={() => setError('')}>
          {error} (click to dismiss)
        </div>
      )}

      <div className="flex-1 flex flex-col lg:flex-row gap-3 p-3 lg:p-4 overflow-hidden">
        {/* Main Game Area */}
        <div className="flex-1 flex flex-col gap-3 min-w-0">
          {/* Player Strip */}
          <PlayerStrip game={game} />

          {/* My Cards */}
          <div className="panel-section p-4 flex-shrink-0">
            <div className="text-xs text-slate-500 mb-3 font-semibold tracking-wide uppercase">Your Cards ({sorted.length})</div>
            <div ref={cardsRef} className="flex gap-1.5 flex-wrap justify-center">
              {sorted.length > 0 ? (
                Object.entries(cardsBySuit).map(([suit, cards], i) => (
                  <div key={suit} className="flex gap-1.5 items-center">
                    {i > 0 && <div className="w-px h-12 bg-white/5 mx-1" />}
                    {cards.map(c => <CardView key={c} card={c} />)}
                  </div>
                ))
              ) : (
                <div className="text-slate-600 text-sm py-6">No cards in hand</div>
              )}
            </div>
          </div>

          {/* Action Buttons */}
          {game.status === 'playing' && isMyTurn && (
            <div ref={actionBtnsRef} className="flex gap-3 justify-center">
              <button
                onClick={() => setShowAsk(true)}
                disabled={!canAsk}
                className="btn-primary px-8 py-3 text-lg"
              >
                Ask for a Card
              </button>
              <button
                onClick={() => setShowClaim(true)}
                disabled={!canClaim}
                className="btn-secondary px-8 py-3 text-lg font-semibold"
              >
                Claim a Set
              </button>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="lg:w-80 flex flex-col gap-3 flex-shrink-0">
          {/* Claimed Sets */}
          <div className="panel-section p-3">
            <div className="text-xs text-amber-400/70 mb-2 font-semibold tracking-wide uppercase">Claimed Sets ({game.claims.length}/8)</div>
            <div className="space-y-1">
              {game.claims.length === 0 && <div className="text-slate-700 text-sm">No sets claimed yet</div>}
              {game.claims.map(c => {
                const claimerName = c.claimed_by
                  ? (game.players.find(p => p.id === c.claimed_by)?.name || 'Unknown')
                  : null;
                const claimerAvatar = c.claimed_by
                  ? (game.players.find(p => p.id === c.claimed_by)?.avatar || '')
                  : '';
                return (
                  <div key={c.half_suit} className="flex items-center justify-between text-sm px-2.5 py-1.5 rounded-lg bg-black/20 border border-white/5">
                    <span className={c.half_suit.split('_')[1] === 'H' || c.half_suit.split('_')[1] === 'D' ? 'text-red-300' : 'text-slate-300'}>
                      {halfSuitName(c.half_suit)}
                    </span>
                    <span className={claimerName ? 'text-amber-300' : 'text-slate-600'}>
                      {claimerAvatar && <span className="mr-1">{claimerAvatar}</span>}
                      {claimerName || 'Forfeited'}
                    </span>
                  </div>
                );
              })}
              {allHalfSuits()
                .filter(hs => !game.claims.find(c => c.half_suit === hs))
                .map(hs => (
                  <div key={hs} className="flex items-center justify-between text-sm px-2.5 py-1.5 rounded-lg opacity-25">
                    <span className={hs.split('_')[1] === 'H' || hs.split('_')[1] === 'D' ? 'text-red-300' : 'text-slate-300'}>
                      {halfSuitName(hs)}
                    </span>
                    <span className="text-slate-700 text-xs">unclaimed</span>
                  </div>
                ))}
            </div>
          </div>

          {/* Game Log */}
          {game.showLog && (
            <div className="panel-section p-3 flex-1 min-h-0 overflow-hidden flex flex-col">
              <div className="text-xs text-slate-500 mb-2 font-semibold tracking-wide uppercase">Game Log</div>
              <div className="overflow-y-auto flex-1 space-y-1 text-xs game-log">
                {game.logs.map((log, i) => (
                  <div key={i} className="text-slate-500 py-1 border-b border-white/5">
                    {log.details?.message || log.action}
                  </div>
                ))}
                {game.logs.length === 0 && <div className="text-slate-700">No actions yet</div>}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Dialogs */}
      {showAsk && <AskDialog game={game} onClose={() => setShowAsk(false)} onAsk={handleAsk} />}
      {showClaim && <ClaimDialog game={game} onClose={() => setShowClaim(false)} onClaim={handleClaim} />}
      {showProfileEdit && (
        <ProfileEditDialog
          currentName={myName}
          currentAvatar={myAvatar}
          onClose={() => setShowProfileEdit(false)}
          onSave={(name, avatar) => {
            setMyName(name);
            setMyAvatar(avatar);
            prevUpdatedAt.current = '';
            fetchGame();
          }}
        />
      )}
    </div>
  );
}

// ─── Action Message ──────────────────────────────────
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
    <div ref={ref} className="bg-amber-900/20 border-b border-amber-700/20 px-4 py-2.5 text-center text-amber-200 text-sm font-medium">
      {message}
    </div>
  );
}

// ─── Game Finished Banner ────────────────────────────
function GameFinishedBanner({ game, router }: { game: GameState; router: ReturnType<typeof useRouter> }) {
  const ref = useRef<HTMLDivElement>(null);

  const winnerPlayer = game.winner && game.winner !== 'tie'
    ? game.players.find(p => p.id === game.winner)
    : null;

  const scoreboard = game.players
    .map(p => ({ ...p, score: game.scores[p.id] || 0 }))
    .sort((a, b) => b.score - a.score);

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
    <div ref={ref} className="bg-gradient-to-r from-transparent via-amber-600/15 to-transparent border-b border-amber-600/20 px-4 py-5 text-center origin-top">
      <div className="winner-text text-2xl font-bold text-amber-300 mb-1">
        {game.winner === 'tie'
          ? "It's a Tie!"
          : `${winnerPlayer?.avatar ? winnerPlayer.avatar + ' ' : ''}${winnerPlayer?.name || 'Unknown'} Wins!`}
      </div>
      <div className="text-slate-400 text-sm mt-1 flex justify-center gap-3 flex-wrap">
        {scoreboard.map(p => (
          <span key={p.id}>
            {p.avatar && <span className="mr-0.5">{p.avatar}</span>}
            {p.id === game.myPlayerId ? 'You' : p.name}: {p.score}
          </span>
        ))}
      </div>
      <button
        onClick={() => router.push('/')}
        className="btn-secondary mt-3 px-5 py-1.5 text-sm"
      >
        Back to Home
      </button>
    </div>
  );
}

// ─── Name Prompt ─────────────────────────────────────
function NamePrompt({ error, nameInput, setNameInput, avatarInput, setAvatarInput, nameLoading, onSubmit }: {
  error: string; nameInput: string; setNameInput: (v: string) => void;
  avatarInput: string; setAvatarInput: (v: string) => void;
  nameLoading: boolean; onSubmit: () => void;
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
      <div ref={panelRef} className="glass-panel rounded-2xl p-8 max-w-lg w-full" style={{ opacity: 0 }}>
        <h1 className="text-3xl font-bold text-center mb-2 title-shimmer">Literature</h1>
        <p className="text-center text-slate-500 mb-6 text-sm">Set up your profile to join</p>
        {error && (
          <div className="bg-red-900/30 border border-red-500/30 text-red-300 px-4 py-2 rounded-xl mb-4 text-sm">
            {error}
          </div>
        )}
        <div className="space-y-5">
          <div>
            <label className="block text-sm text-slate-400 mb-2 font-medium">Pick an avatar</label>
            <div className="avatar-grid">
              {AVATARS.map(a => (
                <button
                  key={a}
                  type="button"
                  onClick={() => setAvatarInput(a)}
                  className={avatarInput === a ? 'selected' : ''}
                >
                  {a}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm text-slate-400 mb-2 font-medium">Your name</label>
            <input
              type="text"
              value={nameInput}
              onChange={e => setNameInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && onSubmit()}
              placeholder="Enter your name"
              maxLength={20}
              autoFocus
              className="input-field"
            />
          </div>

          <button
            onClick={onSubmit}
            disabled={!nameInput.trim() || nameLoading}
            className="btn-primary w-full py-3 text-lg"
          >
            {nameLoading ? 'Setting up...' : 'Continue'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Lobby View ──────────────────────────────────────
function LobbyView({ game, onJoin, onStart, error }: {
  game: GameState; onJoin: () => void; onStart: () => void; error: string;
}) {
  const isHost = game.createdBy === game.myPlayerId;
  const isInGame = game.isPlayer;
  const panelRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (panelRef.current) {
      gsap.fromTo(panelRef.current,
        { y: 40, opacity: 0, scale: 0.95 },
        { y: 0, opacity: 1, scale: 1, duration: 0.6, ease: 'back.out(1.4)' }
      );
    }
  }, []);

  useEffect(() => {
    if (gridRef.current) {
      const cards = gridRef.current.querySelectorAll('.lobby-card');
      gsap.fromTo(cards,
        { scale: 0.8, opacity: 0 },
        { scale: 1, opacity: 1, duration: 0.3, stagger: 0.05, ease: 'back.out(1.5)' }
      );
    }
  }, [game.players.length]);

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div ref={panelRef} className="glass-panel rounded-2xl p-8 max-w-xl w-full" style={{ opacity: 0 }}>
        <h1 className="text-3xl font-bold title-shimmer text-center mb-1">Game Lobby</h1>
        <p className="text-center text-slate-600 text-xs mb-5 tracking-wide">{game.maxPlayers}-player game</p>

        {/* Game Code */}
        <div className="text-center mb-6">
          <div className="text-slate-500 text-sm mb-1.5">Share this code:</div>
          <div className="text-4xl font-mono font-bold text-white tracking-[0.3em] panel-section py-3 select-all rounded-xl">
            {game.code}
          </div>
        </div>

        {error && (
          <div className="bg-red-900/30 border border-red-500/30 text-red-300 px-4 py-2 rounded-xl mb-4 text-sm">
            {error}
          </div>
        )}

        {/* Player Grid */}
        <div ref={gridRef} className="lobby-grid mb-6">
          {game.players.map(p => (
            <div key={p.id} className="lobby-card">
              <div className="avatar-circle lg mb-2">
                {p.avatar || p.name.charAt(0).toUpperCase()}
              </div>
              <div className="text-sm font-medium text-white truncate max-w-full px-1">{p.name}</div>
              <div className="flex gap-1 mt-1">
                {p.id === game.createdBy && <span className="text-amber-400 text-[10px] bg-amber-900/30 px-1.5 py-0.5 rounded-full">Host</span>}
                {p.id === game.myPlayerId && <span className="text-indigo-300 text-[10px] bg-indigo-900/30 px-1.5 py-0.5 rounded-full">You</span>}
              </div>
            </div>
          ))}
          {Array.from({ length: game.maxPlayers - game.players.length }).map((_, i) => (
            <div key={`empty-${i}`} className="lobby-card empty">
              <div className="avatar-circle lg mb-2 opacity-20">?</div>
              <div className="text-sm text-slate-700 animate-pulse">Waiting...</div>
            </div>
          ))}
        </div>

        <div className="text-center text-slate-600 text-sm mb-4">
          {game.players.length}/{game.maxPlayers} players joined
        </div>

        {!isInGame && game.players.length < game.maxPlayers && (
          <button onClick={onJoin} className="btn-secondary w-full py-3 text-lg font-semibold mb-3">
            Join Game
          </button>
        )}

        {isHost && (
          <button
            onClick={onStart}
            disabled={game.players.length !== game.maxPlayers}
            className="btn-primary w-full py-3 text-lg"
          >
            {game.players.length === game.maxPlayers ? 'Start Game' : `Waiting for ${game.maxPlayers - game.players.length} more...`}
          </button>
        )}

        {isInGame && !isHost && (
          <div className="text-center text-slate-600 text-sm animate-pulse">
            Waiting for the host to start...
          </div>
        )}
      </div>
    </div>
  );
}
