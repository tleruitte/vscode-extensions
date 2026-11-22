import * as vscode from "vscode";
import { Choice } from "./choice";
import { Commit, short } from "./git";

interface Item extends vscode.QuickPickItem {
  choice?: Choice;
  range?: true;
}

function commitItem(commit: Commit): vscode.QuickPickItem & { commit: Commit } {
  return { label: commit.subject, description: short(commit.sha), commit };
}

/**
 * Asks for a diff: the choices that apply to all the repositories when `shared`,
 * then the recent `commits` (newest first) of one repository.
 */
export async function pickChoice(shared: boolean, commits: Commit[]): Promise<Choice | undefined> {
  const items: Item[] = [];
  if (shared) {
    items.push(
      { label: "Uncommitted changes", choice: { kind: "uncommitted" } },
      { label: "Last commit", choice: { kind: "lastCommit" } },
      { label: "Compared to main", choice: { kind: "main" } },
    );
  }
  if (commits.length) {
    items.push(
      { label: "Range of commits…", range: true },
      { label: "Recent commits", kind: vscode.QuickPickItemKind.Separator },
      ...commits.map((c) => ({ ...commitItem(c), choice: { kind: "commit", commit: c } as Choice })),
    );
  }
  const picked = await vscode.window.showQuickPick(items, { placeHolder: "Show the changes of" });
  if (!picked?.range) {
    return picked?.choice;
  }
  const first = await vscode.window.showQuickPick(commits.map(commitItem), {
    placeHolder: "First commit of the range",
  });
  if (!first) {
    return undefined;
  }
  // The last commit is the first one or a newer one.
  const newer = commits.slice(0, commits.indexOf(first.commit) + 1);
  const last = await vscode.window.showQuickPick(newer.map(commitItem), {
    placeHolder: "Last commit of the range",
  });
  if (!last) {
    return undefined;
  }
  return last.commit === first.commit
    ? { kind: "commit", commit: first.commit }
    : { kind: "range", from: first.commit, to: last.commit };
}
