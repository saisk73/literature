# Literature Card Game

## Project Overview
A multiplayer Literature card game built with Next.js 14 (App Router) and MongoDB.

## Tech Stack
- **Framework**: Next.js 14 with App Router
- **Database**: MongoDB (via `mongodb` driver)
- **Auth**: JWT tokens via `jose` (visitor-based, stored in cookies)
- **Styling**: Tailwind CSS
- **Language**: TypeScript

## Project Structure
- `src/lib/db.ts` - MongoDB connection (singleton, uses `DB_URL` from `.env.local`)
- `src/lib/auth.ts` - JWT auth helpers (visitor tokens)
- `src/lib/game-logic.ts` - Card/deck/half-suit logic
- `src/app/api/auth/route.ts` - User auth & name setting
- `src/app/api/games/route.ts` - Create game
- `src/app/api/games/[gameId]/route.ts` - Get game state
- `src/app/api/games/[gameId]/join/route.ts` - Join game
- `src/app/api/games/[gameId]/start/route.ts` - Start game (deal cards)
- `src/app/api/games/[gameId]/ask/route.ts` - Ask for a card
- `src/app/api/games/[gameId]/claim/route.ts` - Claim a half-suit

## MongoDB Collections
- `users` - `{ _id, display_name, created_at }`
- `games` - `{ _id, code, status, max_players, current_turn_player_id, created_by, team1_score, team2_score, winner, created_at, updated_at }`
- `game_players` - `{ game_id, player_id, team, seat_position }`
- `game_cards` - `{ game_id, card, holder_id }`
- `game_claims` - `{ game_id, half_suit, claimed_by_team, claimed_at }`
- `game_log` - `{ game_id, action, player_id, details, created_at }`

## Environment Variables
- `DB_URL` - MongoDB connection string (in `.env.local`)
- `MONGODB_DB` - Database name (defaults to `literature`)
- `JWT_SECRET` - JWT signing secret (optional, has default)

## Development
```bash
npm run dev  # runs on port 4000
```

## Rules
- Never commit `.env` or `.env.local` files
- All DB operations are async (MongoDB driver)
- Game IDs can be looked up by either `_id` or `code`
- Details in `game_log` are stored as objects (not JSON strings)
