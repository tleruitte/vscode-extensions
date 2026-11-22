import * as vscode from "vscode";
import * as fs from "node:fs";
import * as path from "node:path";
import { Choices, describe } from "./choice";
import { Decorations, rowUri } from "./decorations";
import { NoDiff, Status, changes, resolve } from "./diff";
import { Gutter } from "./gutter";
import { Row, clickOpensDiff } from "./open";
import { Repos } from "./repos";
import { Node, buildTree } from "./tree";

/** The changes of one repository in its chosen diff. */
interface Shown {
  root: string;
  rows: Row[];
  /** The choice, for the title of the sidebar or of the repository row. */
  description: string;
  /** Why the repository shows no changes. */
  message?: string;
}

async function show(root: string, choices: Choices): Promise<Shown> {
  const choice = choices.of(root);
  const description = describe(choice);
  try {
    const diff = await resolve(root, choice);
    const shown = diff.main ? `Compared to ${diff.main}` : description;
    const rows = (await changes(root, diff)).map(
      (change): Row => ({ root, diff, change, description: shown }),
    );
    return { root, rows, description: shown, message: rows.length ? undefined : "No changes." };
  } catch (e) {
    const message = e instanceof NoDiff ? e.message : `Cannot read the changes: ${(e as Error).message}`;
    return { root, rows: [], description, message };
  }
}

/** The tree of the changed files of the chosen diff, with a row for each repository when there are several. */
export class Files implements vscode.TreeDataProvider<Node>, vscode.Disposable {
  private readonly view: vscode.TreeView<Node>;
  private readonly changed = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this.changed.event;
  private readonly disposables: vscode.Disposable[] = [];
  private nodes: Node[] = [];
  /** Counts the refreshes, so only the last one shows. */
  private generation = 0;

  constructor(
    private readonly repos: Repos,
    private readonly choices: Choices,
    private readonly decorations: Decorations,
    private readonly gutter: Gutter,
  ) {
    this.view = vscode.window.createTreeView("gitChanges.files", { treeDataProvider: this });
    this.disposables.push(
      this.view,
      this.changed,
      repos.onDidChange(() => void this.refresh()),
      choices.onDidChange(() => void this.refresh()),
    );
    void this.refresh();
  }

  dispose(): void {
    for (const d of this.disposables) {
      d.dispose();
    }
  }

  private async refresh(): Promise<void> {
    const generation = ++this.generation;
    const roots = this.repos.list().map((r) => r.rootUri.fsPath);
    const all = await Promise.all(roots.map((root) => show(root, this.choices)));
    if (generation !== this.generation) {
      return;
    }
    this.gutter.retain(roots);
    for (const shown of all) {
      this.gutter.set(
        shown.root,
        this.choices.of(shown.root).kind === "uncommitted" ? undefined : shown.rows,
      );
    }
    this.decorations.set(
      new Map(
        all.flatMap((s) =>
          s.rows.map((r): [string, Status] => [path.join(r.root, r.change.path), r.change.status]),
        ),
      ),
    );
    if (all.length === 1) {
      const [only] = all;
      this.nodes = buildTree(only.root, only.rows);
      this.view.description = only.description;
      this.view.message = only.message;
    } else {
      this.nodes = all.map((s) => ({
        kind: "repo",
        root: s.root,
        description: s.description,
        children: s.message
          ? [{ kind: "message", root: s.root, text: s.message }]
          : buildTree(s.root, s.rows),
      }));
      this.view.description = describe(this.choices.shared);
      this.view.message = all.length ? undefined : "No Git repository in the workspace.";
    }
    this.changed.fire();
  }

  getTreeItem(node: Node): vscode.TreeItem {
    switch (node.kind) {
      case "repo": {
        const item = new vscode.TreeItem(path.basename(node.root), vscode.TreeItemCollapsibleState.Expanded);
        item.id = `repo:${node.root}`;
        item.description = node.description;
        item.tooltip = node.root;
        item.iconPath = new vscode.ThemeIcon("repo");
        item.contextValue = "gitChangesRepo";
        return item;
      }
      case "message": {
        const item = new vscode.TreeItem(node.text);
        item.id = `message:${node.root}`;
        return item;
      }
      case "folder": {
        const item = new vscode.TreeItem(node.label, vscode.TreeItemCollapsibleState.Expanded);
        item.id = `folder:${node.root}/${node.path}`;
        item.resourceUri = rowUri(path.join(node.root, node.path));
        item.iconPath = vscode.ThemeIcon.Folder;
        item.tooltip = node.path;
        return item;
      }
      case "file": {
        const { root, change } = node.row;
        const item = new vscode.TreeItem(path.basename(change.path));
        item.id = `file:${root}/${change.path}`;
        item.resourceUri = rowUri(path.join(root, change.path));
        item.iconPath = vscode.ThemeIcon.File;
        item.tooltip = change.oldPath ? `${change.path}\nRenamed from ${change.oldPath}` : change.path;
        item.description = [
          change.oldPath && `← ${path.basename(change.oldPath)}`,
          change.changedSince && "changed since",
        ]
          .filter(Boolean)
          .join(" · ");
        item.command = { command: "gitChanges.open", title: "Open", arguments: [node.row] };
        // When a click opens the diff, the button opens the current file, if there is one.
        item.contextValue = !clickOpensDiff(node.row)
          ? "gitChangesFile"
          : fs.existsSync(path.join(root, change.path))
            ? "gitChangesDiffFile"
            : "gitChangesGoneFile";
        return item;
      }
    }
  }

  getChildren(node?: Node): Node[] {
    if (!node) {
      return this.nodes;
    }
    return node.kind === "repo" || node.kind === "folder" ? node.children : [];
  }
}
