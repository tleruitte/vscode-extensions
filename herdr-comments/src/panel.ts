import * as vscode from "vscode";
import * as path from "node:path";
import { Pending, Store, isGeneral, relativePath, reviewMessage } from "./comments";
import * as herdr from "./herdr";

/** How often the panel checks the agents while it shows, or while comments wait for the agent. */
const REFRESH_MS = 3_000;
/** After a start, how long the next comments wait for the new agent before another agent can start. */
const START_GRACE_MS = 60_000;

/** What asks for a send: Submit, a save with the preference on, or the check of a waiting comment. */
type Cause = "submit" | "save" | "wait";

/** The preference to send each comment when the person saves it. */
export function sendsImmediately(): boolean {
  return vscode.workspace
    .getConfiguration("herdrComments")
    .get<boolean>("sendImmediately", true);
}

/** A key that changes when the target changes, so Submit never goes to an agent the person did not see. */
function targetKey(target: herdr.Target): string {
  return target.kind === "agent" ? target.agent.address : `start:${target.folder}`;
}

/**
 * The panel of pending comments. Its message says where the comments go, and
 * its title has the Submit button and the agent choice.
 */
export class Panel implements vscode.TreeDataProvider<Pending>, vscode.Disposable {
  private readonly view: vscode.TreeView<Pending>;
  private readonly changed = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this.changed.event;
  private lookup: herdr.Lookup | undefined;
  private unavailable: string | undefined;
  private error: string | undefined;
  /** The agent the person picked in the panel. */
  private chosen: string | undefined;
  /** The target that the panel shows now. */
  private shown: string | undefined;
  private timer: NodeJS.Timeout | undefined;
  private refreshing: Promise<void> | undefined;
  private sending = false;
  /** With the preference on, the pending comments wait for the agent, and go when it can get them. */
  private waiting = false;
  /** When the last start of an agent ended, so that the next comments go to that agent. */
  private startedAt: number | undefined;
  private readonly disposables: vscode.Disposable[] = [];

