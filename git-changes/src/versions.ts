import * as vscode from "vscode";
import * as path from "node:path";
import { git } from "./git";

/** The scheme of the read-only versions of a file at a commit. */
const SCHEME = "git-changes";

interface Version {
  root: string;
  /** The commit, or empty for a file that does not exist on that side. */
  rev: string;
  /** The path from the root of the repository, with `/`. */
  path: string;
}

/** The read-only version of `file` at `rev`, or an empty one when `rev` is undefined. */
export function versionUri(root: string, rev: string | undefined, file: string): vscode.Uri {
  const version: Version = { root, rev: rev ?? "", path: file };
  return vscode.Uri.file(path.join(root, file)).with({
    scheme: SCHEME,
    query: JSON.stringify(version),
  });
}

/** Gives the editor the content of the versions. */
export class Versions implements vscode.TextDocumentContentProvider, vscode.Disposable {
  private readonly registration = vscode.workspace.registerTextDocumentContentProvider(SCHEME, this);

  dispose(): void {
    this.registration.dispose();
  }

  async provideTextDocumentContent(uri: vscode.Uri): Promise<string> {
    const version = JSON.parse(uri.query) as Version;
    return version.rev ? git(version.root, ["show", `${version.rev}:${version.path}`]) : "";
  }
}
