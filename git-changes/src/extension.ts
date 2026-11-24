import * as vscode from "vscode";
import { Choices } from "./choice";
import { Decorations } from "./decorations";
import { Files } from "./files";
import { recentCommits } from "./git";
import { Row, openDiff, openFile } from "./open";
import { pickChoice } from "./picker";
import { Repos } from "./repos";
import { hideTests, setTestsContext } from "./tests";
import { File, Repo } from "./tree";
import { Versions } from "./versions";

/** How many recent commits the picker offers. */
const RECENT_COMMITS = 10;

export function activate(context: vscode.ExtensionContext): void {
  const repos = new Repos();
  const choices = new Choices(context.workspaceState);
  const decorations = new Decorations();
  const files = new Files(repos, choices, decorations);

  context.subscriptions.push(
    repos,
    choices,
    decorations,
    files,
    new Versions(),
    vscode.commands.registerCommand("gitChanges.hideTests", () => hideTests(true)),
    vscode.commands.registerCommand("gitChanges.showTests", () => hideTests(false)),
    vscode.workspace.onDidChangeConfiguration(
      (e) => e.affectsConfiguration("gitChanges.hideTestFiles") && void setTestsContext(),
    ),
    vscode.commands.registerCommand("gitChanges.open", (row: Row) => openDiff(row)),
    // The button of a row gets its node.
    vscode.commands.registerCommand("gitChanges.openFile", (node: File) => openFile(node.row)),
    // With more than one repository, the title offers no commits: each repository row does.
    vscode.commands.registerCommand("gitChanges.choose", async () => {
      const all = repos.list();
      const root = all.length === 1 ? all[0] : undefined;
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
    vscode.commands.registerCommand("gitChanges.chooseInRepo", async (node: Repo) => {
      const commits = await recentCommits(node.root, RECENT_COMMITS);
      if (!commits.length) {
        void vscode.window.showInformationMessage("This repository has no commits yet.");
        return;
      }
      const choice = await pickChoice(false, commits);
      if (choice?.kind === "commit" || choice?.kind === "range") {
        choices.setPicked(node.root, choice);
      }
    }),
  );
  void setTestsContext();
  void repos.start();
}

export function deactivate(): void {}
