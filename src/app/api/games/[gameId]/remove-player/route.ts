import { NextRequest, NextResponse } from 'next/server';
import { getVisitorId } from '@/lib/auth';
import { getDb } from '@/lib/db';

export async function POST(
  request: NextRequest,
  { params }: { params: { gameId: string } }
) {
  const visitorId = await getVisitorId();
  if (!visitorId) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { playerId } = await request.json();
  if (!playerId) {
    return NextResponse.json({ error: 'Player ID is required' }, { status: 400 });
  }

  const db = await getDb();

  const game = await db.collection('games').findOne({
    $or: [{ code: params.gameId }, { _id: params.gameId as any }],
  });

  if (!game) {
    return NextResponse.json({ error: 'Game not found' }, { status: 404 });
  }

  if (game.created_by !== visitorId) {
    return NextResponse.json({ error: 'Only the host can remove players' }, { status: 403 });
  }

  if (game.status !== 'waiting') {
    return NextResponse.json({ error: 'Cannot remove players after game has started' }, { status: 400 });
  }

  if (playerId === visitorId) {
    return NextResponse.json({ error: 'Cannot remove yourself' }, { status: 400 });
  }

  const result = await db.collection('game_players').deleteOne({
    game_id: game._id,
    player_id: playerId,
  });

  if (result.deletedCount === 0) {
    return NextResponse.json({ error: 'Player not found in game' }, { status: 404 });
  }

  // Re-assign seat positions to keep them sequential
  const remainingPlayers = await db.collection('game_players')
    .find({ game_id: game._id })
    .sort({ seat_position: 1 })
    .toArray();

  for (let i = 0; i < remainingPlayers.length; i++) {
    if (remainingPlayers[i].seat_position !== i) {
      await db.collection('game_players').updateOne(
        { _id: remainingPlayers[i]._id },
        { $set: { seat_position: i } }
      );
    }
  }

  await db.collection('games').updateOne(
    { _id: game._id },
    { $set: { updated_at: new Date() } }
  );

  return NextResponse.json({ ok: true });
}
