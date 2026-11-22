import * as vscode from "vscode";

class Files implements vscode.TreeDataProvider<vscode.TreeItem> {
  getTreeItem(item: vscode.TreeItem): vscode.TreeItem {
    return item;
  }

  getChildren(): vscode.TreeItem[] {
    return [];
  }
}

export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.window.createTreeView("gitChanges.files", { treeDataProvider: new Files() }),
  );
}

export function deactivate(): void {}
