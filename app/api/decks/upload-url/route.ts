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

  // data.signedUrl은 이미 절대 URL(https://.../storage/v1/object/upload/sign/...?token=...)이다.
  // 클라이언트는 이 URL로 anon key 없이 raw PUT 업로드가 가능하다.
  return NextResponse.json({ deckId, path, uploadUrl: data.signedUrl });
}
