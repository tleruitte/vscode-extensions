import * as vscode from "vscode";
import { REVIEW_URI, Store } from "./comments";

/** How long the page waits for the editor before it opens a new comment box anyway. */
const READY_MS = 1_000;

function isReviewActive(): boolean {
  return vscode.window.activeTextEditor?.document.uri.toString() === REVIEW_URI.toString();
}

/**
 * The Review page: a read-only page in an editor tab that holds the general
 * comments, which are on no file. The first line says what the page is for,
 * each general comment has an empty line of its own, and the last line gets a
 * new comment. The tab is open while the person writes: a save closes it and
 * gives the focus back to where it was before the page opened.
 */
export class ReviewPage implements vscode.TextDocumentContentProvider, vscode.Disposable {
  private readonly changed = new vscode.EventEmitter<vscode.Uri>();
  readonly onDidChange = this.changed.event;
  /** The command that gives the focus back, for example to the side bar. */
  private back: string | undefined;
  private readonly disposables: vscode.Disposable[];

  constructor(private readonly store: Store) {
    this.disposables = [
      this.changed,
      vscode.workspace.registerTextDocumentContentProvider(REVIEW_URI.scheme, this),
      store.onDidChange(() => this.changed.fire(REVIEW_URI)),
    ];
  }

  dispose(): void {
    for (const d of this.disposables) {
      d.dispose();
    }
  }

  provideTextDocumentContent(): string {
    return [
      "General comments for the agent, sent with the review.",
      ...this.store.generals().map(() => ""),
      "New general comment: + in the gutter, or ⌃⇧C.",
    ].join("\n");
  }

  /** Opens the page with a new comment box. */
  async add(back?: string): Promise<void> {
    const active = isReviewActive();
    this.remember(back);
    // The editor opens a comment box only after it asked where the page can
    // get one, and it asks each time the page shows in an editor.
    const ready = active
      ? Promise.resolve()
      : new Promise<void>((resolve) => {
          const timer = setTimeout(done, READY_MS);
          const asked = this.store.onDidAskReview(() => setTimeout(done, 100));
          function done(): void {
            clearTimeout(timer);
            asked.dispose();
            resolve();
          }
        });
    const line = this.store.newGeneralLine();
    // Not a preview: it would take the place of a preview tab, for example a
    // diff of Git Changes, which would then not come back after the save.
    await vscode.window.showTextDocument(REVIEW_URI, {
      selection: new vscode.Range(line, 0, line, 0),
      preview: false,
    });
    await ready;
    await vscode.commands.executeCommand("workbench.action.addComment");
  }

  /** Opens the page at a general comment. */
  async reveal(id: string, back?: string): Promise<void> {
    this.remember(back);
    await this.store.reveal(id);
  }

  /** Closes the page after a save, and gives the focus back. */
  async close(): Promise<void> {
    const tabs = vscode.window.tabGroups.all
      .flatMap((group) => group.tabs)
      .filter(
        (tab) =>
          tab.input instanceof vscode.TabInputText &&
          tab.input.uri.toString() === REVIEW_URI.toString(),
      );
    await vscode.window.tabGroups.close(tabs);
    const back = this.back;
    this.back = undefined;
    if (back) {
      await vscode.commands.executeCommand(back);
    }
  }

  /** On the page itself, the focus keeps the place it had before the page opened. */
  private remember(back: string | undefined): void {
    if (!isReviewActive()) {
      this.back = back;
    }
  }
}
