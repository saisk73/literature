const SUITS = ['H', 'D', 'C', 'S'] as const;
const LOW_RANKS = ['A', '2', '3', '4', '5', '6'] as const;
const HIGH_RANKS = ['8', '9', '10', 'J', 'Q', 'K'] as const;

export function createDeck(): string[] {
  const deck: string[] = [];
  for (const suit of SUITS) {
    for (const rank of LOW_RANKS) deck.push(`${rank}${suit}`);
    for (const rank of HIGH_RANKS) deck.push(`${rank}${suit}`);
  }
  return deck;
}

export function shuffleDeck(deck: string[]): string[] {
  const shuffled = [...deck];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

export function getHalfSuit(card: string): string {
  const suit = card.slice(-1);
  const rank = card.slice(0, -1);
  const isLow = ['A', '2', '3', '4', '5', '6'].includes(rank);
  return `${isLow ? 'low' : 'high'}_${suit}`;
}

export function getHalfSuitCards(halfSuit: string): string[] {
  const parts = halfSuit.split('_');
  const type = parts[0];
  const suit = parts[1];
  const ranks = type === 'low' ? LOW_RANKS : HIGH_RANKS;
  return ranks.map(r => `${r}${suit}`);
}

export function getAllHalfSuits(): string[] {
  const result: string[] = [];
  for (const suit of SUITS) {
    result.push(`low_${suit}`, `high_${suit}`);
  }
  return result;
}

export function getHalfSuitDisplayName(halfSuit: string): string {
  const parts = halfSuit.split('_');
  const type = parts[0];
  const suit = parts[1];
  const suitNames: Record<string, string> = {
    H: 'Hearts', D: 'Diamonds', C: 'Clubs', S: 'Spades'
  };
  const suitSymbols: Record<string, string> = {
    H: '\u2665', D: '\u2666', C: '\u2663', S: '\u2660'
  };
  return `${type === 'low' ? 'Low' : 'High'} ${suitNames[suit]} ${suitSymbols[suit]}`;
}

export function getCardDisplay(card: string): { rank: string; suit: string; symbol: string; isRed: boolean } {
  const suit = card.slice(-1);
  const rank = card.slice(0, -1);
  const symbols: Record<string, string> = {
    H: '\u2665', D: '\u2666', C: '\u2663', S: '\u2660'
  };
  return {
    rank,
    suit,
    symbol: symbols[suit],
    isRed: suit === 'H' || suit === 'D',
  };
}

export function sortCards(cards: string[]): string[] {
  const suitOrder: Record<string, number> = { H: 0, D: 1, C: 2, S: 3 };
  const rankOrder: Record<string, number> = {
    'A': 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6,
    '8': 8, '9': 9, '10': 10, 'J': 11, 'Q': 12, 'K': 13,
  };
  return [...cards].sort((a, b) => {
    const sA = a.slice(-1), sB = b.slice(-1);
    const rA = a.slice(0, -1), rB = b.slice(0, -1);
    if (suitOrder[sA] !== suitOrder[sB]) return suitOrder[sA] - suitOrder[sB];
    return rankOrder[rA] - rankOrder[rB];
  });
}

export function generateGameCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}
