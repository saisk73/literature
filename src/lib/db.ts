import { MongoClient, Db } from 'mongodb';

const MONGODB_URI = process.env.DB_URL!;
const MONGODB_DB = process.env.MONGODB_DB || 'literature';

if (!MONGODB_URI) {
  throw new Error('DB_URL environment variable is not set');
}

let cachedClient: MongoClient | null = null;
let cachedDb: Db | null = null;

export async function getDb(): Promise<Db> {
  if (cachedDb) return cachedDb;

  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  const db = client.db(MONGODB_DB);

  await Promise.all([
    db.collection('games').createIndex({ code: 1 }, { unique: true }),
    db.collection('game_players').createIndex({ game_id: 1, player_id: 1 }, { unique: true }),
    db.collection('game_cards').createIndex({ game_id: 1, card: 1 }, { unique: true }),
    db.collection('game_cards').createIndex({ game_id: 1, holder_id: 1 }),
    db.collection('game_claims').createIndex({ game_id: 1, half_suit: 1 }),
    db.collection('game_log').createIndex({ game_id: 1 }),
  ]);

  cachedClient = client;
  cachedDb = db;
  return db;
}