  constructor(private readonly store: Store) {
    this.view = vscode.window.createTreeView("herdrComments.pending", {
      treeDataProvider: this,
    });
    this.disposables.push(
      this.view,
      this.changed,
      this.view.onDidChangeVisibility(() => this.watch()),
      store.onDidChange(() => {
        this.error = undefined;
        this.changed.fire();
        void this.refresh();
      }),
      vscode.workspace.onDidChangeWorkspaceFolders(() => void this.refresh()),
      vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration("herdrComments.sendImmediately")) {
          // Turned off, the waiting comments wait for Submit. Turned on, nothing goes before the next save.
          this.waiting = false;
          this.watch();
          this.update();
        }
      }),
    );
    this.watch();
  }

  dispose(): void {
    clearInterval(this.timer);
    for (const d of this.disposables) {
      d.dispose();
    }
  }

  getChildren(): Pending[] {
    return this.store.list();
  }

  getTreeItem(p: Pending): vscode.TreeItem {
    const lines = p.from === p.to ? `${p.from}` : `${p.from}-${p.to}`;
    const item = new vscode.TreeItem(
      isGeneral(p) ? "General" : `${path.basename(relativePath(p))}:${lines}`,
    );
    item.id = p.id;
    item.description = p.text.split("\n")[0];
    item.tooltip = isGeneral(p)
      ? new vscode.MarkdownString("**General comment**\n\n" + p.text)
      : new vscode.MarkdownString(
          `**${relativePath(p)}**, ${p.from === p.to ? "line" : "lines"} ${lines}\n\n` +
            "```\n" + p.quote + "\n```\n\n" + p.text,
        );
    item.iconPath = new vscode.ThemeIcon("comment");
    item.contextValue = "herdrComment";
    item.command = {
      command: "herdrComments.reveal",
      title: "Show the Comment",
      arguments: [p],
    };
    return item;
  }

  /**
   * While the panel shows, it checks the agents again and again. While
   * comments wait for the agent, it does so also when it is hidden, and sends
   * them when the agent can get them.
   */
  private watch(): void {
    clearInterval(this.timer);
    this.timer = undefined;
    if (this.view.visible || this.waiting) {
      void this.tick();
      this.timer = setInterval(() => void this.tick(), REFRESH_MS);
    }
  }

  private tick(): Promise<void> {
    return this.waiting && sendsImmediately() ? this.deliver("wait") : this.refresh();
  }

  private wait(on: boolean): void {
    if (this.waiting !== on) {
      this.waiting = on;
      this.watch();
    }
  }

  private folders(): string[] {
    return (vscode.workspace.workspaceFolders ?? [])
      .filter((f) => f.uri.scheme === "file")
      .map((f) => f.uri.fsPath);
  }

  private program(): string {
    return vscode.workspace
      .getConfiguration("herdrComments")
      .get<string>("agent", "claude");
  }

  private chatMod(): string {
    return vscode.workspace
      .getConfiguration("herdrComments")
      .get<string>("chat", "chat");
  }

  refresh(): Promise<void> {
    this.refreshing ??= this.lookUp().finally(() => {
      this.refreshing = undefined;
    });
    return this.refreshing;
  }

  private async lookUp(): Promise<void> {
    const folders = this.folders();
    if (!folders.length) {
      this.lookup = undefined;
      this.unavailable = "Open a folder to send comments to its agent.";
    } else {
      try {
        this.lookup = await herdr.lookUp(folders, this.chosen);
        this.unavailable = undefined;
      } catch (e) {
        this.lookup = undefined;
        this.unavailable =
          e instanceof herdr.HerdrError && e.message.startsWith("Herdr is not available")
            ? e.message
            : `Herdr is not available: ${e instanceof Error ? e.message : String(e)}`;
      }
    }
    this.update();
  }

  private update(): void {
    const lookup = this.lookup;
    const target = lookup?.target;
    this.shown = target ? targetKey(target) : undefined;
    const blocked = target?.kind === "agent" && target.agent.status === "blocked";
    const canStart = target?.kind === "start" && lookup?.windowOpen === true;
    const canSubmit =
      !this.sending &&
      this.store.list().length > 0 &&
      ((target?.kind === "agent" && !blocked) || canStart);
    void vscode.commands.executeCommand("setContext", "herdrComments.canSubmit", canSubmit);
    void vscode.commands.executeCommand(
      "setContext",
      "herdrComments.startsAgent",
      target?.kind === "start",
    );
    void vscode.commands.executeCommand(
      "setContext",
      "herdrComments.hasCandidates",
      (lookup?.candidates.length ?? 0) > 0,
    );
    this.view.message = [this.error, this.describe(lookup)]
      .filter(Boolean)
      .join(" ");
  }

  private describe(lookup: herdr.Lookup | undefined): string {
    if (!lookup) {
      return this.unavailable ?? "";
    }
    const { target } = lookup;
    if (target.kind === "start") {
      const folder = path.basename(target.folder);
      return lookup.windowOpen
        ? `To: a new ${herdr.programName(this.program())} agent in ${folder}.`
        : `No agent works in ${folder}. Open the Herdr window to start one.`;
    }
    const to = `To: ${herdr.describeAgent(target.agent)}.`;
    if (target.agent.status !== "blocked") {
      return to;
    }
    return sendsImmediately()
      ? `${to} It waits for your answer in Herdr: the comments go after you answer it there.`
      : `${to} It waits for your answer in Herdr: answer it there, then submit.`;
  }

  async chooseAgent(): Promise<void> {
    await this.refresh();
    const lookup = this.lookup;
    if (!lookup?.candidates.length) {
      return;
    }
    const current = lookup.target.kind === "agent" ? lookup.target.agent.address : undefined;
    const picked = await vscode.window.showQuickPick(
      lookup.candidates.map((a) => ({
        label: herdr.describeAgent(a),
        description: a.address === current ? `${a.status} · current` : a.status,
        address: a.address,
      })),
      { placeHolder: "The agent that gets the comments" },
    );
    if (picked) {
      this.chosen = picked.address;
      await this.refresh();
    }
  }

  /** With the preference on, sends the pending comments after a save, or waits for the agent. */
  async saved(): Promise<void> {
    if (sendsImmediately()) {
      await this.deliver("save");
    }
  }

  /** Sends all pending comments, or starts an agent with them when no agent works in the folder. */
  submit(): Promise<void> {
    return this.deliver("submit");
  }

  /**
   * Sends all pending comments, or starts an agent with them when no agent
   * works in the folder. With the preference on, they go to the agent that is
   * the default now, in the order they were written; when that agent waits
   * for an answer, or a new agent starts, they wait. With the preference off,
   * they go only to the agent that the panel showed.
   */
  private async deliver(cause: Cause): Promise<void> {
    // A comment saved during a send goes after it, to the same agent.
    if (this.sending || !this.store.list().length) {
      if (!this.sending) {
        this.wait(false);
      }
      return;
    }
    const auto = sendsImmediately();
    const before = this.shown;
    await this.refresh();
    const lookup = this.lookup;
    const target = lookup?.target;
    if (!target) {
      if (cause !== "submit") {
        this.fail(this.unavailable ?? "Herdr is not available.");
      }
      return;
    }
    // The agent left or another one took its place: show the new one first.
    if (!auto && targetKey(target) !== before) {
      void vscode.window.showWarningMessage(
        "The agent that gets the comments changed. Look at the panel, then submit again.",
      );
      return;
    }
    // A comment would answer the prompt of the agent.
    if (target.kind === "agent" && target.agent.status === "blocked") {
      if (auto) {
        this.wait(true);
      }
      return;
    }
    if (target.kind === "start") {
      // The agent that started last does not show yet: the comments go to it when it does.
      if (auto && this.startedAt !== undefined && Date.now() - this.startedAt < START_GRACE_MS) {
        this.wait(true);
        return;
      }
      if (!lookup.windowOpen) {
        if (cause !== "submit") {
          this.fail(`No agent works in ${path.basename(target.folder)}. Open the Herdr window to start one.`);
        }
        return;
      }
    }
    const list = auto ? this.store.inOrder() : this.store.list();
    const text = reviewMessage(list);
    const n = `${list.length} comment${list.length > 1 ? "s" : ""}`;
    const tell = (message: string): void => {
      if (auto) {
        vscode.window.setStatusBarMessage(`Herdr Comments: ${message}`, 5_000);
      } else {
        void vscode.window.showInformationMessage(message);
      }
    };
    this.sending = true;
    this.error = undefined;
    this.update();
    try {
      if (target.kind === "agent") {
        await herdr.send(target.agent, text);
        tell(`Sent ${n} to ${herdr.describeAgent(target.agent)}.`);
      } else {
        await herdr.start(target.folder, this.program(), text, this.chatMod());
        this.startedAt = Date.now();
        tell(`Started ${herdr.programName(this.program())} in Herdr with ${n}.`);
      }
    } catch (e) {
      this.sending = false;
      this.fail(`Send failed: ${e instanceof Error ? e.message : String(e)}`);
      return;
    }
    this.sending = false;
    this.wait(false);
    await this.store.remove(list.map((p) => p.id));
    if (auto && this.store.list().length) {
      await this.deliver("save");
    }
  }

  /** The pending comments stay, with the error. Submit or the next save tries again. */
  private fail(message: string): void {
    this.wait(false);
    this.error = message;
    void vscode.window.showErrorMessage(message);
    this.update();
  }
}
