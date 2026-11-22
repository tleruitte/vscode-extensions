import type { Row } from "./open";

export interface Folder {
  kind: "folder";
  root: string;
  /** The path from the root of the repository, with `/`. */
  path: string;
  /** The folders that have only one folder in them share one row, as on GitHub: `src/app`. */
  label: string;
  children: (Folder | File)[];
}

export interface File {
  kind: "file";
  row: Row;
}

/** A repository, when the workspace has more than one. */
export interface Repo {
  kind: "repo";
  root: string;
  /** The choice of the repository, or why it shows no changes. */
  description: string;
  children: Node[];
}

/** Why a repository shows no changes. */
export interface Message {
  kind: "message";
  root: string;
  text: string;
}

export type Node = Repo | Message | Folder | File;

/** The rows as a tree of folders, folders first, then by name. */
export function buildTree(root: string, rows: Row[]): Node[] {
  const top: Folder = { kind: "folder", root, path: "", label: "", children: [] };
  for (const row of rows) {
    const names = row.change.path.split("/");
    let folder = top;
    for (const name of names.slice(0, -1)) {
      const path = folder.path ? `${folder.path}/${name}` : name;
      let next = folder.children.find((n): n is Folder => n.kind === "folder" && n.path === path);
      if (!next) {
        next = { kind: "folder", root, path, label: name, children: [] };
        folder.children.push(next);
      }
      folder = next;
    }
    folder.children.push({ kind: "file", row });
  }
  return compact(top.children);
}

function name(node: Folder | File): string {
  return node.kind === "folder" ? node.label : node.row.change.path.split("/").pop()!;
}

function compact(nodes: (Folder | File)[]): (Folder | File)[] {
  return nodes
    .map((node): Folder | File => {
      if (node.kind === "file") {
        return node;
      }
      let folder = node;
      while (folder.children.length === 1 && folder.children[0].kind === "folder") {
        const only = folder.children[0];
        folder = { ...only, label: `${folder.label}/${only.label}` };
      }
      return { ...folder, children: compact(folder.children) };
    })
    .sort((a, b) =>
      a.kind !== b.kind ? (a.kind === "folder" ? -1 : 1) : name(a).localeCompare(name(b)),
    );
}
