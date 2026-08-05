import { notFound } from 'next/navigation';
import { supabaseAdmin } from '@/lib/supabase';
import DeckViewer from '@/components/DeckViewer';

export const dynamic = 'force-dynamic';

export default async function DeckPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { data: deck } = await supabaseAdmin().from('decks').select('id, title').eq('id', id).single();
  if (!deck) notFound();
  return <DeckViewer id={deck.id} title={deck.title} />;
}
