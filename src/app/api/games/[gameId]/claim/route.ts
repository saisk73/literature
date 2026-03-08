import { NextRequest, NextResponse } from 'next/server';
import { getVisitorId } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { getHalfSuitCards, getHalfSuitDisplayName, getAllHalfSuits } from '@/lib/game-logic';

export async function POST(
  request: NextRequest,
  { params }: { params: { gameId: string } }
) {
  const visitorId = await getVisitorId();
  if (!visitorId) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { halfSuit, assignments } = await request.json();
  if (!halfSuit || !assignments) {
    return NextResponse.json({ error: 'Missing halfSuit or assignments' }, { status: 400 });
  }

  if (!getAllHalfSuits().includes(halfSuit)) {
    return NextResponse.json({ error: 'Invalid half-suit' }, { status: 400 });
  }

  const db = await getDb();
  const game = await db.collection('games').findOne({
    $or: [{ code: params.gameId }, { _id: params.gameId as any }],
  });

  if (!game) return NextResponse.json({ error: 'Game not found' }, { status: 404 });
  if (game.status !== 'playing') return NextResponse.json({ error: 'Game not in progress' }, { status: 400 });
  if (game.current_turn_player_id !== visitorId) {
    return NextResponse.json({ error: 'Not your turn' }, { status: 400 });
  }

  // Check if half-suit already claimed
  const existingClaim = await db.collection('game_claims').findOne({
    game_id: game._id,
    half_suit: halfSuit,
  });
  if (existingClaim) {
    return NextResponse.json({ error: 'Half-suit already claimed' }, { status: 400 });
  }

  const hsCards = getHalfSuitCards(halfSuit);

  if (Object.keys(assignments).length !== 6) {
    return NextResponse.json({ error: 'Must assign all 6 cards' }, { status: 400 });
  }
  for (const card of hsCards) {
    if (!assignments[card]) {
      return NextResponse.json({ error: `Missing assignment for ${card}` }, { status: 400 });
    }
  }

  const players = await db
    .collection('game_players')
    .find({ game_id: game._id })
    .toArray();

  const claimer = players.find((p) => p.player_id === visitorId)!;
  const claimerTeam = claimer.team;
  const teamPlayerIds = new Set(
    players.filter((p) => p.team === claimerTeam).map((p) => p.player_id)
  );

  for (const playerId of Object.values(assignments) as string[]) {
    if (!teamPlayerIds.has(playerId)) {
      return NextResponse.json({ error: 'Can only assign cards to your team members' }, { status: 400 });
    }
  }

  // Get actual card holders
  const actualCards = await db
    .collection('game_cards')
    .find({ game_id: game._id, card: { $in: hsCards } })
    .toArray();

  const actualMap: Record<string, string> = {};
  for (const c of actualCards) {
    actualMap[c.card] = c.holder_id;
  }

  const claimerUser = await db.collection('users').findOne({ _id: visitorId as any });
  const claimerName = claimerUser?.display_name || '';
  const hsName = getHalfSuitDisplayName(halfSuit);

  // Check if any card is held by opponent
  let opponentHasCard = false;
  for (const card of hsCards) {
    const actualHolder = actualMap[card];
    if (actualHolder && !teamPlayerIds.has(actualHolder)) {
      opponentHasCard = true;
      break;
    }
  }

  let result: 'correct' | 'opponent_wins' | 'forfeited';
  let winningTeam: number | null;

  if (opponentHasCard) {
    result = 'opponent_wins';
    winningTeam = claimerTeam === 1 ? 2 : 1;
  } else {
    let distributionCorrect = true;
    for (const card of hsCards) {
      if (actualMap[card] !== assignments[card]) {
        distributionCorrect = false;
        break;
      }
    }
    if (distributionCorrect) {
      result = 'correct';
      winningTeam = claimerTeam;
    } else {
      result = 'forfeited';
      winningTeam = null;
    }
  }

  // Record the claim
  await db.collection('game_claims').insertOne({
    game_id: game._id,
    half_suit: halfSuit,
    claimed_by_team: winningTeam,
    claimed_at: new Date(),
  });

  // Remove cards from game
  await db.collection('game_cards').deleteMany({
    game_id: game._id,
    card: { $in: hsCards },
  });

  // Update scores
  if (winningTeam === 1) {
    await db.collection('games').updateOne({ _id: game._id }, { $inc: { team1_score: 1 } });
  } else if (winningTeam === 2) {
    await db.collection('games').updateOne({ _id: game._id }, { $inc: { team2_score: 1 } });
  }

  // Check if all 8 half-suits claimed
  const claimCount = await db.collection('game_claims').countDocuments({ game_id: game._id });

  // Find next player with cards for turn
  const nextTurnPlayer = await findNextPlayerWithCards(db, game._id, players, visitorId);

  let logMessage = '';
  if (result === 'correct') {
    logMessage = `${claimerName} correctly claimed ${hsName}! Team ${winningTeam} wins the set.`;
  } else if (result === 'opponent_wins') {
    logMessage = `${claimerName} incorrectly claimed ${hsName}. An opponent holds a card! Team ${winningTeam} wins the set.`;
  } else {
    logMessage = `${claimerName} claimed ${hsName} but got the distribution wrong. Set is forfeited!`;
  }

  await db.collection('game_log').insertOne({
    game_id: game._id,
    action: 'claim',
    player_id: visitorId,
    details: { halfSuit, result, winningTeam, claimerName, message: logMessage },
    created_at: new Date(),
  });

  if (claimCount >= 8) {
    // Game over
    const updatedGame = await db.collection('games').findOne({ _id: game._id });
    const t1 = updatedGame?.team1_score || 0;
    const t2 = updatedGame?.team2_score || 0;
    const winner = t1 > t2 ? 1 : t2 > t1 ? 2 : 0;

    await db.collection('games').updateOne(
      { _id: game._id },
      { $set: { status: 'finished', winner, current_turn_player_id: null, updated_at: new Date() } }
    );

    await db.collection('game_log').insertOne({
      game_id: game._id,
      action: 'game_over',
      player_id: null,
      details: {
        message: winner === 0 ? "Game over! It's a tie!" : `Game over! Team ${winner} wins!`,
        team1Score: t1,
        team2Score: t2,
      },
      created_at: new Date(),
    });
  } else if (nextTurnPlayer) {
    await db.collection('games').updateOne(
      { _id: game._id },
      { $set: { current_turn_player_id: nextTurnPlayer, updated_at: new Date() } }
    );
  } else {
    await db.collection('games').updateOne(
      { _id: game._id },
      { $set: { updated_at: new Date() } }
    );
  }

  return NextResponse.json({ ok: true, result, winningTeam });
}

async function findNextPlayerWithCards(
  db: any,
  gameId: any,
  players: any[],
  currentPlayerId: string
): Promise<string | null> {
  const sorted = [...players].sort((a, b) => a.seat_position - b.seat_position);
  const currentIdx = sorted.findIndex((p) => p.player_id === currentPlayerId);

  for (let i = 1; i <= sorted.length; i++) {
    const nextIdx = (currentIdx + i) % sorted.length;
    const nextPlayer = sorted[nextIdx];
    const cardCount = await db.collection('game_cards').countDocuments({
      game_id: gameId,
      holder_id: nextPlayer.player_id,
    });
    if (cardCount > 0) {
      return nextPlayer.player_id;
    }
  }

  return null;
}
