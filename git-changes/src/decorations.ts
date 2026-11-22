import * as vscode from "vscode";
import type { Status } from "./diff";

/** The scheme of the rows of the tree, so their status is the one of the chosen diff, not of Git. */
export const SCHEME = "git-changes-row";

const LOOK: Record<Status, { tooltip: string; color: string }> = {
  A: { tooltip: "Added", color: "gitDecoration.addedResourceForeground" },
  M: { tooltip: "Modified", color: "gitDecoration.modifiedResourceForeground" },
  D: { tooltip: "Deleted", color: "gitDecoration.deletedResourceForeground" },
  R: { tooltip: "Renamed", color: "gitDecoration.renamedResourceForeground" },
  U: { tooltip: "Untracked", color: "gitDecoration.untrackedResourceForeground" },
};

export function rowUri(file: string): vscode.Uri {
  return vscode.Uri.file(file).with({ scheme: SCHEME });
}

/** Colors the rows and gives them the status letter on the right, as the Explorer does. */
export class Decorations implements vscode.FileDecorationProvider, vscode.Disposable {
  private readonly changed = new vscode.EventEmitter<vscode.Uri[]>();
  readonly onDidChangeFileDecorations = this.changed.event;
  private statuses = new Map<string, Status>();
  private readonly registration = vscode.window.registerFileDecorationProvider(this);

  dispose(): void {
    this.registration.dispose();
    this.changed.dispose();
  }

  /** Sets the status of each row, by the path of its file. */
  set(statuses: Map<string, Status>): void {
    const uris = [...new Set([...this.statuses.keys(), ...statuses.keys()])].map(rowUri);
    this.statuses = statuses;
    this.changed.fire(uris);
  }

  provideFileDecoration(uri: vscode.Uri): vscode.FileDecoration | undefined {
    const status = uri.scheme === SCHEME ? this.statuses.get(uri.fsPath) : undefined;
    if (!status) {
      return undefined;
    }
    const look = LOOK[status];
    const decoration = new vscode.FileDecoration(status, look.tooltip, new vscode.ThemeColor(look.color));
    decoration.propagate = true;
    return decoration;
  }
}
