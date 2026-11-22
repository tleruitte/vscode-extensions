import * as vscode from "vscode";
import { Choices } from "./choice";
import { Files } from "./files";
import { recentCommits } from "./git";
import { pickChoice } from "./picker";
import { Repos } from "./repos";

/** How many recent commits the picker offers. */
const RECENT_COMMITS = 10;

export function activate(context: vscode.ExtensionContext): void {
  const repos = new Repos();
  const choices = new Choices(context.workspaceState);

  context.subscriptions.push(
    repos,
    choices,
    new Files(repos, choices),
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
