import * as vscode from "vscode";
import * as fs from "node:fs";
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

/** The current file of the row exists, so the button of the row can open it. */
export function hasCurrentFile(row: Row): boolean {
  const { root, change } = row;
  if (change.status === "D") {
    return false;
  }
  // Only a file that changed after the diff can be deleted since.
  return !change.changedSince || fs.existsSync(path.join(root, change.path));
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
