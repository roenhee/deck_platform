import { NextResponse, type NextRequest } from 'next/server';
import { supabaseAdmin, DECKS_BUCKET } from '@/lib/supabase';

export const runtime = 'nodejs';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (typeof body?.title === 'string') {
    if (!body.title.trim()) return NextResponse.json({ error: 'title empty' }, { status: 400 });
    patch.title = body.title.trim();
  }
  if ('folderId' in (body ?? {})) patch.folder_id = body.folderId ?? null;

  if (Object.keys(patch).length === 1) {
    return NextResponse.json({ error: 'nothing to update' }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin().from('decks').update(patch).eq('id', id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ deck: data });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sb = supabaseAdmin();

  const { data: deck, error: e1 } = await sb.from('decks').select('storage_path').eq('id', id).single();
  if (e1 || !deck) return NextResponse.json({ error: 'not found' }, { status: 404 });

  // Storage 먼저 지워 고아 파일 방지. 실패 시 행은 남긴다(일관성).
  const { error: e2 } = await sb.storage.from(DECKS_BUCKET).remove([deck.storage_path]);
  if (e2) return NextResponse.json({ error: e2.message }, { status: 500 });

  const { error: e3 } = await sb.from('decks').delete().eq('id', id);
  if (e3) return NextResponse.json({ error: e3.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
