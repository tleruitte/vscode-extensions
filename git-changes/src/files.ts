import * as vscode from "vscode";
import * as path from "node:path";
import { Choices, describe } from "./choice";
import { Decorations, rowUri } from "./decorations";
import { NoDiff, Status, changes, resolve } from "./diff";
import { Row, hasCurrentFile } from "./open";
import { Repos } from "./repos";
import { testMatcher, testsHidden } from "./tests";
import { Node, buildTree } from "./tree";

const VIEW = "gitChanges.files";
const LOADING = "Loading…";

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
  /** The changes of the last refresh, or none while the tree loads. */
  private shown: Shown[] | undefined;
  /** Counts the changes of the choices, so a refresh of an earlier choice does not show. */
  private generation = 0;
  private refreshing = false;
  /** A change came during the refresh, so one more refresh follows it. */
  private again = false;

  constructor(
    private readonly repos: Repos,
    private readonly choices: Choices,
    private readonly decorations: Decorations,
  ) {
    this.view = vscode.window.createTreeView(VIEW, { treeDataProvider: this });
    this.view.message = LOADING;
    this.disposables.push(
      this.view,
      this.changed,
      repos.onDidChange(() => void this.refresh()),
      choices.onDidChange(() => {
        this.generation++;
        this.showLoading();
        void this.refresh();
      }),
      // In case a watcher missed a change.
      this.view.onDidChangeVisibility(() => this.view.visible && void this.refresh()),
      vscode.workspace.onDidChangeConfiguration((e) => e.affectsConfiguration("gitChanges") && this.render()),
    );
    void this.refresh();
  }

  dispose(): void {
    for (const d of this.disposables) {
      d.dispose();
    }
  }

  /** The list of the earlier diff must not show under the name of the new one. */
  private showLoading(): void {
    const roots = this.repos.list();
    this.shown = undefined;
    this.nodes = [];
    this.view.description = describe(roots.length === 1 ? this.choices.of(roots[0]) : this.choices.shared);
    this.view.message = LOADING;
    this.changed.fire();
  }

  /**
   * Refreshes at once. The changes that come during a refresh make one more
   * refresh after it, not one for each: an agent or a build changes many files.
   */
  private async refresh(): Promise<void> {
    if (this.refreshing) {
      this.again = true;
      return;
    }
    this.refreshing = true;
    try {
      // A progress bar at the top of the tree, which keeps the earlier list below it.
      await vscode.window.withProgress({ location: { viewId: VIEW } }, async () => {
        do {
          this.again = false;
          await this.load();
        } while (this.again);
      });
    } finally {
      this.refreshing = false;
    }
  }

  private async load(): Promise<void> {
    const generation = this.generation;
    const roots = this.repos.list();
    if (!roots.length && !this.repos.ready) {
      // The Git extension can still find a repository: the tree shows that it loads.
      return;
    }
    const all = await Promise.all(roots.map((root) => show(root, this.choices)));
    if (generation !== this.generation) {
      // The choice changed during the refresh, so it runs again.
      return;
    }
    this.decorations.set(
      new Map(
        all.flatMap((s) =>
          s.rows.map((r): [string, Status] => [path.join(r.root, r.change.path), r.change.status]),
        ),
      ),
    );
    this.shown = all;
    this.render();
  }

  /** The tree of the last refresh, with or without the test files. */
  private render(): void {
    const all = this.shown;
    if (!all) {
      return;
    }
    // The filter hides rows only: the colors of the files stay.
    const hide = testsHidden();
    const split = all.map((s) => {
      const isTest = testMatcher(s.root);
      const rows = hide ? s.rows.filter((r) => !isTest(r.change.path)) : s.rows;
      const message = s.message ?? (rows.length ? undefined : "Only test files changed.");
      return { ...s, rows, message, hidden: s.rows.length - rows.length };
    });
    const hidden = split.reduce((n, s) => n + s.hidden, 0);
    const count = hidden ? ` · ${hidden} test ${hidden === 1 ? "file" : "files"} hidden` : "";
    if (split.length === 1) {
      const [only] = split;
      this.nodes = buildTree(only.root, only.rows);
      this.view.description = only.description + count;
      this.view.message = only.message;
    } else {
      this.nodes = split.map(
        (s): Node => ({
          kind: "repo",
          root: s.root,
          description: s.description,
          children: s.message
            ? [{ kind: "message", root: s.root, text: s.message }]
            : buildTree(s.root, s.rows),
        }),
      );
      this.view.description = describe(this.choices.shared) + count;
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
        // A click opens the diff. The button opens the current file, if there is one.
        item.contextValue = hasCurrentFile(node.row) ? "gitChangesFile" : "gitChangesGoneFile";
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
