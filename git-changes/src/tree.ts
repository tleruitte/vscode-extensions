import type { Change } from "./diff";

export interface Folder {
  kind: "folder";
  /** The path from the root of the repository, with `/`. */
  path: string;
  /** The folders that have only one folder in them share one row, as on GitHub: `src/app`. */
  label: string;
  children: Node[];
}

export interface File {
  kind: "file";
  change: Change;
}

export type Node = Folder | File;

/** The changes as a tree of folders, folders first, then by name. */
export function buildTree(changes: Change[]): Node[] {
  const top: Folder = { kind: "folder", path: "", label: "", children: [] };
  for (const change of changes) {
    const names = change.path.split("/");
    let folder = top;
    for (const name of names.slice(0, -1)) {
      const path = folder.path ? `${folder.path}/${name}` : name;
      let next = folder.children.find((n): n is Folder => n.kind === "folder" && n.path === path);
      if (!next) {
        next = { kind: "folder", path, label: name, children: [] };
        folder.children.push(next);
      }
      folder = next;
    }
    folder.children.push({ kind: "file", change });
  }
  return compact(top.children);
}

function name(node: Node): string {
  return node.kind === "folder" ? node.label : node.change.path.split("/").pop()!;
}

function compact(nodes: Node[]): Node[] {
  return nodes
    .map((node): Node => {
      if (node.kind === "file") {
        return node;
      }
      let folder = node;
      while (folder.children.length === 1 && folder.children[0].kind === "folder") {
        const only: Folder = folder.children[0];
        folder = { ...only, label: `${folder.label}/${only.label}` };
      }
      return { ...folder, children: compact(folder.children) };
    })
    .sort((a, b) =>
      a.kind !== b.kind ? (a.kind === "folder" ? -1 : 1) : name(a).localeCompare(name(b)),
    );
}
