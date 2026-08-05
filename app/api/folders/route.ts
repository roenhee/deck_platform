import { NextResponse, type NextRequest } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export const runtime = 'nodejs';

export async function GET() {
  const { data, error } = await supabaseAdmin().from('folders').select('*').order('name');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ folders: data });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const name = body?.name;
  if (typeof name !== 'string' || !name.trim()) {
    return NextResponse.json({ error: 'name required' }, { status: 400 });
  }
  const { data, error } = await supabaseAdmin()
    .from('folders')
    .insert({ name: name.trim(), parent_id: body?.parentId ?? null })
    .select()
    .single();
  if (error) {
    const status = error.code === '23505' ? 409 : 500; // unique_violation
    return NextResponse.json({ error: error.message }, { status });
  }
  return NextResponse.json({ folder: data }, { status: 201 });
}
