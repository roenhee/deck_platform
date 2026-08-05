import { NextResponse, type NextRequest } from 'next/server';
import { supabaseAdmin, DECKS_BUCKET } from '@/lib/supabase';

export const runtime = 'nodejs';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sb = supabaseAdmin();

  const { data: deck, error } = await sb.from('decks').select('storage_path').eq('id', id).single();
  if (error || !deck) return new NextResponse('Not found', { status: 404 });

  const { data, error: dlErr } = await sb.storage.from(DECKS_BUCKET).download(deck.storage_path);
  if (dlErr || !data) return new NextResponse('Not found', { status: 404 });

  return new NextResponse(data, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Security-Policy': "sandbox allow-scripts;",
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, no-store',
    },
  });
}
