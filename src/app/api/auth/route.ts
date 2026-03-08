import { NextRequest, NextResponse } from 'next/server';
import { getVisitorId } from '@/lib/auth';
import { getDb } from '@/lib/db';

const ALLOWED_AVATARS = [
  '😀','😎','🤓','🧐','😏','🥳','🤩','😤','🫡','🤠',
  '🦊','🐱','🐶','🦁','🐸','🐵','🦄','🐧','🐼','🐨',
  '🦋','🐝','🐙','🦈','🐉','🦅','🐺','🦖','🐯','🐻',
  '🌟','🔥','💎','🎯','🎲','🎪','⚡','🍀','🎭','🏆',
  '👑','💫','🌸','🎸','🚀','🌊','🎵','🍕','👻','💀',
];

export async function GET() {
  const visitorId = await getVisitorId();
  if (!visitorId) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const db = await getDb();
  const user = await db.collection('users').findOne({ _id: visitorId as any });

  return NextResponse.json({
    visitorId,
    name: user?.display_name || '',
    avatar: user?.avatar || '',
  });
}

export async function POST(request: NextRequest) {
  const visitorId = await getVisitorId();
  if (!visitorId) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const body = await request.json();
  const { name, avatar } = body;

  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    return NextResponse.json({ error: 'Name is required' }, { status: 400 });
  }

  const displayName = name.trim().slice(0, 20);
  const setFields: Record<string, unknown> = { display_name: displayName };

  if (avatar && ALLOWED_AVATARS.includes(avatar)) {
    setFields.avatar = avatar;
  }

  const db = await getDb();

  await db.collection('users').updateOne(
    { _id: visitorId as any },
    { $set: setFields, $setOnInsert: { created_at: new Date() } },
    { upsert: true }
  );

  return NextResponse.json({ visitorId, name: displayName, avatar: setFields.avatar || '' });
}
