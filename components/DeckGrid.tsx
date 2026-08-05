'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { Deck, Folder } from '@/lib/types';
import MoveDialog from '@/components/MoveDialog';

const DECK_DND_TYPE = 'application/x-deck-id';

export default function DeckGrid({
  decks,
  folders,
  currentId,
}: {
  decks: Deck[];
  folders: Folder[];
  currentId: string | null;
}) {
  const router = useRouter();
  const [movingDeck, setMovingDeck] = useState<Deck | null>(null);
  void currentId; // 현재 폴더 컨텍스트 — 향후 사용 예정, 지금은 그리드에서 직접 쓰지 않음

  async function rename(deck: Deck) {
    const title = window.prompt('제목 변경', deck.title);
    if (!title?.trim() || title === deck.title) return;
    const res = await fetch(`/api/decks/${deck.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title }),
    });
    if (!res.ok) {
      alert('변경 실패');
      return;
    }
    router.refresh();
  }

  async function remove(deck: Deck) {
    if (!window.confirm(`"${deck.title}" 덱을 삭제할까요?`)) return;
    const res = await fetch(`/api/decks/${deck.id}`, { method: 'DELETE' });
    if (!res.ok) {
      alert('삭제 실패');
      return;
    }
    router.refresh();
  }

  if (decks.length === 0) {
    return <div className="flex flex-1 items-center justify-center text-gray-400">이 폴더에 덱이 없습니다.</div>;
  }

  return (
    <div className="grid flex-1 grid-cols-[repeat(auto-fill,minmax(200px,1fr))] content-start gap-4 overflow-y-auto p-4">
      {decks.map((deck) => (
        <div
          key={deck.id}
          draggable
          onDragStart={(e) => {
            e.dataTransfer.setData(DECK_DND_TYPE, deck.id);
            e.dataTransfer.effectAllowed = 'move';
          }}
          className="group flex cursor-grab flex-col rounded-lg border bg-white p-3 shadow-sm active:cursor-grabbing"
        >
          <Link href={`/deck/${deck.id}`} draggable={false} className="mb-2 flex h-24 items-center justify-center rounded bg-gray-100 text-3xl">
            🖥
          </Link>
          <div className="truncate text-sm font-medium" title={deck.title}>{deck.title}</div>
          <div className="mt-2 flex flex-wrap gap-2 text-xs text-gray-500">
            <Link href={`/deck/${deck.id}`} className="hover:text-black">열기</Link>
            <a href={`/api/decks/${deck.id}/download`} className="hover:text-black">다운로드</a>
            <button onClick={() => rename(deck)} className="hover:text-black">이름변경</button>
            <button onClick={() => setMovingDeck(deck)} className="hover:text-black">이동</button>
            <button onClick={() => remove(deck)} className="hover:text-black">삭제</button>
          </div>
        </div>
      ))}
      {movingDeck && (
        <MoveDialog deckId={movingDeck.id} folders={folders} onClose={() => setMovingDeck(null)} />
      )}
    </div>
  );
}
