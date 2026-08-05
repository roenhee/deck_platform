import Link from 'next/link';
import { supabaseAdmin } from '@/lib/supabase';
import { pathToRoot } from '@/lib/tree';
import type { Deck, Folder } from '@/lib/types';
import FolderTree from '@/components/FolderTree';
import DeckGrid from '@/components/DeckGrid';
import UploadButton from '@/components/UploadButton';

export const dynamic = 'force-dynamic';

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ folderId?: string }>;
}) {
  const { folderId } = await searchParams;
  const current = folderId ?? null;
  const sb = supabaseAdmin();

  const foldersQuery = sb.from('folders').select('*').order('name');
  const decksQuery = current
    ? sb.from('decks').select('*').eq('folder_id', current).order('created_at', { ascending: false })
    : sb.from('decks').select('*').is('folder_id', null).order('created_at', { ascending: false });

  const [{ data: folders }, { data: decks }] = await Promise.all([foldersQuery, decksQuery]);
  const allFolders = (folders ?? []) as Folder[];
  const deckList = (decks ?? []) as Deck[];
  const crumbs = pathToRoot(allFolders, current);

  return (
    <div className="flex h-screen">
      <FolderTree folders={allFolders} currentId={current} />
      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center gap-2 border-b px-4">
          <nav className="flex min-w-0 items-center gap-1 truncate text-sm text-gray-600">
            <Link href="/" className="hover:underline">루트</Link>
            {crumbs.map((c) => (
              <span key={c.id} className="flex items-center gap-1">
                <span className="text-gray-300">/</span>
                <Link href={`/?folderId=${c.id}`} className="hover:underline">{c.name}</Link>
              </span>
            ))}
          </nav>
          <div className="flex-1" />
          <UploadButton folderId={current} />
        </header>
        <DeckGrid decks={deckList} folders={allFolders} currentId={current} />
      </main>
    </div>
  );
}
