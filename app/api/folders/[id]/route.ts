import { NextResponse, type NextRequest } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { wouldCreateCycle } from '@/lib/tree';
import type { Folder } from '@/lib/types';

export const runtime = 'nodejs';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const patch: Record<string, unknown> = {};

  if (typeof body?.name === 'string') {
    if (!body.name.trim()) return NextResponse.json({ error: 'name empty' }, { status: 400 });
    patch.name = body.name.trim();
  }

  if ('parentId' in (body ?? {})) {
    const newParent: string | null = body.parentId ?? null;
    const { data: folders, error } = await supabaseAdmin().from('folders').select('*');
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (wouldCreateCycle(folders as Folder[], id, newParent)) {
      return NextResponse.json({ error: 'circular move' }, { status: 400 });
    }
    patch.parent_id = newParent;
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'nothing to update' }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin().from('folders').update(patch).eq('id', id).select().single();
  if (error) {
    const status = error.code === '23505' ? 409 : 500;
    return NextResponse.json({ error: error.message }, { status });
  }
  return NextResponse.json({ folder: data });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // 하위 폴더는 DB cascade, 소속 덱은 on delete set null(=루트)로 자동 이동
  const { error } = await supabaseAdmin().from('folders').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
