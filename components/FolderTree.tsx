'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { Folder, TreeNode } from '@/lib/types';
import { buildTree } from '@/lib/tree';

export default function FolderTree({
  folders,
  currentId,
}: {
  folders: Folder[];
  currentId: string | null;
}) {
  const router = useRouter();
  const tree = buildTree(folders);

  async function createFolder(parentId: string | null) {
    const name = window.prompt('새 폴더 이름');
    if (!name?.trim()) return;
    const res = await fetch('/api/folders', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name, parentId }),
    });
    if (!res.ok) {
      alert('생성 실패 (이름 중복일 수 있음)');
      return;
    }
    router.refresh();
  }

  async function renameFolder(folder: Folder) {
    const name = window.prompt('폴더 이름 변경', folder.name);
    if (!name?.trim() || name === folder.name) return;
    const res = await fetch(`/api/folders/${folder.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    if (!res.ok) {
      alert('변경 실패');
      return;
    }
    router.refresh();
  }

  async function deleteFolder(folder: Folder) {
    if (!window.confirm(`"${folder.name}" 폴더를 삭제할까요? 하위 폴더도 함께 삭제되고, 덱은 루트로 이동합니다.`)) return;
    const res = await fetch(`/api/folders/${folder.id}`, { method: 'DELETE' });
    if (!res.ok) {
      alert('삭제 실패');
      return;
    }
    router.refresh();
  }

  return (
    <aside className="w-64 shrink-0 overflow-y-auto border-r bg-gray-50 p-2 text-sm">
      <div className="flex items-center justify-between px-2 py-1">
        <Link href="/" className={`font-medium ${currentId === null ? 'text-black' : 'text-gray-600'}`}>
          📁 루트
        </Link>
        <button onClick={() => createFolder(null)} title="새 폴더" className="text-gray-500 hover:text-black">＋</button>
      </div>
      <ul>
        {tree.map((node) => (
          <FolderRow
            key={node.id}
            node={node}
            depth={0}
            currentId={currentId}
            onCreate={createFolder}
            onRename={renameFolder}
            onDelete={deleteFolder}
          />
        ))}
      </ul>
    </aside>
  );
}

function FolderRow({
  node,
  depth,
  currentId,
  onCreate,
  onRename,
  onDelete,
}: {
  node: TreeNode;
  depth: number;
  currentId: string | null;
  onCreate: (parentId: string | null) => void;
  onRename: (folder: Folder) => void;
  onDelete: (folder: Folder) => void;
}) {
  const [open, setOpen] = useState(true);
  const hasChildren = node.children.length > 0;

  return (
    <li>
      <div
        className={`group flex items-center gap-1 rounded px-2 py-1 hover:bg-gray-200 ${
          currentId === node.id ? 'bg-gray-200 font-medium' : ''
        }`}
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
      >
        <button
          onClick={() => setOpen((v) => !v)}
          className={`w-4 text-gray-400 ${hasChildren ? '' : 'invisible'}`}
        >
          {open ? '▾' : '▸'}
        </button>
        <Link href={`/?folderId=${node.id}`} className="flex-1 truncate">
          {node.name}
        </Link>
        <span className="hidden gap-1 text-gray-400 group-hover:flex">
          <button onClick={() => onCreate(node.id)} title="하위 폴더">＋</button>
          <button onClick={() => onRename(node)} title="이름 변경">✎</button>
          <button onClick={() => onDelete(node)} title="삭제">🗑</button>
        </span>
      </div>
      {open && hasChildren && (
        <ul>
          {node.children.map((child) => (
            <FolderRow
              key={child.id}
              node={child}
              depth={depth + 1}
              currentId={currentId}
              onCreate={onCreate}
              onRename={onRename}
              onDelete={onDelete}
            />
          ))}
        </ul>
      )}
    </li>
  );
}
