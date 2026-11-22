import * as vscode from "vscode";
import { Commit, short } from "./git";

/** A choice that applies to all the repositories. */
export type Shared = { kind: "uncommitted" } | { kind: "lastCommit" } | { kind: "main" };

/** A choice of one repository: a commit, or a range from `from` (oldest) to `to` (newest). */
export type Picked = { kind: "commit"; commit: Commit } | { kind: "range"; from: Commit; to: Commit };

export type Choice = Shared | Picked;

export function describe(choice: Choice): string {
  switch (choice.kind) {
    case "uncommitted":
      return "Uncommitted changes";
    case "lastCommit":
      return "Last commit";
    case "main":
      return "Compared to main";
    case "commit":
      return `${short(choice.commit.sha)} ${choice.commit.subject}`;
    case "range":
      return `${short(choice.from.sha)}…${short(choice.to.sha)}`;
  }
}

const KEY = "gitChanges.choice";

interface Saved {
  shared: Shared;
  /** The picked choice of each repository, by the path of its root. */
  picked: Record<string, Picked>;
}

/** The chosen diff, kept for each workspace. */
export class Choices implements vscode.Disposable {
  private readonly changed = new vscode.EventEmitter<void>();
  readonly onDidChange = this.changed.event;
  private saved: Saved;

  constructor(private readonly memento: vscode.Memento) {
    this.saved = memento.get<Saved>(KEY) ?? { shared: { kind: "uncommitted" }, picked: {} };
  }

  dispose(): void {
    this.changed.dispose();
  }

  get shared(): Shared {
    return this.saved.shared;
  }

  of(root: string): Choice {
    return this.saved.picked[root] ?? this.saved.shared;
  }

  /** Changes all the repositories to `shared`. */
  setShared(shared: Shared): void {
    this.save({ shared, picked: {} });
  }

  setPicked(root: string, picked: Picked): void {
    this.save({ ...this.saved, picked: { ...this.saved.picked, [root]: picked } });
  }

  private save(saved: Saved): void {
    this.saved = saved;
    void this.memento.update(KEY, saved);
    this.changed.fire();
  }
}
