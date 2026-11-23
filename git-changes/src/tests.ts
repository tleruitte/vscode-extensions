import * as vscode from "vscode";
import { globRegExp } from "./glob";

const HIDE = "hideTestFiles";

/** The compiled patterns, by their text. */
let compiled: { key: string; patterns: RegExp[] } | undefined;

/**
 * Tells whether a file of the repository at `root` is a test, from the
 * patterns of the preference. The path is from the root, with `/`.
 */
export function testMatcher(root: string): (path: string) => boolean {
  const globs = vscode.workspace
    .getConfiguration("gitChanges", vscode.Uri.file(root))
    .get<string[]>("testFiles", []);
  const key = JSON.stringify(globs);
  if (compiled?.key !== key) {
    compiled = { key, patterns: globs.map(globRegExp) };
  }
  const { patterns } = compiled;
  return (path) => patterns.some((p) => p.test(path));
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
