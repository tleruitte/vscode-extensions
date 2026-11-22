import * as vscode from "vscode";
import { Choices } from "./choice";
import { Decorations } from "./decorations";
import { Files } from "./files";
import { recentCommits } from "./git";
import { Row, openRow } from "./open";
import { pickChoice } from "./picker";
import { Repos } from "./repos";
import { Versions } from "./versions";

/** How many recent commits the picker offers. */
const RECENT_COMMITS = 10;

export function activate(context: vscode.ExtensionContext): void {
  const repos = new Repos();
  const choices = new Choices(context.workspaceState);
  const decorations = new Decorations();

  context.subscriptions.push(
    repos,
    choices,
    decorations,
    new Files(repos, choices, decorations),
    new Versions(),
    vscode.commands.registerCommand("gitChanges.open", (row: Row) => openRow(row)),
    vscode.commands.registerCommand("gitChanges.choose", async () => {
      const [repo] = repos.list();
      const root = repo?.rootUri.fsPath;
      const commits = root ? await recentCommits(root, RECENT_COMMITS) : [];
      const choice = await pickChoice(true, commits);
      if (!choice) {
        return;
      }
      if (choice.kind === "commit" || choice.kind === "range") {
        choices.setPicked(root!, choice);
      } else {
        choices.setShared(choice);
      }
    }),
  );
  void repos.start();
}

export function deactivate(): void {}
