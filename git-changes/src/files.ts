import * as vscode from "vscode";
import * as path from "node:path";
import { Choices, describe } from "./choice";
import { Decorations, rowUri } from "./decorations";
import { Change, Diff, NoDiff, Status, changes, resolve } from "./diff";
import { Gutter } from "./gutter";
import { Row } from "./open";
import { Repos } from "./repos";
import { Node, buildTree } from "./tree";

/** The tree of the changed files of the chosen diff. */
export class Files implements vscode.TreeDataProvider<Node>, vscode.Disposable {
  private readonly view: vscode.TreeView<Node>;
  private readonly changed = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this.changed.event;
  private readonly disposables: vscode.Disposable[] = [];
  private root: string | undefined;
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
    const root = this.repos.list()[0]?.rootUri.fsPath;
    const choice = root ? this.choices.of(root) : this.choices.shared;
    let diff: Diff | undefined;
    let files: Change[] = [];
    let message: string | undefined;
    let description = describe(choice);
    if (!root) {
      message = "No Git repository in the workspace.";
    } else {
      try {
        diff = await resolve(root, choice);
        files = await changes(root, diff);
        if (diff.main) {
          description = `Compared to ${diff.main}`;
        }
        message = files.length ? undefined : "No changes.";
      } catch (e) {
        message = e instanceof NoDiff ? e.message : `Cannot read the changes: ${(e as Error).message}`;
      }
    }
    if (generation !== this.generation) {
      return;
    }
    const rows = diff ? files.map((change): Row => ({ root: root!, diff: diff!, change, description })) : [];
    this.root = root;
    this.nodes = buildTree(rows);
    if (root) {
      this.gutter.set(
        root,
        diff && choice.kind !== "uncommitted" ? rows : undefined,
      );
    }
    this.decorations.set(
      new Map(files.map((c): [string, Status] => [path.join(root!, c.path), c.status])),
    );
    this.view.description = description;
    this.view.message = message;
    this.changed.fire();
  }

  getTreeItem(node: Node): vscode.TreeItem {
    if (node.kind === "folder") {
      const item = new vscode.TreeItem(node.label, vscode.TreeItemCollapsibleState.Expanded);
      item.id = `folder:${this.root}/${node.path}`;
      item.resourceUri = rowUri(path.join(this.root!, node.path));
      item.iconPath = vscode.ThemeIcon.Folder;
      item.tooltip = node.path;
      return item;
    }
    const change = node.row.change;
    const item = new vscode.TreeItem(path.basename(change.path));
    item.id = `file:${this.root}/${change.path}`;
    item.resourceUri = rowUri(path.join(this.root!, change.path));
    item.iconPath = vscode.ThemeIcon.File;
    item.tooltip = change.oldPath ? `${change.path}\nRenamed from ${change.oldPath}` : change.path;
    item.description = [
      change.oldPath && `← ${path.basename(change.oldPath)}`,
      change.changedSince && "changed since",
    ]
      .filter(Boolean)
      .join(" · ");
    item.command = { command: "gitChanges.open", title: "Open", arguments: [node.row] };
    item.contextValue = "gitChangesFile";
    return item;
  }

  getChildren(node?: Node): Node[] {
    return node ? (node.kind === "folder" ? node.children : []) : this.nodes;
  }
}
