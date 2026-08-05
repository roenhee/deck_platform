import { NextResponse, type NextRequest } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const folderId = req.nextUrl.searchParams.get('folderId');
  const base = supabaseAdmin().from('decks').select('*').order('created_at', { ascending: false });
  const { data, error } = await (folderId ? base.eq('folder_id', folderId) : base.is('folder_id', null));
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ decks: data });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { title, folderId, deckId, storagePath, originalFilename, fileSize } = body ?? {};
  if (
    typeof title !== 'string' || !title.trim() ||
    typeof deckId !== 'string' ||
    typeof storagePath !== 'string'
  ) {
    return NextResponse.json({ error: 'invalid payload' }, { status: 400 });
  }
  const { data, error } = await supabaseAdmin()
    .from('decks')
    .insert({
      id: deckId,
      title: title.trim(),
      folder_id: folderId ?? null,
      storage_path: storagePath,
      original_filename: originalFilename ?? null,
      file_size: fileSize ?? null,
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ deck: data }, { status: 201 });
}
