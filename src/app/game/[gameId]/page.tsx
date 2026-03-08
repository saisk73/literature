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

// ─── Sound Helpers ──────────────────────────────────
function getSoundEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  const val = localStorage.getItem('literature_sound');
  return val === null ? true : val === 'true';
}

function setSoundEnabled(enabled: boolean) {
  if (typeof window !== 'undefined') {
    localStorage.setItem('literature_sound', enabled ? 'true' : 'false');
  }
}

function playTone(frequency: number, duration: number, type: OscillatorType = 'sine') {
  if (!getSoundEnabled()) return;
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = frequency;
    gain.gain.value = 0.15;
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + duration);
  } catch { /* audio not available */ }
}

function playCardTransferSound() {
  playTone(523, 0.15, 'sine');
  setTimeout(() => playTone(659, 0.15, 'sine'), 100);
}

function playCardFailSound() {
  playTone(330, 0.2, 'triangle');
  setTimeout(() => playTone(262, 0.3, 'triangle'), 150);
}

function playClaimSound() {
  playTone(523, 0.1, 'sine');
  setTimeout(() => playTone(659, 0.1, 'sine'), 80);
  setTimeout(() => playTone(784, 0.2, 'sine'), 160);
}

function playForfeitSound() {
  playTone(330, 0.3, 'sawtooth');
}

// ─── Log Action Icons ───────────────────────────────
function getLogIcon(action: string): string {
  switch (action) {
    case 'ask_success': return '🃏';
    case 'ask_fail': return '✋';
    case 'claim': return '🏆';
    case 'auto_claim': return '⭐';
    case 'game_over': return '🎉';
    case 'game_start': return '🎮';
    case 'deal': return '🎴';
    default: return '📝';
  }
}

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
      className={`${small ? 'w-9 h-[3.25rem] sm:w-10 sm:h-14 text-xs' : 'w-11 h-16 sm:w-14 sm:h-20 text-xs sm:text-sm'} playing-card flex flex-col items-center justify-center
        ${red ? 'text-red-400' : 'text-slate-200'}
        ${selected ? 'selected !border-amber-400 ring-2 ring-amber-400/30' : ''}
        ${onClick ? 'cursor-pointer' : ''}`}
    >
      <span className="font-bold leading-none">{r}</span>
      <span className={`${small ? 'text-sm sm:text-base' : 'text-base sm:text-lg'} leading-none`}>{SUIT_SYMBOLS[s]}</span>
    </div>
  );
}

