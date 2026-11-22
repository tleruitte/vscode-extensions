import * as vscode from "vscode";
import * as path from "node:path";
import { randomUUID } from "node:crypto";

/**
 * A pending comment, as kept in the workspace state. The lines (1-based) and
 * the quoted code stay as they were when the comment was written, so the
 * agent gets the code that the person saw.
 */
export interface Pending {
  id: string;
  uri: string;
  from: number;
  to: number;
  quote: string;
  text: string;
}

const STATE_KEY = "herdrComments.pending";

export class NoteComment implements vscode.Comment {
  mode = vscode.CommentMode.Preview;
  author = { name: "Herdr Comments" };
  contextValue = "herdrComment";

  constructor(
    readonly id: string,
    public body: string | vscode.MarkdownString,
  ) {}
}

/** The quoted code, in the shape of the Herdr reviewer: the line number, then the text. */
function quoteLines(doc: vscode.TextDocument, from: number, to: number): string {
  const lines: string[] = [];
  for (let line = from; line <= to; line++) {
    lines.push(`${String(line).padStart(5)}   ${doc.lineAt(line - 1).text}`);
  }
  return lines.join("\n");
}

/** The comments of the editor and their copy in the workspace state. */
export class Store implements vscode.Disposable {
  private readonly controller: vscode.CommentController;
  private readonly threads = new Map<string, vscode.CommentThread>();
  private pending: Pending[];
  private readonly changed = new vscode.EventEmitter<void>();
  readonly onDidChange = this.changed.event;

  constructor(private readonly state: vscode.Memento) {
    this.controller = vscode.comments.createCommentController(
      "herdrComments",
      "Herdr Comments",
    );
    this.controller.options = {
      prompt: "Add a comment for the agent",
      placeHolder: "Comment for the agent",
    };
    // Every line of a file can get a comment: the "+" in the gutter.
    this.controller.commentingRangeProvider = {
      provideCommentingRanges: (doc) =>
        doc.uri.scheme === "file"
          ? [new vscode.Range(0, 0, Math.max(doc.lineCount - 1, 0), 0)]
          : [],
    };
    this.pending = state.get<Pending[]>(STATE_KEY, []);
    for (const p of this.pending) {
      const thread = this.controller.createCommentThread(
        vscode.Uri.parse(p.uri),
        new vscode.Range(p.from - 1, 0, p.to - 1, 0),
        [],
      );
      this.show(thread, p);
    }
  }

  dispose(): void {
    this.controller.dispose();
    this.changed.dispose();
  }

  /** The pending comments, by file and line. */
  list(): Pending[] {
    return [...this.pending].sort(
      (a, b) => a.uri.localeCompare(b.uri) || a.from - b.from,
    );
  }

  get(id: string): Pending | undefined {
    return this.pending.find((p) => p.id === id);
  }

  /** Saves the text of a new comment box as a pending comment. */
  async add(reply: vscode.CommentReply): Promise<void> {
    const text = reply.text.trim();
    const { thread } = reply;
    if (!text || !thread.range) {
      return;
    }
    const doc = await vscode.workspace.openTextDocument(thread.uri);
    const { start, end } = thread.range;
    // A selection that ends at the start of a line does not include that line.
    const last = end.character === 0 && end.line > start.line ? end.line - 1 : end.line;
    const p: Pending = {
      id: randomUUID(),
      uri: thread.uri.toString(),
      from: start.line + 1,
      to: last + 1,
      quote: quoteLines(doc, start.line + 1, last + 1),
      text,
    };
    this.show(thread, p);
    this.pending.push(p);
    await this.save();
  }

  startEdit(id: string): void {
    const thread = this.threads.get(id);
    if (!thread) {
      return;
    }
    thread.collapsibleState = vscode.CommentThreadCollapsibleState.Expanded;
    for (const comment of thread.comments) {
      comment.mode = vscode.CommentMode.Editing;
    }
    thread.comments = [...thread.comments];
  }

  async saveEdit(comment: NoteComment): Promise<void> {
    const p = this.get(comment.id);
    // The comment box writes the new text into the body of the comment.
    const body = comment.body;
    const text = (typeof body === "string" ? body : body.value).trim();
    if (!p || !text) {
      this.cancelEdit(comment);
      return;
    }
    p.text = text;
    this.render(p);
    await this.save();
  }

  cancelEdit(comment: NoteComment): void {
    const p = this.get(comment.id);
    if (p) {
      this.render(p);
    }
  }

  async delete(id: string): Promise<void> {
    this.threads.get(id)?.dispose();
    this.threads.delete(id);
    this.pending = this.pending.filter((p) => p.id !== id);
    await this.save();
  }

  async clear(): Promise<void> {
    for (const thread of this.threads.values()) {
      thread.dispose();
    }
    this.threads.clear();
    this.pending = [];
    await this.save();
  }

  async reveal(id: string): Promise<void> {
    const p = this.get(id);
    if (!p) {
      return;
    }
    await vscode.window.showTextDocument(vscode.Uri.parse(p.uri), {
      selection: new vscode.Range(p.from - 1, 0, p.from - 1, 0),
    });
    const thread = this.threads.get(id);
    if (thread) {
      thread.collapsibleState = vscode.CommentThreadCollapsibleState.Expanded;
    }
  }

  private show(thread: vscode.CommentThread, p: Pending): void {
    thread.canReply = false;
    thread.contextValue = "herdrComment";
    this.threads.set(p.id, thread);
    this.render(p);
  }

  private render(p: Pending): void {
    const thread = this.threads.get(p.id);
    if (thread) {
      thread.label = p.from === p.to ? `Line ${p.from}` : `Lines ${p.from}-${p.to}`;
      thread.comments = [new NoteComment(p.id, p.text)];
    }
  }

  private async save(): Promise<void> {
    await this.state.update(STATE_KEY, this.pending);
    this.changed.fire();
  }
}

/** The path of the file of a comment, relative to its workspace folder when it has one. */
export function relativePath(p: Pending): string {
  return vscode.workspace.asRelativePath(
    vscode.Uri.parse(p.uri),
    (vscode.workspace.workspaceFolders?.length ?? 0) > 1,
  );
}

/** The comments as one review message, in the shape of the Herdr reviewer. */
export function reviewMessage(list: Pending[]): string {
  const roots = [
    ...new Set(
      list.map((p) => {
        const uri = vscode.Uri.parse(p.uri);
        return (
          vscode.workspace.getWorkspaceFolder(uri)?.uri.fsPath ??
          path.dirname(uri.fsPath)
        );
      }),
    ),
  ];
  const n = list.length;
  const parts = list.map((p) => {
    const span = p.from === p.to ? `line ${p.from}` : `lines ${p.from}-${p.to}`;
    return `### ${relativePath(p)}, ${span}\n${p.quote}\n\nComment: ${p.text}`;
  });
  return `Code review of ${roots.join(", ")}: ${n} comment${n > 1 ? "s" : ""}. The line numbers and the code are as they were when each comment was written.\n\n${parts.join("\n\n")}`;
}
