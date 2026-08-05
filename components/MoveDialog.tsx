'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Folder, TreeNode } from '@/lib/types';
import { buildTree } from '@/lib/tree';

export default function MoveDialog({
  deckId,
  folders,
  onClose,
}: {
  deckId: string;
  folders: Folder[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const tree = buildTree(folders);

  async function moveTo(folderId: string | null) {
    setSaving(true);
    const res = await fetch(`/api/decks/${deckId}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ folderId }),
    });
    setSaving(false);
    if (!res.ok) {
      alert('이동 실패');
      return;
    }
    onClose();
    router.refresh();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="max-h-[70vh] w-80 overflow-y-auto rounded-lg bg-white p-4 shadow-lg" onClick={(e) => e.stopPropagation()}>
        <h2 className="mb-3 text-sm font-semibold">이동할 폴더 선택</h2>
        <button
          onClick={() => moveTo(null)}
          disabled={saving}
          className="mb-1 block w-full rounded px-2 py-1 text-left text-sm hover:bg-gray-100"
        >
          📁 루트
        </button>
        <MoveTree nodes={tree} depth={0} onPick={moveTo} disabled={saving} />
        <button onClick={onClose} className="mt-3 w-full rounded border py-1 text-sm">취소</button>
      </div>
    </div>
  );
}

function MoveTree({
  nodes,
  depth,
  onPick,
  disabled,
}: {
  nodes: TreeNode[];
  depth: number;
  onPick: (id: string) => void;
  disabled: boolean;
}) {
  return (
    <>
      {nodes.map((node) => (
        <div key={node.id}>
          <button
            onClick={() => onPick(node.id)}
            disabled={disabled}
            className="block w-full truncate rounded px-2 py-1 text-left text-sm hover:bg-gray-100"
            style={{ paddingLeft: `${depth * 12 + 8}px` }}
          >
            {node.name}
          </button>
          {node.children.length > 0 && (
            <MoveTree nodes={node.children} depth={depth + 1} onPick={onPick} disabled={disabled} />
          )}
        </div>
      ))}
    </>
  );
}
