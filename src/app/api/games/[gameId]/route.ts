import { NextRequest, NextResponse } from 'next/server';
import { getVisitorId } from '@/lib/auth';
import { getDb } from '@/lib/db';

export async function GET(
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

  const players = await db
    .collection('game_players')
    .aggregate([
      { $match: { game_id: game._id } },
      {
        $lookup: {
          from: 'users',
          localField: 'player_id',
          foreignField: '_id',
          as: 'user',
        },
      },
      { $unwind: '$user' },
      {
        $project: {
          player_id: 1,
          team: 1,
          seat_position: 1,
          display_name: '$user.display_name',
        },
      },
      { $sort: { seat_position: 1 } },
    ])
    .toArray();

  const isPlayer = players.some((p) => p.player_id === visitorId);

  const allCards = await db
    .collection('game_cards')
    .find({ game_id: game._id })
    .toArray();

  const myCards = allCards.filter((c) => c.holder_id === visitorId).map((c) => c.card);
  const cardCounts: Record<string, number> = {};
  for (const p of players) {
    cardCounts[p.player_id] = allCards.filter((c) => c.holder_id === p.player_id).length;
  }

  const claims = await db
    .collection('game_claims')
    .find({ game_id: game._id })
    .toArray();

  const logs = await db
    .collection('game_log')
    .find({ game_id: game._id })
    .sort({ _id: -1 })
    .limit(50)
    .toArray();

  const team1Cards = players
    .filter((p) => p.team === 1)
    .reduce((sum, p) => sum + (cardCounts[p.player_id] || 0), 0);
  const team2Cards = players
    .filter((p) => p.team === 2)
    .reduce((sum, p) => sum + (cardCounts[p.player_id] || 0), 0);

  let endgameTeam: number | null = null;
  if (game.status === 'playing') {
    if (team1Cards === 0 && team2Cards > 0) endgameTeam = 2;
    else if (team2Cards === 0 && team1Cards > 0) endgameTeam = 1;
  }

  return NextResponse.json({
    id: game._id,
    code: game.code,
    status: game.status,
    maxPlayers: game.max_players,
    currentTurnPlayerId: game.current_turn_player_id,
    createdBy: game.created_by,
    team1Score: game.team1_score,
    team2Score: game.team2_score,
    winner: game.winner,
    showLog: game.show_log !== false,
    updatedAt: game.updated_at,
    isPlayer,
    myPlayerId: visitorId,
    myCards,
    endgameTeam,
    players: players.map((p) => ({
      id: p.player_id,
      name: p.display_name,
      team: p.team,
      seatPosition: p.seat_position,
      cardCount: cardCounts[p.player_id] || 0,
    })),
    claims: claims.map((c) => ({
      half_suit: c.half_suit,
      claimed_by_team: c.claimed_by_team,
    })),
    logs: logs.map((l) => ({
      action: l.action,
      playerId: l.player_id,
      details: l.details ? (typeof l.details === 'string' ? JSON.parse(l.details) : l.details) : null,
      createdAt: l.created_at,
    })),
  });
}
