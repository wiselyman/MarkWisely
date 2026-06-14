import { ChevronDown, ChevronRight, FileText, Folder } from 'lucide-react';
import { useState } from 'react';
import type { FileTreeNode } from '../lib/tauri';

type FileTreeProps = {
  tree: FileTreeNode | null;
  activePath: string | null;
  onOpenFile: (path: string) => void | Promise<void>;
};

export function FileTree({ tree, activePath, onOpenFile }: FileTreeProps) {
  if (!tree) {
    return <div className="empty-panel">No folder open.</div>;
  }

  return (
    <div className="file-tree" role="tree">
      <TreeNode node={tree} activePath={activePath} onOpenFile={onOpenFile} depth={0} defaultOpen />
    </div>
  );
}

type TreeNodeProps = {
  node: FileTreeNode;
  activePath: string | null;
  depth: number;
  defaultOpen?: boolean;
  onOpenFile: (path: string) => void | Promise<void>;
};

function TreeNode({ node, activePath, depth, defaultOpen = false, onOpenFile }: TreeNodeProps) {
  const [open, setOpen] = useState(defaultOpen);
  const isActive = activePath === node.path;

  if (node.isDir) {
    return (
      <div className="tree-branch">
        <button
          className="tree-row"
          style={{ paddingLeft: 8 + depth * 14 }}
          onClick={() => setOpen((value) => !value)}
          type="button"
        >
          {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          <Folder size={15} />
          <span>{node.name}</span>
        </button>
        {open &&
          node.children.map((child) => (
            <TreeNode
              key={child.path}
              node={child}
              activePath={activePath}
              depth={depth + 1}
              onOpenFile={onOpenFile}
            />
          ))}
      </div>
    );
  }

  return (
    <button
      className={`tree-row file ${isActive ? 'active' : ''}`}
      style={{ paddingLeft: 26 + depth * 14 }}
      onClick={() => void onOpenFile(node.path)}
      type="button"
    >
      <FileText size={15} />
      <span>{node.name}</span>
    </button>
  );
}
