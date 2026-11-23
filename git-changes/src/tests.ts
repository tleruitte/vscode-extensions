import * as vscode from "vscode";
import { globRegExp } from "./glob";

/** The test files: the patterns of their paths, from the root of the repository. */
const PATTERNS = [
  "**/*.test.*",
  "**/*.spec.*",
  "**/__tests__/**",
  "**/test/**",
  "**/tests/**",
  "**/__snapshots__/**",
  "**/__mocks__/**",
];

const HIDE = "hideTestFiles";

const patterns = PATTERNS.map(globRegExp);

/** The path is the one of a test file. The path is from the root of the repository, with `/`. */
export function isTest(path: string): boolean {
  return patterns.some((p) => p.test(path));
}

/** The test files are hidden, in all the windows: a user setting keeps the state, and tells each window when it changes. */
export function testsHidden(): boolean {
  return vscode.workspace.getConfiguration("gitChanges").get<boolean>(HIDE, false);
}

export function hideTests(hide: boolean): Thenable<void> {
  return vscode.workspace.getConfiguration("gitChanges").update(HIDE, hide, vscode.ConfigurationTarget.Global);
}

/** Tells the buttons of the title which one shows. */
export function setTestsContext(): Thenable<unknown> {
  return vscode.commands.executeCommand("setContext", "gitChanges.testsHidden", testsHidden());
}
