import * as vscode from "vscode";
import { NoteComment, Pending, Store } from "./comments";
import { Panel } from "./panel";

export function activate(context: vscode.ExtensionContext): void {
  const store = new Store(context.workspaceState);
  const panel = new Panel(store);

  context.subscriptions.push(
    store,
    panel,
    // The shortcut opens the same comment box as the "+" in the gutter.
    vscode.commands.registerCommand("herdrComments.add", () =>
      vscode.commands.executeCommand("workbench.action.addComment"),
    ),
    vscode.commands.registerCommand("herdrComments.save", (reply: vscode.CommentReply) =>
      store.add(reply),
    ),
    vscode.commands.registerCommand("herdrComments.cancelNew", (reply: vscode.CommentReply) =>
      reply.thread.dispose(),
    ),
    // Edit and Delete get a comment from the editor, or a row of the panel.
    vscode.commands.registerCommand(
      "herdrComments.edit",
      async ({ id }: NoteComment | Pending) => {
        await store.reveal(id);
        store.startEdit(id);
      },
    ),
    vscode.commands.registerCommand("herdrComments.delete", ({ id }: NoteComment | Pending) =>
      store.delete(id),
    ),
    vscode.commands.registerCommand("herdrComments.saveEdit", (comment: NoteComment) =>
      store.saveEdit(comment),
    ),
    vscode.commands.registerCommand("herdrComments.cancelEdit", (comment: NoteComment) =>
      store.cancelEdit(comment),
    ),
    vscode.commands.registerCommand("herdrComments.reveal", (p: Pending) =>
      store.reveal(p.id),
    ),
    vscode.commands.registerCommand("herdrComments.submit", () => panel.submit()),
    vscode.commands.registerCommand("herdrComments.start", () => panel.submit()),
    vscode.commands.registerCommand("herdrComments.chooseAgent", () =>
      panel.chooseAgent(),
    ),
  );
}

export function deactivate(): void {}
