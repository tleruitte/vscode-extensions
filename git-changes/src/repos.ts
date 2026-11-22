import * as vscode from "vscode";

/** The part of the API of the built-in Git extension that Git Changes uses. */
export interface Repository {
  readonly rootUri: vscode.Uri;
  readonly state: { readonly onDidChange: vscode.Event<void> };
}

interface API {
  readonly repositories: Repository[];
  readonly onDidOpenRepository: vscode.Event<Repository>;
  readonly onDidCloseRepository: vscode.Event<Repository>;
}

interface GitExtension {
  getAPI(version: 1): API;
}

/**
 * The repositories that the built-in Git extension found in the workspace. It
 * tells when they change: a file, a commit, the branch, or a fetch.
 */
export class Repos implements vscode.Disposable {
  private readonly changed = new vscode.EventEmitter<void>();
  readonly onDidChange = this.changed.event;
  private api: API | undefined;
  private readonly watches = new Map<Repository, vscode.Disposable>();
  private readonly disposables: vscode.Disposable[] = [this.changed];

  async start(): Promise<void> {
    const extension = vscode.extensions.getExtension<GitExtension>("vscode.git");
    try {
      this.api = (await extension?.activate())?.getAPI(1);
    } catch {
      // The Git extension is disabled.
    }
    if (this.api) {
      this.disposables.push(
        this.api.onDidOpenRepository((repo) => {
          this.watch(repo);
          this.changed.fire();
        }),
        this.api.onDidCloseRepository((repo) => {
          this.watches.get(repo)?.dispose();
          this.watches.delete(repo);
          this.changed.fire();
        }),
      );
      this.api.repositories.forEach((repo) => this.watch(repo));
    }
    this.changed.fire();
  }

  dispose(): void {
    for (const d of [...this.disposables, ...this.watches.values()]) {
      d.dispose();
    }
  }

  private watch(repo: Repository): void {
    this.watches.set(repo, repo.state.onDidChange(() => this.changed.fire()));
  }

  list(): Repository[] {
    return [...(this.api?.repositories ?? [])].sort((a, b) =>
      a.rootUri.fsPath.localeCompare(b.rootUri.fsPath),
    );
  }
}