// ─── Player Strip ────────────────────────────────────
function PlayerStrip({ game, playerEmoji }: { game: GameState; playerEmoji?: { playerId: string; emoji: string } | null }) {
  const stripRef = useRef<HTMLDivElement>(null);
  const prevCounts = useRef<Record<string, number>>({});

  useEffect(() => {
    if (stripRef.current) {
      const chips = stripRef.current.querySelectorAll('.player-chip');
      gsap.fromTo(chips,
        { opacity: 0, y: -10 },
        { opacity: 1, y: 0, duration: 0.3, stagger: 0.05, ease: 'power2.out' }
      );
    }
  }, []);

  // +1/-1 card delta animations
  useEffect(() => {
    if (!stripRef.current) return;
    for (const player of game.players) {
      const prev = prevCounts.current[player.id];
      if (prev !== undefined && prev !== player.cardCount) {
        const delta = player.cardCount - prev;
        const chip = stripRef.current.querySelector(`[data-player-id="${player.id}"]`);
        if (chip) {
          const el = document.createElement('span');
          el.className = 'card-delta';
          el.textContent = delta > 0 ? `+${delta}` : `${delta}`;
          el.style.color = delta > 0 ? '#4ade80' : '#f87171';
          (chip as HTMLElement).style.position = 'relative';
          chip.appendChild(el);
          gsap.fromTo(el,
            { y: 0, opacity: 1, scale: 1 },
            { y: -28, opacity: 0, scale: 1.3, duration: 1.4, ease: 'power2.out', onComplete: () => el.remove() }
          );
        }
      }
    }
    const counts: Record<string, number> = {};
    for (const p of game.players) counts[p.id] = p.cardCount;
    prevCounts.current = counts;
  }, [game.players, game.updatedAt]);

  // Emoji animation (cry on wrong claim, etc.)
  useEffect(() => {
    if (!playerEmoji || !stripRef.current) return;
    const chip = stripRef.current.querySelector(`[data-player-id="${playerEmoji.playerId}"]`);
    if (chip) {
      const el = document.createElement('span');
      el.className = 'card-delta';
      el.textContent = playerEmoji.emoji;
      el.style.fontSize = '1.2rem';
      (chip as HTMLElement).style.position = 'relative';
      chip.appendChild(el);
      gsap.fromTo(el,
        { y: 0, opacity: 1, scale: 0.5 },
        { y: -32, opacity: 0, scale: 1.8, duration: 2, ease: 'power2.out', onComplete: () => el.remove() }
      );
    }
  }, [playerEmoji]);

  return (
    <div ref={stripRef} className="player-strip-grid panel-section">
      {game.players.map(player => {
        const isTurn = player.id === game.currentTurnPlayerId;
        const isMe = player.id === game.myPlayerId;
        return (
          <div
            key={player.id}
            data-player-id={player.id}
            className={`player-chip ${isTurn ? 'is-turn' : ''} ${isMe ? 'is-me' : ''}`}
          >
            <PlayerAvatar player={player} size="sm" isTurn={isTurn} />
            <div className="flex flex-col min-w-0">
              <span className={`text-xs sm:text-sm font-medium leading-tight truncate ${isTurn ? 'text-amber-300' : isMe ? 'text-indigo-300' : 'text-slate-300'}`}>
                {isMe ? 'You' : player.name}
              </span>
              <div className="flex items-center gap-1.5">
                <span className="text-[9px] sm:text-[10px] text-slate-500">{player.cardCount} cards</span>
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
    <div ref={overlayRef} className="fixed inset-0 bg-black/70 dialog-backdrop flex items-center justify-center z-50 p-2 sm:p-4" onClick={handleClose}>
      <div ref={dialogRef} className="glass-panel rounded-2xl p-4 sm:p-6 max-w-lg w-full max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <h3 className="text-lg sm:text-xl font-bold text-amber-400 mb-4 sm:mb-5">Ask for a Card</h3>

        <div className="mb-4 sm:mb-5">
          <label className="block text-sm text-slate-400 mb-2 font-medium">Ask which player?</label>
          <div className="flex gap-1.5 sm:gap-2 flex-wrap">
            {otherPlayers.map(p => (
              <button
                key={p.id}
                onClick={() => setTargetId(p.id)}
                className={`flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-xl text-xs sm:text-sm font-medium transition-all
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

        <div className="mb-4 sm:mb-6">
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
    <div ref={overlayRef} className="fixed inset-0 bg-black/70 dialog-backdrop flex items-center justify-center z-50 p-2 sm:p-4" onClick={handleClose}>
      <div ref={dialogRef} className="glass-panel rounded-2xl p-4 sm:p-6 max-w-lg w-full max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <h3 className="text-lg sm:text-xl font-bold text-amber-400 mb-4 sm:mb-5">Claim a Half-Suit</h3>

        <div className="mb-4 sm:mb-5">
          <label className="block text-sm text-slate-400 mb-2 font-medium">Select half-suit</label>
          <div className="grid grid-cols-2 gap-1.5 sm:gap-2">
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

// ─── Rules Sidebar ──────────────────────────────────
function RulesSidebar({ onClose }: { onClose: () => void }) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    gsap.fromTo(overlayRef.current, { opacity: 0 }, { opacity: 1, duration: 0.2 });
    gsap.fromTo(panelRef.current, { x: '100%' }, { x: '0%', duration: 0.3, ease: 'power2.out' });
  }, []);

  function handleClose() {
    const tl = gsap.timeline({ onComplete: onClose });
    tl.to(panelRef.current, { x: '100%', duration: 0.25, ease: 'power2.in' });
    tl.to(overlayRef.current, { opacity: 0, duration: 0.15 }, '-=0.1');
  }

  return (
    <div ref={overlayRef} className="fixed inset-0 bg-black/60 dialog-backdrop z-50" onClick={handleClose}>
      <div
        ref={panelRef}
        className="absolute right-0 top-0 h-full w-full max-w-md bg-[rgba(12,10,24,0.97)] border-l border-white/10 overflow-y-auto rules-sidebar"
        onClick={e => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-[rgba(12,10,24,0.97)] border-b border-white/10 px-5 py-4 flex items-center justify-between z-10">
          <h2 className="text-lg font-bold text-amber-400">How to Play Literature</h2>
          <button onClick={handleClose} className="text-slate-400 hover:text-white transition-colors text-xl leading-none p-1">&times;</button>
        </div>

        <div className="px-5 py-4 space-y-5 text-sm text-slate-300 leading-relaxed">
          <section>
            <h3 className="text-amber-400/90 font-semibold text-base mb-2">Overview</h3>
            <p>Literature is a team-based card game for 6 or 8 players. Players split into two teams and try to collect &ldquo;half-suits&rdquo; by asking opponents for specific cards.</p>
          </section>

          <section>
            <h3 className="text-amber-400/90 font-semibold text-base mb-2">The Deck</h3>
            <ul className="space-y-1.5 list-disc list-inside marker:text-amber-600/60">
              <li>Uses a standard 48-card deck (no 7s)</li>
              <li>Each suit is split into two <strong className="text-slate-200">half-suits</strong> of 6 cards each</li>
              <li><strong className="text-slate-200">Low</strong>: A, 2, 3, 4, 5, 6</li>
              <li><strong className="text-slate-200">High</strong>: 8, 9, 10, J, Q, K</li>
              <li>There are 8 half-suits total (4 suits &times; 2)</li>
            </ul>
          </section>

          <section>
            <h3 className="text-amber-400/90 font-semibold text-base mb-2">Teams &amp; Seating</h3>
            <ul className="space-y-1.5 list-disc list-inside marker:text-amber-600/60">
              <li>Players are divided into Team 1 and Team 2</li>
              <li>Teammates sit in alternating seats around the table</li>
              <li>Cards are dealt evenly to all players</li>
            </ul>
          </section>

          <section>
            <h3 className="text-amber-400/90 font-semibold text-base mb-2">Asking for Cards</h3>
            <ul className="space-y-1.5 list-disc list-inside marker:text-amber-600/60">
              <li>On your turn, ask any <strong className="text-slate-200">opponent</strong> for a specific card</li>
              <li>You must hold at least one card from the same half-suit</li>
              <li>You <strong className="text-slate-200">cannot</strong> ask for a card you already have</li>
              <li><strong className="text-slate-200">Success</strong>: You get the card and take another turn</li>
              <li><strong className="text-slate-200">Fail</strong>: The turn passes to the player you asked</li>
            </ul>
          </section>

          <section>
            <h3 className="text-amber-400/90 font-semibold text-base mb-2">Claiming Half-Suits</h3>
            <ul className="space-y-1.5 list-disc list-inside marker:text-amber-600/60">
              <li>Any player can attempt to claim a half-suit at any time</li>
              <li>To claim, declare which teammate holds each of the 6 cards</li>
              <li><strong className="text-slate-200">Correct claim</strong>: Your team scores 1 point</li>
              <li><strong className="text-slate-200">Wrong claim</strong>: The opposing team scores 1 point</li>
              <li>If your team holds all 6 cards of a half-suit, it&apos;s <strong className="text-slate-200">auto-claimed</strong></li>
            </ul>
          </section>

          <section>
            <h3 className="text-amber-400/90 font-semibold text-base mb-2">Winning</h3>
            <ul className="space-y-1.5 list-disc list-inside marker:text-amber-600/60">
              <li>The game ends when all 8 half-suits have been claimed</li>
              <li>The team with more points wins (max 8 points)</li>
              <li>First team to reach 5 points wins immediately</li>
            </ul>
          </section>

          <section>
            <h3 className="text-amber-400/90 font-semibold text-base mb-2">Strategy Tips</h3>
            <ul className="space-y-1.5 list-disc list-inside marker:text-amber-600/60">
              <li>Pay attention to who asks for what &mdash; it reveals information</li>
              <li>Failed asks also give valuable clues to everyone</li>
              <li>Communicate with teammates through your asking patterns</li>
              <li>Claim early if you&apos;re confident, before opponents can interfere</li>
              <li>A wrong claim is costly &mdash; make sure you&apos;re certain!</li>
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}

// ─── Profile Edit Dialog ─────────────────────────────
function ProfileEditDialog({ currentName, currentAvatar, soundEnabled, onClose, onSave, onToggleSound }: {
  currentName: string; currentAvatar: string; soundEnabled: boolean;
  onClose: () => void; onSave: (name: string, avatar: string) => void; onToggleSound: () => void;
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
    <div ref={overlayRef} className="fixed inset-0 bg-black/70 dialog-backdrop flex items-center justify-center z-50 p-2 sm:p-4" onClick={handleClose}>
      <div ref={dialogRef} className="glass-panel rounded-2xl p-4 sm:p-6 max-w-lg w-full max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <h3 className="text-lg sm:text-xl font-bold text-amber-400 mb-4 sm:mb-5">Edit Profile</h3>

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

          <div>
            <label className="block text-sm text-slate-400 mb-2 font-medium">Sound Settings</label>
            <button
              type="button"
              onClick={onToggleSound}
              className={`flex items-center gap-3 w-full px-4 py-3 rounded-xl transition-all border ${
                soundEnabled
                  ? 'bg-amber-900/30 border-amber-600/30 text-amber-300'
                  : 'bg-[rgba(15,15,30,0.6)] border-white/10 text-slate-400'
              }`}
            >
              <span className="text-xl">{soundEnabled ? '🔊' : '🔇'}</span>
              <span className="text-sm font-medium">{soundEnabled ? 'Sound On' : 'Sound Off'}</span>
              <div className={`ml-auto w-10 h-5 rounded-full transition-all relative ${soundEnabled ? 'bg-amber-600' : 'bg-slate-700'}`}>
                <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${soundEnabled ? 'left-5' : 'left-0.5'}`} />
              </div>
            </button>
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
  const [showProfileEdit, setShowProfileEdit] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const [actionAlert, setActionAlert] = useState<ActionAlertData | null>(null);
  const [loading, setLoading] = useState(true);
  const [needsName, setNeedsName] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [avatarInput, setAvatarInput] = useState('');
  const [nameLoading, setNameLoading] = useState(false);
  const [myName, setMyName] = useState('');
  const [myAvatar, setMyAvatar] = useState('');
  const [playerEmoji, setPlayerEmoji] = useState<{ playerId: string; emoji: string } | null>(null);
  const [soundOn, setSoundOn] = useState(false);
  const prevUpdatedAt = useRef('');
  const cardsRef = useRef<HTMLDivElement>(null);
  const actionBtnsRef = useRef<HTMLDivElement>(null);
  const prevCardCount = useRef(0);
  const prevLogCount = useRef(0);
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Initialize sound setting from localStorage
  useEffect(() => {
    setSoundOn(getSoundEnabled());
  }, []);

  const fetchGame = useCallback(async () => {
    try {
      const res = await fetch(`/api/games/${gameId}`);
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || 'Failed to load game');
        return;
      }
      const raw = await res.json();
      const data: GameState = { ...raw, logs: JSON.parse(atob(raw.logs)) };
      if (data.updatedAt !== prevUpdatedAt.current) {
        // Detect new log entries and show alert for ask/claim actions
        if (prevLogCount.current > 0 && data.logs.length > prevLogCount.current) {
          const newLogs = data.logs.slice(prevLogCount.current);
          const alertLog = newLogs.find(l =>
            l.action === 'ask_success' || l.action === 'ask_fail' || l.action === 'claim' || l.action === 'auto_claim'
          );
          if (alertLog?.details?.message) {
            setActionAlert({
              message: alertLog.details.message as string,
              card: alertLog.details?.card as string | undefined,
              type: alertLog.action,
            });
            if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
            dismissTimerRef.current = setTimeout(() => setActionAlert(null), 10000);

            // Play sounds
            if (alertLog.action === 'ask_success') playCardTransferSound();
            else if (alertLog.action === 'ask_fail') playCardFailSound();
            else if (alertLog.action === 'claim' && alertLog.details?.result === 'correct') playClaimSound();
            else if (alertLog.action === 'auto_claim') playClaimSound();
            else if (alertLog.action === 'claim' && alertLog.details?.result === 'forfeited') playForfeitSound();
          }
          // Cry emoji on forfeited claim
          const forfeitLog = newLogs.find(l =>
            l.action === 'claim' && l.details?.result === 'forfeited'
          );
          if (forfeitLog) {
            setPlayerEmoji({ playerId: forfeitLog.playerId, emoji: '😢' });
          }
          // Star emoji on auto-claim
          const autoClaimLog = newLogs.find(l => l.action === 'auto_claim');
          if (autoClaimLog) {
            setPlayerEmoji({ playerId: autoClaimLog.playerId, emoji: '⭐' });
          }
        }
        prevLogCount.current = data.logs.length;
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
  // Claims are now automatic when a player collects all 6 cards
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
      <header className="bg-black/30 backdrop-blur-sm px-2 sm:px-4 py-2 sm:py-2.5 flex items-center justify-between gap-2 border-b border-white/5">
        <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
          <h1 className="text-amber-400 font-bold text-base sm:text-lg tracking-tight">Literature</h1>
          <span className="text-slate-600 text-[10px] sm:text-xs font-mono bg-black/20 px-1.5 sm:px-2 py-0.5 rounded-md border border-white/5">#{game.code}</span>
        </div>
        <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
          <button
            onClick={() => setShowRules(true)}
            className="rules-btn"
            title="Game Rules"
          >
            <span>?</span>
          </button>
          <button
            onClick={() => setShowProfileEdit(true)}
            className="profile-btn"
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
          {isMyTurn ? "Your turn - ask for a card" : `Waiting for ${turnPlayer?.name || '...'}...`}
        </div>
      )}

      {/* Action Alert */}
      <ActionAlert alert={actionAlert} onDismiss={() => setActionAlert(null)} />

      {/* Error */}
      {error && (
        <div className="bg-red-900/30 px-4 py-2 text-center text-red-300 text-sm cursor-pointer border-b border-red-800/20" onClick={() => setError('')}>
          {error} (click to dismiss)
        </div>
      )}

      <div className="flex-1 flex flex-col lg:flex-row gap-2 sm:gap-3 p-2 sm:p-3 lg:p-4 overflow-hidden">
        {/* Main Game Area */}
        <div className="flex-1 flex flex-col gap-2 sm:gap-3 min-w-0">
          {/* Player Strip */}
          <PlayerStrip game={game} playerEmoji={playerEmoji} />

          {/* My Cards */}
          <div className="panel-section p-2.5 sm:p-4 flex-shrink-0">
            <div className="text-[10px] sm:text-xs text-slate-500 mb-2 sm:mb-3 font-semibold tracking-wide uppercase">Your Cards ({sorted.length})</div>
            <div ref={cardsRef} className="flex gap-1 sm:gap-1.5 flex-wrap justify-center">
              {sorted.length > 0 ? (
                Object.entries(cardsBySuit).map(([suit, cards], i) => (
                  <div key={suit} className="flex gap-1 sm:gap-1.5 items-center">
                    {i > 0 && <div className="w-px h-10 sm:h-12 bg-white/5 mx-0.5 sm:mx-1" />}
                    {cards.map(c => <CardView key={c} card={c} />)}
                  </div>
                ))
              ) : (
                <div className="text-slate-600 text-sm py-4 sm:py-6">No cards in hand</div>
              )}
            </div>
          </div>

          {/* Action Buttons */}
          {game.status === 'playing' && isMyTurn && (
            <div ref={actionBtnsRef} className="flex gap-2 sm:gap-3 justify-center px-1">
              <button
                onClick={() => setShowAsk(true)}
                disabled={!canAsk}
                className="btn-primary px-4 sm:px-8 py-2.5 sm:py-3 text-sm sm:text-lg flex-1 sm:flex-none"
              >
                Ask for a Card
              </button>
            </div>
          )}

          {/* Game Log */}
          <div className="panel-section p-3 flex-1 min-h-0 overflow-hidden flex flex-col">
            <div className="text-xs text-slate-500 mb-2 font-semibold tracking-wide uppercase">
              {game.showLog ? 'Game Log' : 'Recent Activity'}
            </div>
            <div className="overflow-y-auto flex-1 space-y-1 text-xs game-log">
              {game.logs.map((log, i) => {
                const icon = getLogIcon(log.action);
                const logCard = log.details?.card as string | undefined;
                const isSuccess = log.action === 'ask_success' || log.action === 'claim' || log.action === 'auto_claim';
                const isFail = log.action === 'ask_fail' || (log.action === 'claim' && log.details?.result === 'forfeited');
                return (
                  <div key={i} className={`flex items-center gap-2 py-1.5 border-b border-white/5 ${isSuccess ? 'text-green-400/80' : isFail ? 'text-red-400/70' : 'text-slate-500'}`}>
                    <span className="text-base flex-shrink-0">{icon}</span>
                    {logCard && (
                      <span className="flex-shrink-0">
                        <CardView card={logCard} small />
                      </span>
                    )}
                    <span className="leading-snug">{log.details?.message || log.action}</span>
                  </div>
                );
              })}
              {game.logs.length === 0 && <div className="text-slate-700">No actions yet</div>}
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="lg:w-80 flex flex-col gap-2 sm:gap-3 flex-shrink-0">
          {/* Claimed Sets */}
          <div className="panel-section p-2.5 sm:p-3">
            <div className="text-[10px] sm:text-xs text-amber-400/70 mb-2 font-semibold tracking-wide uppercase">Claimed Sets ({game.claims.length}/8)</div>
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
        </div>
      </div>

      {/* Dialogs */}
      {showRules && <RulesSidebar onClose={() => setShowRules(false)} />}
      {showAsk && <AskDialog game={game} onClose={() => setShowAsk(false)} onAsk={handleAsk} />}
      {showProfileEdit && (
        <ProfileEditDialog
          currentName={myName}
          currentAvatar={myAvatar}
          soundEnabled={soundOn}
          onClose={() => setShowProfileEdit(false)}
          onSave={(name, avatar) => {
            setMyName(name);
            setMyAvatar(avatar);
            prevUpdatedAt.current = '';
            fetchGame();
          }}
          onToggleSound={() => {
            const newVal = !soundOn;
            setSoundOn(newVal);
            setSoundEnabled(newVal);
          }}
        />
      )}
    </div>
  );
}

// ─── Action Alert ────────────────────────────────────
interface ActionAlertData {
  message: string;
  card?: string;
  type?: 'ask_success' | 'ask_fail' | 'claim' | 'auto_claim' | 'game_over' | string;
}

function ActionAlert({ alert, onDismiss }: { alert: ActionAlertData | null; onDismiss: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!alert?.message || !ref.current) return;
    gsap.fromTo(ref.current,
      { y: -30, opacity: 0, scale: 0.95 },
      { y: 0, opacity: 1, scale: 1, duration: 0.4, ease: 'back.out(1.5)' }
    );
    if (progressRef.current) {
      gsap.fromTo(progressRef.current,
        { scaleX: 1 },
        { scaleX: 0, duration: 10, ease: 'none' }
      );
    }
    const timer = setTimeout(() => {
      if (ref.current) {
        gsap.to(ref.current, {
          y: -20, opacity: 0, scale: 0.95, duration: 0.3, ease: 'power2.in',
          onComplete: onDismiss,
        });
      } else {
        onDismiss();
      }
    }, 10000);
    return () => clearTimeout(timer);
  }, [alert, onDismiss]);

  if (!alert?.message) return null;

  const isSuccess = alert.type === 'ask_success' || alert.type === 'claim' || alert.type === 'auto_claim';
  const isFail = alert.type === 'ask_fail';
  const borderColor = isSuccess ? 'border-green-500/30' : isFail ? 'border-red-500/30' : 'border-amber-500/20';
  const icon = alert.type === 'ask_success' ? '🃏' : alert.type === 'ask_fail' ? '✋' : alert.type === 'claim' || alert.type === 'auto_claim' ? '🏆' : '';

  return (
    <div className="fixed top-2 sm:top-4 left-1/2 -translate-x-1/2 z-40 w-[calc(100%-1rem)] sm:w-auto sm:max-w-lg pointer-events-auto">
      <div ref={ref} className={`action-alert glass-panel rounded-xl px-4 sm:px-8 py-4 sm:py-5 text-center shadow-2xl ${borderColor} border relative overflow-hidden`}>
        <div className="flex items-center justify-center gap-3">
          {icon && <span className="text-2xl sm:text-3xl">{icon}</span>}
          {alert.card && (
            <div className="flex-shrink-0">
              <CardView card={alert.card} small />
            </div>
          )}
          <div className={`text-base sm:text-lg font-bold ${isSuccess ? 'text-green-300' : isFail ? 'text-red-300' : 'text-amber-200'}`}>
            {alert.message}
          </div>
        </div>
        <div ref={progressRef} className={`absolute bottom-0 left-0 right-0 h-0.5 ${isSuccess ? 'bg-green-400/40' : isFail ? 'bg-red-400/40' : 'bg-amber-400/40'} origin-left`} />
      </div>
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
      <div ref={panelRef} className="glass-panel rounded-2xl p-5 sm:p-8 max-w-lg w-full" style={{ opacity: 0 }}>
        <h1 className="text-2xl sm:text-3xl font-bold text-center mb-2 title-shimmer">Literature</h1>
        <p className="text-center text-slate-500 mb-4 sm:mb-6 text-sm">Set up your profile to join</p>
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
      <div ref={panelRef} className="glass-panel rounded-2xl p-5 sm:p-8 max-w-xl w-full" style={{ opacity: 0 }}>
        <h1 className="text-2xl sm:text-3xl font-bold title-shimmer text-center mb-1">Game Lobby</h1>
        <p className="text-center text-slate-600 text-xs mb-4 sm:mb-5 tracking-wide">{game.maxPlayers}-player game</p>

        {/* Game Code */}
        <div className="text-center mb-4 sm:mb-6">
          <div className="text-slate-500 text-xs sm:text-sm mb-1.5">Share this code:</div>
          <div className="text-3xl sm:text-4xl font-mono font-bold text-white tracking-[0.3em] panel-section py-2.5 sm:py-3 select-all rounded-xl">
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
