import * as vscode from "vscode";
import * as path from "node:path";
import type { Change, Diff } from "./diff";
import { versionUri } from "./versions";

/** A file row of the tree: the change of a file in the diff of a repository. */
export interface Row {
  root: string;
  diff: Diff;
  change: Change;
  /** The choice that the title of the sidebar shows, for the title of the diff. */
  description: string;
}

/** A click opens the diff, not the file, when the file is deleted or is not the one of the commit. */
export function clickOpensDiff(row: Row): boolean {
  return row.change.status === "D" || row.change.changedSince === true;
}

export function openFile(row: Row): Thenable<unknown> {
  return vscode.commands.executeCommand("vscode.open", vscode.Uri.file(path.join(row.root, row.change.path)));
}

/**
 * Opens the diff of one file. Its right side is the current file, so it can be
 * edited and commented, unless that file is not the one at the end of the diff.
 */
export function openDiff(row: Row): Thenable<unknown> {
  const { root, diff, change } = row;
  const added = change.status === "A" || change.status === "U";
  const left = versionUri(root, added ? undefined : diff.base, change.oldPath ?? change.path);
  const right =
    change.status === "D"
      ? versionUri(root, undefined, change.path)
      : change.changedSince
        ? versionUri(root, diff.head, change.path)
        : vscode.Uri.file(path.join(root, change.path));
  const title = `${path.basename(change.path)} (${row.description})`;
  return vscode.commands.executeCommand("vscode.diff", left, right, title);
}

export function openRow(row: Row): Thenable<unknown> {
  return clickOpensDiff(row) ? openDiff(row) : openFile(row);
}
