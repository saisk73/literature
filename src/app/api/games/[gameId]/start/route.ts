import { NextRequest, NextResponse } from 'next/server';
import { getVisitorId } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { createDeck, shuffleDeck } from '@/lib/game-logic';

export async function POST(
  _request: NextRequest,
  { params }: { params: { gameId: string } }
) {
  const visitorId = await getVisitorId();
  if (!visitorId) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const db = await getDb();
  const game = await db.collection('games').findOne({
    $or: [{ code: params.gameId }, { _id: params.gameId as any }],
  });

  if (!game) {
    return NextResponse.json({ error: 'Game not found' }, { status: 404 });
  }
  if (game.created_by !== visitorId) {
    return NextResponse.json({ error: 'Only the host can start the game' }, { status: 403 });
  }
  if (game.status !== 'waiting') {
    return NextResponse.json({ error: 'Game already started' }, { status: 400 });
  }

  const players = await db
    .collection('game_players')
    .find({ game_id: game._id })
    .sort({ seat_position: 1 })
    .toArray();

  if (players.length !== game.max_players) {
    return NextResponse.json({ error: `Need exactly ${game.max_players} players to start` }, { status: 400 });
  }

  const deck = shuffleDeck(createDeck());

  // Deal cards
  const cardDocs = deck.map((card, i) => ({
    game_id: game._id,
    card,
    holder_id: players[i % players.length].player_id,
  }));

  await db.collection('game_cards').insertMany(cardDocs);

  await db.collection('games').updateOne(
    { _id: game._id },
    {
      $set: {
        status: 'playing',
        current_turn_player_id: players[0].player_id,
        updated_at: new Date(),
      },
    }
  );

  await db.collection('game_log').insertOne({
    game_id: game._id,
    action: 'game_started',
    player_id: visitorId,
    details: { message: 'Game started! Cards have been dealt.' },
    created_at: new Date(),
  });

  return NextResponse.json({ ok: true });
}
