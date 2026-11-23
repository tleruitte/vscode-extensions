import * as vscode from "vscode";
import * as fs from "node:fs";
import * as path from "node:path";
import { git } from "./git";

/** The part of the API of the built-in Git extension that Git Changes uses. */
interface Repository {
  readonly rootUri: vscode.Uri;
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
 * The root of the repository of `folder`, or none when it is not in a
 * repository. The root keeps the path of the folder, also when it has a
 * symbolic link, so it matches the paths of the editor.
 */
async function toplevel(folder: string): Promise<string | undefined> {
  try {
    return path.resolve(folder, (await git(folder, ["rev-parse", "--show-cdup"])).trim());
  } catch {
    return undefined;
  }
}

function real(root: string): string {
  try {
    return fs.realpathSync.native(root);
  } catch {
    return root;
  }
}

/** Watches the files of a repository and the state of Git: the current commit, the index, and the branches. */
async function watch(root: string, fire: () => void): Promise<vscode.Disposable> {
  const watchers: vscode.FileSystemWatcher[] = [];
  const add = (base: string, pattern: string, filter?: (uri: vscode.Uri) => boolean): void => {
    const watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(base, pattern));
    const on = (uri: vscode.Uri) => (!filter || filter(uri)) && fire();
    watcher.onDidCreate(on);
    watcher.onDidChange(on);
    watcher.onDidDelete(on);
    watchers.push(watcher);
  };
  // The Git folder gets watchers of its own below, also when it is in the repository.
  const dotGit = path.join(root, ".git") + path.sep;
  add(root, "**", (uri) => !uri.fsPath.startsWith(dotGit));
  try {
    // The Git folder of a worktree is outside the repository, and shares the branches with the main one.
    const [gitDir, commonDir] = (
      await git(root, ["rev-parse", "--path-format=absolute", "--git-dir", "--git-common-dir"])
    )
      .trim()
      .split("\n");
    add(gitDir, "{HEAD,index}");
    add(commonDir, "{packed-refs,refs/**}");
  } catch {
    // Without its Git folder, the commits and the branches do not refresh the tree.
  }
  return vscode.Disposable.from(...watchers);
}

/**
 * The repositories of the workspace: the ones of the workspace folders, which
 * show at once, and the ones that the built-in Git extension finds later. It
 * tells when they change: a file, a commit, the index, or a branch.
 */
export class Repos implements vscode.Disposable {
  private readonly changed = new vscode.EventEmitter<void>();
  readonly onDidChange = this.changed.event;
  private api: API | undefined;
  private folderRoots: string[] = [];
  private readonly watches = new Map<string, Promise<vscode.Disposable>>();
  private readonly disposables: vscode.Disposable[] = [this.changed];

  async start(): Promise<void> {
    this.disposables.push(vscode.workspace.onDidChangeWorkspaceFolders(() => void this.findFolderRoots()));
    await this.findFolderRoots();
    const extension = vscode.extensions.getExtension<GitExtension>("vscode.git");
    try {
      this.api = (await extension?.activate())?.getAPI(1);
    } catch {
      // The Git extension is disabled.
    }
    if (this.api) {
      this.disposables.push(
        this.api.onDidOpenRepository(() => this.update()),
        this.api.onDidCloseRepository(() => this.update()),
      );
    }
    this.update();
  }

  dispose(): void {
    for (const d of this.disposables) {
      d.dispose();
    }
    for (const w of this.watches.values()) {
      void w.then((d) => d.dispose());
    }
  }

  private async findFolderRoots(): Promise<void> {
    const folders = vscode.workspace.workspaceFolders ?? [];
    const roots = await Promise.all(folders.map((f) => toplevel(f.uri.fsPath)));
    this.folderRoots = roots.filter((r): r is string => r !== undefined);
    this.update();
  }

  /** Watches the repositories of the list, and tells that it changed. */
  private update(): void {
    const roots = this.list();
    for (const [root, w] of this.watches) {
      if (!roots.includes(root)) {
        void w.then((d) => d.dispose());
        this.watches.delete(root);
      }
    }
    for (const root of roots) {
      if (!this.watches.has(root)) {
        this.watches.set(root, watch(root, () => this.changed.fire()));
      }
    }
    this.changed.fire();
  }

  /** The roots of the repositories, sorted. A repository that both find shows once, with the path of the folder. */
  list(): string[] {
    const roots = new Map<string, string>();
    for (const root of [...this.folderRoots, ...(this.api?.repositories ?? []).map((r) => r.rootUri.fsPath)]) {
      const key = real(root);
      if (!roots.has(key)) {
        roots.set(key, path.normalize(root));
      }
    }
    return [...roots.values()].sort((a, b) => a.localeCompare(b));
  }
}
