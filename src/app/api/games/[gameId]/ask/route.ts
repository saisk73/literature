import { NextRequest, NextResponse } from 'next/server';
import { getVisitorId } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { getHalfSuit } from '@/lib/game-logic';

export async function POST(
  request: NextRequest,
  { params }: { params: { gameId: string } }
) {
  const visitorId = await getVisitorId();
  if (!visitorId) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { targetPlayerId, card } = await request.json();
  if (!targetPlayerId || !card) {
    return NextResponse.json({ error: 'Missing targetPlayerId or card' }, { status: 400 });
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

  const players = await db
    .collection('game_players')
    .find({ game_id: game._id })
    .toArray();

  const asker = players.find((p) => p.player_id === visitorId)!;
  const target = players.find((p) => p.player_id === targetPlayerId);
  if (!target) return NextResponse.json({ error: 'Target player not found' }, { status: 400 });
  if (target.team === asker.team) {
    return NextResponse.json({ error: 'Cannot ask a teammate' }, { status: 400 });
  }

  // Check endgame: if opponent team has 0 cards, no asking allowed
  const opponentTeam = asker.team === 1 ? 2 : 1;
  const opponentPlayerIds = players.filter((p) => p.team === opponentTeam).map((p) => p.player_id);
  const opponentCardCount = await db.collection('game_cards').countDocuments({
    game_id: game._id,
    holder_id: { $in: opponentPlayerIds },
  });
  if (opponentCardCount === 0) {
    return NextResponse.json({ error: 'Opponents have no cards. You must claim.' }, { status: 400 });
  }

  // Check target has at least one card
  const targetCardCount = await db.collection('game_cards').countDocuments({
    game_id: game._id,
    holder_id: targetPlayerId,
  });
  if (targetCardCount === 0) {
    return NextResponse.json({ error: 'Target player has no cards' }, { status: 400 });
  }

  // Validate: asker must have another card in the same half-suit
  const askerCards = await db
    .collection('game_cards')
    .find({ game_id: game._id, holder_id: visitorId })
    .toArray();
  const askerCardList = askerCards.map((c) => c.card);

  if (askerCardList.includes(card)) {
    return NextResponse.json({ error: 'You already have this card' }, { status: 400 });
  }

  const requestedHalfSuit = getHalfSuit(card);
  const hasCardInHalfSuit = askerCardList.some((c) => getHalfSuit(c) === requestedHalfSuit);
  if (!hasCardInHalfSuit) {
    return NextResponse.json({ error: 'You must hold a card in the same half-suit' }, { status: 400 });
  }

  // Check if target has the card
  const targetHasCard = await db.collection('game_cards').findOne({
    game_id: game._id,
    card,
    holder_id: targetPlayerId,
  });

  const askerUser = await db.collection('users').findOne({ _id: visitorId as any });
  const targetUser = await db.collection('users').findOne({ _id: targetPlayerId as any });
  const askerName = askerUser?.display_name || '';
  const targetName = targetUser?.display_name || '';

  if (targetHasCard) {
    // Transfer card
    await db.collection('game_cards').updateOne(
      { game_id: game._id, card },
      { $set: { holder_id: visitorId } }
    );

    await db.collection('games').updateOne(
      { _id: game._id },
      { $set: { updated_at: new Date() } }
    );

    await db.collection('game_log').insertOne({
      game_id: game._id,
      action: 'ask_success',
      player_id: visitorId,
      details: { target: targetPlayerId, targetName, card, askerName, message: `${askerName} asked ${targetName} for ${card} - Got it!` },
      created_at: new Date(),
    });

    return NextResponse.json({ ok: true, gotCard: true });
  } else {
    // Turn passes to target
    await db.collection('games').updateOne(
      { _id: game._id },
      { $set: { current_turn_player_id: targetPlayerId, updated_at: new Date() } }
    );

    await db.collection('game_log').insertOne({
      game_id: game._id,
      action: 'ask_fail',
      player_id: visitorId,
      details: { target: targetPlayerId, targetName, card, askerName, message: `${askerName} asked ${targetName} for ${card} - Nope!` },
      created_at: new Date(),
    });

    return NextResponse.json({ ok: true, gotCard: false });
  }
}
