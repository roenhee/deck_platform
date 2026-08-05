import type { Folder, TreeNode } from './types';

export function buildTree(folders: Folder[]): TreeNode[] {
  const byId = new Map<string, TreeNode>();
  for (const folder of folders) byId.set(folder.id, { ...folder, children: [] });

  const roots: TreeNode[] = [];
  for (const node of byId.values()) {
    const parent = node.parent_id ? byId.get(node.parent_id) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }

  const sortRec = (nodes: TreeNode[]) => {
    nodes.sort((a, b) => a.name.localeCompare(b.name));
    for (const n of nodes) sortRec(n.children);
  };
  sortRec(roots);
  return roots;
}

// movingId 폴더를 newParentId 아래로 옮기면 순환이 생기는가?
// newParentId에서 위로 거슬러 올라가다 movingId를 만나면 순환.
export function wouldCreateCycle(
  folders: Folder[],
  movingId: string,
  newParentId: string | null,
): boolean {
  if (newParentId === null) return false;
  const byId = new Map<string, Folder>(folders.map((f) => [f.id, f]));
  let cur: string | null = newParentId;
  const seen = new Set<string>();
  while (cur) {
    if (cur === movingId) return true;
    if (seen.has(cur)) break; // 기존 데이터 손상 방어
    seen.add(cur);
    cur = byId.get(cur)?.parent_id ?? null;
  }
  return false;
}

// breadcrumb용: 루트부터 id까지 (자기 자신 포함)
export function pathToRoot(folders: Folder[], id: string | null): Folder[] {
  if (!id) return [];
  const byId = new Map<string, Folder>(folders.map((f) => [f.id, f]));
  const path: Folder[] = [];
  let cur: string | null = id;
  const seen = new Set<string>();
  while (cur && byId.has(cur) && !seen.has(cur)) {
    seen.add(cur);
    const folder: Folder = byId.get(cur)!;
    path.unshift(folder);
    cur = folder.parent_id;
  }
  return path;
}
