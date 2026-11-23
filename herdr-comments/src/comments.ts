import * as vscode from "vscode";
import * as path from "node:path";
import { randomUUID } from "node:crypto";

/**
 * A pending comment, as kept in the workspace state. The lines (1-based) and
 * the quoted code stay as they were when the comment was written, so the
 * agent gets the code that the person saw. A general comment is on no file:
 * it has the URI of the Review page, no lines (0), and no quote.
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

/** The read-only page that holds the general comments. */
export const REVIEW_URI = vscode.Uri.from({ scheme: "herdr-comments", path: "/Review" });

export function isGeneral(p: Pending): boolean {
  return p.uri === REVIEW_URI.toString();
}

function isReview(uri: vscode.Uri): boolean {
  return uri.toString() === REVIEW_URI.toString();
}

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
  private readonly reviewAsked = new vscode.EventEmitter<void>();
  /** The editor asked where the Review page can get a comment: a new comment box can open on it. */
  readonly onDidAskReview = this.reviewAsked.event;

  /** The documents that the editor asked about, so that the log has one line for each. */
  private readonly asked = new Set<string>();

  constructor(
    private readonly state: vscode.Memento,
    private readonly log: vscode.LogOutputChannel,
  ) {
    this.controller = vscode.comments.createCommentController(
      "herdrComments",
      "Herdr Comments",
    );
    this.controller.options = {
      prompt: "Add a comment for the agent",
      placeHolder: "Comment for the agent",
    };
    // Every line of a file can get a comment: the "+" in the gutter. On the
    // Review page, only the line after the general comments can.
    this.controller.commentingRangeProvider = {
      provideCommentingRanges: (doc) => {
        if (isReview(doc.uri)) {
          this.reviewAsked.fire();
          const line = this.newGeneralLine();
          return [new vscode.Range(line, 0, line, 0)];
        }
        const ranges =
          doc.uri.scheme === "file"
            ? [new vscode.Range(0, 0, Math.max(doc.lineCount - 1, 0), 0)]
            : [];
        // When a file has no "+" in the gutter, the log tells if the editor
        // asked for its lines: a file that is not in the log was not asked about.
        const key = doc.uri.toString();
        if (!this.asked.has(key)) {
          this.asked.add(key);
          this.log.info(
            `Commenting ranges asked for ${key}: ${ranges.length ? `lines 1-${doc.lineCount}` : "none"}`,
          );
        }
        return ranges;
      },
    };
    this.pending = state.get<Pending[]>(STATE_KEY, []);
    for (const p of this.pending) {
      // A general comment gets its line of the Review page below.
      const thread = this.controller.createCommentThread(
        vscode.Uri.parse(p.uri),
        isGeneral(p)
          ? new vscode.Range(0, 0, 0, 0)
          : new vscode.Range(p.from - 1, 0, p.to - 1, 0),
        [],
      );
      this.show(thread, p);
    }
    this.placeGenerals();
  }

  dispose(): void {
    this.controller.dispose();
    this.changed.dispose();
    this.reviewAsked.dispose();
  }

  /** The pending comments: the general comments first, then the others by file and line. */
  list(): Pending[] {
    return [...this.pending].sort(
      (a, b) =>
        Number(isGeneral(b)) - Number(isGeneral(a)) ||
        a.uri.localeCompare(b.uri) ||
        a.from - b.from,
    );
  }

  /** The general comments, in the order they were written. */
  generals(): Pending[] {
    return this.pending.filter(isGeneral);
  }

  /**
   * The line of a general comment on the Review page. Each general comment has
   * a line of its own after the first line, because on a line that has a
   * comment, the editor opens that comment instead of a new comment box.
   */
  private generalLine(p: Pending): number {
    return this.generals().indexOf(p) + 1;
  }

  /** The line of the Review page for a new general comment. */
  newGeneralLine(): number {
    return this.generals().length + 1;
  }

  /** Puts the comment of each general comment on its line of the Review page. */
  private placeGenerals(): void {
    for (const p of this.generals()) {
      const thread = this.threads.get(p.id);
      const line = this.generalLine(p);
      if (thread) {
        thread.range = new vscode.Range(line, 0, line, 0);
      }
    }
  }

  get(id: string): Pending | undefined {
    return this.pending.find((p) => p.id === id);
  }

  /** Saves the text of a new comment box as a pending comment, and gives its ID. */
  async add(reply: vscode.CommentReply): Promise<string | undefined> {
    const text = reply.text.trim();
    const { thread } = reply;
    if (!text || !thread.range) {
      return undefined;
    }
    if (isReview(thread.uri)) {
      const p: Pending = {
        id: randomUUID(),
        uri: thread.uri.toString(),
        from: 0,
        to: 0,
        quote: "",
        text,
      };
      this.show(thread, p);
      this.pending.push(p);
      this.placeGenerals();
      await this.save();
      return p.id;
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
    return p.id;
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

  /** Saves the new text of a comment, and says whether it did. */
  async saveEdit(comment: NoteComment): Promise<boolean> {
    const p = this.get(comment.id);
    // The comment box writes the new text into the body of the comment.
    const body = comment.body;
    const text = (typeof body === "string" ? body : body.value).trim();
    if (!p || !text) {
      this.cancelEdit(comment);
      return false;
    }
    p.text = text;
    this.render(p);
    await this.save();
    return true;
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
    this.placeGenerals();
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
    const line = isGeneral(p) ? this.generalLine(p) : p.from - 1;
    await vscode.window.showTextDocument(vscode.Uri.parse(p.uri), {
      selection: new vscode.Range(line, 0, line, 0),
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
      thread.label = isGeneral(p)
        ? "General"
        : p.from === p.to
          ? `Line ${p.from}`
          : `Lines ${p.from}-${p.to}`;
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

/**
 * The comments as one review message, in the shape of the Herdr reviewer. It
 * names the folders of the commented files, or all folders of the window when
 * the review has only general comments.
 */
export function reviewMessage(list: Pending[]): string {
  const onLines = list.filter((p) => !isGeneral(p));
  const roots = onLines.length
    ? [
        ...new Set(
          onLines.map((p) => {
            const uri = vscode.Uri.parse(p.uri);
            return (
              vscode.workspace.getWorkspaceFolder(uri)?.uri.fsPath ??
              path.dirname(uri.fsPath)
            );
          }),
        ),
      ]
    : (vscode.workspace.workspaceFolders ?? [])
        .filter((f) => f.uri.scheme === "file")
        .map((f) => f.uri.fsPath);
  const n = list.length;
  const parts = list.map((p) => {
    if (isGeneral(p)) {
      return `### General comment\n${p.text}`;
    }
    const span = p.from === p.to ? `line ${p.from}` : `lines ${p.from}-${p.to}`;
    return `### ${relativePath(p)}, ${span}\n${p.quote}\n\nComment: ${p.text}`;
  });
  const asWritten = onLines.length
    ? " The line numbers and the code are as they were when each comment was written."
    : "";
  return `Code review of ${roots.join(", ")}: ${n} comment${n > 1 ? "s" : ""}.${asWritten}\n\n${parts.join("\n\n")}`;
}
