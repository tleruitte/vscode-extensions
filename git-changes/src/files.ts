import * as vscode from "vscode";
import * as path from "node:path";
import { Choices, describe } from "./choice";
import { Change, NoDiff, changes, resolve } from "./diff";
import { Repos } from "./repos";

/** The tree of the changed files of the chosen diff. */
export class Files implements vscode.TreeDataProvider<vscode.TreeItem>, vscode.Disposable {
  private readonly view: vscode.TreeView<vscode.TreeItem>;
  private readonly changed = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this.changed.event;
  private readonly disposables: vscode.Disposable[] = [];
  private root: string | undefined;
  private files: Change[] = [];
  /** Counts the refreshes, so only the last one shows. */
  private generation = 0;

  constructor(
    private readonly repos: Repos,
    private readonly choices: Choices,
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
    let files: Change[] = [];
    let message: string | undefined;
    let description = describe(choice);
    if (!root) {
      message = "No Git repository in the workspace.";
    } else {
      try {
        const diff = await resolve(root, choice);
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
    this.root = root;
    this.files = files;
    this.view.description = description;
    this.view.message = message;
    this.changed.fire();
  }

  getTreeItem(item: vscode.TreeItem): vscode.TreeItem {
    return item;
  }

  getChildren(): vscode.TreeItem[] {
    return this.files.map((change) => {
      const item = new vscode.TreeItem(change.path);
      item.description = change.status;
      item.resourceUri = vscode.Uri.file(path.join(this.root!, change.path));
      return item;
    });
  }
}
