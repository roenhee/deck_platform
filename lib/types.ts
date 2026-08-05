export type Folder = {
  id: string;
  name: string;
  parent_id: string | null;
  created_at: string;
};

export type Deck = {
  id: string;
  title: string;
  folder_id: string | null;
  storage_path: string;
  original_filename: string | null;
  file_size: number | null;
  created_at: string;
  updated_at: string;
};

export type TreeNode = Folder & { children: TreeNode[] };
