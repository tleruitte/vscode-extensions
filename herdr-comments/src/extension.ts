import * as vscode from "vscode";
import { NoteComment, Pending, Store, isGeneral } from "./comments";
import { Panel } from "./panel";
import { ReviewPage } from "./review";

/** Gives the focus back to the Herdr Comments view. */
const BACK_TO_VIEW = "herdrComments.pending.focus";
/** Gives the focus back to the view of the Git Changes extension. */
const BACK_TO_GIT_CHANGES = "gitChanges.files.focus";

export function activate(context: vscode.ExtensionContext): void {
  const log = vscode.window.createOutputChannel("Herdr Comments", { log: true });
  context.subscriptions.push(log);
  log.info("Herdr Comments started");
  const store = new Store(context.workspaceState, log);
  const panel = new Panel(store);
  const review = new ReviewPage(store);
  /** A save on the Review page closes it. */
  const saved = async (id: string): Promise<void> => {
    const p = store.get(id);
    if (p && isGeneral(p)) {
      await review.close();
    }
  };

  context.subscriptions.push(
    store,
    panel,
    review,
    // The shortcut opens the same comment box as the "+" in the gutter.
    vscode.commands.registerCommand("herdrComments.add", () =>
      vscode.commands.executeCommand("workbench.action.addComment"),
    ),
    vscode.commands.registerCommand(
      "herdrComments.save",
      async (reply: vscode.CommentReply) => {
        const id = await store.add(reply);
        if (id) {
          await saved(id);
        }
      },
    ),
    // The keybindings say how to give the focus back after the save.
    vscode.commands.registerCommand("herdrComments.addGeneral", (args?: { back?: string }) =>
      review.add(args?.back),
    ),
    vscode.commands.registerCommand("herdrComments.addGeneralFromView", () =>
      review.add(BACK_TO_VIEW),
    ),
    // A button in the title of Git Changes, which shows only when that extension is installed.
    vscode.commands.registerCommand("herdrComments.addGeneralFromGitChanges", () =>
      review.add(BACK_TO_GIT_CHANGES),
    ),
    vscode.commands.registerCommand("herdrComments.cancelNew", (reply: vscode.CommentReply) =>
      reply.thread.dispose(),
    ),
    // Edit and Delete get a comment from the editor, or a row of the panel.
    vscode.commands.registerCommand(
      "herdrComments.edit",
      async (comment: NoteComment | Pending) => {
        const { id } = comment;
        if (comment instanceof NoteComment || !isGeneral(comment)) {
          await store.reveal(id);
        } else {
          await review.reveal(id, BACK_TO_VIEW);
        }
        store.startEdit(id);
      },
    ),
    vscode.commands.registerCommand("herdrComments.delete", ({ id }: NoteComment | Pending) =>
      store.delete(id),
    ),
    vscode.commands.registerCommand(
      "herdrComments.saveEdit",
      async (comment: NoteComment) => {
        if (await store.saveEdit(comment)) {
          await saved(comment.id);
        }
      },
    ),
    vscode.commands.registerCommand("herdrComments.cancelEdit", (comment: NoteComment) =>
      store.cancelEdit(comment),
    ),
    vscode.commands.registerCommand("herdrComments.reveal", (p: Pending) =>
      isGeneral(p) ? review.reveal(p.id, BACK_TO_VIEW) : store.reveal(p.id),
    ),
    vscode.commands.registerCommand("herdrComments.submit", () => panel.submit()),
    vscode.commands.registerCommand("herdrComments.start", () => panel.submit()),
    vscode.commands.registerCommand("herdrComments.chooseAgent", () =>
      panel.chooseAgent(),
    ),
  );
}

export function deactivate(): void {}
