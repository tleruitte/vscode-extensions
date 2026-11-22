import { execFile } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

/** A live agent in Herdr: a terminal whose program reports a status. */
export interface Agent {
  address: string;
  program: string;
  cwd: string;
  status: "working" | "blocked" | "idle" | "done";
  /** The space and tab of the agent, for example "setup / markdown editor". */
  where: string;
}

/** Where the comments go: an agent, or a new agent in a folder. */
export type Target =
  | { kind: "agent"; agent: Agent }
  | { kind: "start"; folder: string };

export interface Lookup {
  target: Target;
  candidates: Agent[];
  /** Starting an agent needs the Herdr window; sending to one needs only herdr-core. */
  windowOpen: boolean;
}

/** Herdr could not be reached, or refused a command. */
export class HerdrError extends Error {}

interface Terminal {
  address: string;
  agent?: string;
  cwd?: string;
  state: string;
  status?: Agent["status"];
  where?: string;
}

interface Space {
  id: string;
  machine: string | null;
  tabs: { terminals: { terminal: string }[] }[];
}

function isExecutable(file: string): boolean {
  try {
    fs.accessSync(file, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Cursor started from the Dock does not get the PATH of the shell, so also
 * look where Herdr installs its tools.
 */
function findTool(name: string, installed: string): string {
  const dirs = [
    ...(process.env.PATH ?? "").split(path.delimiter),
    path.join(os.homedir(), ".local", "bin"),
    "/opt/homebrew/bin",
    "/usr/local/bin",
  ].filter(Boolean);
  const found = [...dirs.map((dir) => path.join(dir, name)), installed].find(
    isExecutable,
  );
  if (!found) {
    throw new HerdrError(`Herdr is not available: ${name} was not found.`);
  }
  return found;
}

const hc = (): string =>
  findTool(
    "hc",
    path.join(
      os.homedir(),
      ".local/share/herdr-core/current/Contents/MacOS/herdr-core",
    ),
  );

const herdrApp = (): string =>
  findTool("herdr-app", "/Applications/Herdr.app/Contents/MacOS/Herdr");

/** herdr-app reports errors as `{"error": "..."}` on stdout. */
function errorText(stdout: string, stderr: string, fallback: string): string {
  try {
    const parsed = JSON.parse(stdout) as { error?: unknown };
    if (typeof parsed.error === "string") {
      return parsed.error;
    }
  } catch {
    // Not JSON: use the raw output.
  }
  return (stderr || stdout || fallback).trim();
}

function run(file: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      file,
      args,
      { encoding: "utf8", timeout: 15_000, maxBuffer: 16 * 1024 * 1024 },
      (error, stdout, stderr) => {
        if (error) {
          reject(new HerdrError(errorText(stdout, stderr, error.message)));
        } else {
          resolve(stdout);
        }
      },
    );
  });
}

async function liveTerminals(): Promise<Terminal[]> {
  const output = JSON.parse(await run(hc(), ["ls", "--json"])) as {
    terminals: Terminal[];
  };
  // Other machines are out of scope: Cursor opens local folders.
  return output.terminals.filter(
    (t) => t.state === "live" && !t.address.includes("/"),
  );
}

/** The agent that has the focus in the Herdr window, and whether the window is open. */
async function windowFocus(): Promise<{ open: boolean; agent: string | null }> {
  try {
    const status = JSON.parse(await run(herdrApp(), ["status"])) as {
      agent?: string | null;
    };
    return { open: true, agent: status.agent ?? null };
  } catch {
    return { open: false, agent: null };
  }
}

function realPath(p: string): string {
  try {
    return fs.realpathSync(p);
  } catch {
    return p;
  }
}

function isInside(folder: string, p: string): boolean {
  const rel = path.relative(realPath(folder), realPath(p));
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

/** "claude" → "Claude". */
export function programName(command: string): string {
  const program = path.basename(command.trim().split(/\s+/)[0] ?? "");
  return program.charAt(0).toUpperCase() + program.slice(1);
}

export function describeAgent(agent: Agent): string {
  return `${programName(agent.program)} · ${agent.where}`;
}

/**
 * The candidates are the agents whose folder is in one of `folders`. The
 * target is the `chosen` candidate, else the candidate that has the focus in
 * Herdr, else an idle one, else the first. With no candidate, the target is a
 * new agent in the first folder.
 */
export async function lookUp(
  folders: string[],
  chosen: string | undefined,
): Promise<Lookup> {
  const [terminals, focus] = await Promise.all([
    liveTerminals(),
    windowFocus(),
  ]);
  const candidates: Agent[] = terminals
    .filter((t) => t.status && t.cwd && folders.some((f) => isInside(f, t.cwd!)))
    .map((t) => ({
      address: t.address,
      program: t.agent ?? "agent",
      cwd: t.cwd!,
      status: t.status!,
      where: t.where ?? t.address,
    }));
  const agent =
    candidates.find((a) => a.address === chosen) ??
    candidates.find((a) => a.address === focus.agent) ??
    candidates.find((a) => a.status === "idle" || a.status === "done") ??
    candidates[0];
  return {
    target: agent
      ? { kind: "agent", agent }
      : { kind: "start", folder: folders[0] },
    candidates,
    windowOpen: focus.open,
  };
}

/** Pastes the text into the agent and presses Enter. A working agent gets it during its turn. */
export async function send(agent: Agent, text: string): Promise<void> {
  await run(hc(), ["send", agent.address, text]);
}

/**
 * Starts `command` with the text as its first message: in a new tab of the
 * space whose terminals are in the folder, else in a new space at the folder.
 */
export async function start(
  folder: string,
  command: string,
  text: string,
): Promise<void> {
  const app = herdrApp();
  const [layout, terminals] = await Promise.all([
    run(app, ["ls"]).then((out) => JSON.parse(out) as { spaces: Space[] }),
    liveTerminals(),
  ]);
  const cwds = new Map(terminals.map((t) => [t.address, t.cwd]));
  const space = layout.spaces.find(
    (s) =>
      s.machine === null &&
      s.tabs.some((tab) =>
        tab.terminals.some((t) => {
          const cwd = cwds.get(t.terminal);
          return cwd !== undefined && isInside(folder, cwd);
        }),
      ),
  );
  const argv = command.trim().split(/\s+/);
  const args = space
    ? ["tab.new", JSON.stringify({ space: space.id, folder, argv, task: text })]
    : ["space.new", JSON.stringify({ folder, argv, task: text })];
  await run(app, ["do", ...args]);
}
