import { describe, expect, it } from 'vitest';
import { buildTree, wouldCreateCycle, pathToRoot } from './tree';
import type { Folder } from './types';

const f = (id: string, parent_id: string | null, name = id): Folder => ({
  id, name, parent_id, created_at: '2026-01-01',
});

// A(root) → B → C ,  D(root)
const folders: Folder[] = [f('A', null), f('B', 'A'), f('C', 'B'), f('D', null)];

describe('buildTree', () => {
  it('nests children under parents and returns roots', () => {
    const tree = buildTree(folders);
    expect(tree.map((n) => n.id).sort()).toEqual(['A', 'D']);
    const a = tree.find((n) => n.id === 'A')!;
    expect(a.children.map((n) => n.id)).toEqual(['B']);
    expect(a.children[0].children.map((n) => n.id)).toEqual(['C']);
  });

  it('treats orphan (missing parent) as root', () => {
    const tree = buildTree([f('X', 'GHOST')]);
    expect(tree.map((n) => n.id)).toEqual(['X']);
  });
});

describe('wouldCreateCycle', () => {
  it('true when moving into itself', () => {
    expect(wouldCreateCycle(folders, 'B', 'B')).toBe(true);
  });
  it('true when moving into a descendant', () => {
    expect(wouldCreateCycle(folders, 'A', 'C')).toBe(true);
  });
  it('false when moving into an unrelated folder', () => {
    expect(wouldCreateCycle(folders, 'B', 'D')).toBe(false);
  });
  it('false when moving to root (null)', () => {
    expect(wouldCreateCycle(folders, 'B', null)).toBe(false);
  });
});

describe('pathToRoot', () => {
  it('returns ancestors root-first including self', () => {
    expect(pathToRoot(folders, 'C').map((n) => n.id)).toEqual(['A', 'B', 'C']);
  });
  it('returns empty for null (root view)', () => {
    expect(pathToRoot(folders, null)).toEqual([]);
  });
});
