import * as vscode from "vscode";
import { Choices, describe } from "./choice";
import { Repos } from "./repos";

/** The tree of the changed files of the chosen diff. */
export class Files implements vscode.TreeDataProvider<vscode.TreeItem>, vscode.Disposable {
  private readonly view: vscode.TreeView<vscode.TreeItem>;
  private readonly changed = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this.changed.event;
  private readonly disposables: vscode.Disposable[] = [];

  constructor(
    private readonly repos: Repos,
    private readonly choices: Choices,
  ) {
    this.view = vscode.window.createTreeView("gitChanges.files", { treeDataProvider: this });
    this.disposables.push(
      this.view,
      this.changed,
      repos.onDidChange(() => this.refresh()),
      choices.onDidChange(() => this.refresh()),
    );
    this.refresh();
  }

  dispose(): void {
    for (const d of this.disposables) {
      d.dispose();
    }
  }

  private refresh(): void {
    const [repo] = this.repos.list();
    this.view.description = describe(repo ? this.choices.of(repo.rootUri.fsPath) : this.choices.shared);
    this.changed.fire();
  }

  getTreeItem(item: vscode.TreeItem): vscode.TreeItem {
    return item;
  }

  getChildren(): vscode.TreeItem[] {
    return [];
  }
}
