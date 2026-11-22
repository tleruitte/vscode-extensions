import * as vscode from "vscode";
import * as path from "node:path";
import { Pending, Store, relativePath, reviewMessage } from "./comments";
import * as herdr from "./herdr";

/** How often the panel checks the agents while it shows. */
const REFRESH_MS = 3_000;

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
    const item = new vscode.TreeItem(`${path.basename(relativePath(p))}:${lines}`);
    item.id = p.id;
    item.description = p.text.split("\n")[0];
    item.tooltip = new vscode.MarkdownString(
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

  /** While the panel shows, it checks the agents again and again. */
  private watch(): void {
    clearInterval(this.timer);
    this.timer = undefined;
    if (this.view.visible) {
      void this.refresh();
      this.timer = setInterval(() => void this.refresh(), REFRESH_MS);
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
    return target.agent.status === "blocked"
      ? `${to} It waits for your answer in Herdr: answer it there, then submit.`
      : to;
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

  /** Sends all pending comments, or starts an agent with them when no agent works in the folder. */
  async submit(): Promise<void> {
    const list = this.store.list();
    if (!list.length || this.sending) {
      return;
    }
    const before = this.shown;
    this.error = undefined;
    await this.refresh();
    const target = this.lookup?.target;
    if (!target) {
      return;
    }
    // The agent left or another one took its place: show the new one first.
    if (targetKey(target) !== before) {
      void vscode.window.showWarningMessage(
        "The agent that gets the comments changed. Look at the panel, then submit again.",
      );
      return;
    }
    if (target.kind === "agent" && target.agent.status === "blocked") {
      return;
    }
    const text = reviewMessage(list);
    const n = `${list.length} comment${list.length > 1 ? "s" : ""}`;
    this.sending = true;
    this.update();
    try {
      if (target.kind === "agent") {
        await herdr.send(target.agent, text);
        void vscode.window.showInformationMessage(
          `Sent ${n} to ${herdr.describeAgent(target.agent)}.`,
        );
      } else {
        await herdr.start(target.folder, this.program(), text);
        void vscode.window.showInformationMessage(
          `Started ${herdr.programName(this.program())} in Herdr with ${n}.`,
        );
      }
      this.sending = false;
      await this.store.clear();
    } catch (e) {
      this.sending = false;
      this.error = `Send failed: ${e instanceof Error ? e.message : String(e)}`;
      void vscode.window.showErrorMessage(this.error);
      this.update();
    }
  }
}
