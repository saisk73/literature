import { NextRequest, NextResponse } from 'next/server';
import { getVisitorId } from '@/lib/auth';
import { getDb } from '@/lib/db';

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
  });
}

export async function POST(request: NextRequest) {
  const visitorId = await getVisitorId();
  if (!visitorId) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { name } = await request.json();
  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    return NextResponse.json({ error: 'Name is required' }, { status: 400 });
  }

  const displayName = name.trim().slice(0, 20);
  const db = await getDb();

  await db.collection('users').updateOne(
    { _id: visitorId as any },
    { $set: { display_name: displayName }, $setOnInsert: { created_at: new Date() } },
    { upsert: true }
  );

  return NextResponse.json({ visitorId, name: displayName });
}
