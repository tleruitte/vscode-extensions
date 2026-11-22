import * as vscode from "vscode";
import * as path from "node:path";
import { Row, clickOpensDiff, originalUri } from "./open";

/**
 * Gives the editor the version to compare each open file with, so its gutter
 * shows the marks of the chosen diff. The editor asks a source control for
 * that version, so each repository gets one, named Git Changes in the Source
 * Control view, while its diff is not the uncommitted changes: those get the
 * marks of the built-in Git extension.
 */
export class Gutter implements vscode.Disposable {
  private readonly repos = new Map<string, { key: string; control: vscode.SourceControl }>();

  dispose(): void {
    for (const { control } of this.repos.values()) {
      control.dispose();
    }
    this.repos.clear();
  }

  /** Sets the file rows of the repository at `root`, or none to show no marks. */
  set(root: string, rows: Row[] | undefined): void {
    const key = rows ? JSON.stringify(rows.map((r) => [r.diff, r.change])) : "";
    const current = this.repos.get(root);
    if (current?.key === key) {
      return;
    }
    // A new source control makes the open editors ask again for their versions.
    current?.control.dispose();
    this.repos.delete(root);
    if (!rows) {
      return;
    }
    const files = new Map(
      rows
        .filter((r) => !clickOpensDiff(r))
        .map((r): [string, Row] => [path.join(r.root, r.change.path), r]),
    );
    const control = vscode.scm.createSourceControl("gitChanges", "Git Changes", vscode.Uri.file(root));
    control.inputBox.visible = false;
    control.quickDiffProvider = {
      provideOriginalResource: (uri) => {
        const row = uri.scheme === "file" ? files.get(uri.fsPath) : undefined;
        return row && originalUri(row);
      },
    };
    this.repos.set(root, { key, control });
  }
}
