import { NextResponse, type NextRequest } from 'next/server';
import { randomUUID } from 'crypto';
import { supabaseAdmin, DECKS_BUCKET, storagePathFor } from '@/lib/supabase';

export const runtime = 'nodejs';

const MAX_SIZE = 50 * 1024 * 1024; // 50MB

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { filename, size } = body ?? {};

  if (typeof filename !== 'string' || !filename.toLowerCase().endsWith('.html')) {
    return NextResponse.json({ error: 'only .html allowed' }, { status: 400 });
  }
  if (typeof size !== 'number' || size <= 0 || size > MAX_SIZE) {
    return NextResponse.json({ error: 'invalid size (max 50MB)' }, { status: 400 });
  }

  const deckId = randomUUID();
  const path = storagePathFor(deckId);
  const { data, error } = await supabaseAdmin()
    .storage.from(DECKS_BUCKET)
    .createSignedUploadUrl(path);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // data.signedUrl은 경로. 절대 URL로 만들어 클라이언트가 raw PUT 할 수 있게 한다(anon key 불필요).
  const uploadUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}${data.signedUrl}`;
  return NextResponse.json({ deckId, path, uploadUrl });
}
