import { execFile } from "node:child_process";

/**
 * Env for git subprocesses: ignore inherited worktree overrides from the IDE.
 * With no optional locks, a status does not write the index, so the watchers
 * of the index do not refresh the tree because of its own requests.
 */
function gitEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env, GIT_OPTIONAL_LOCKS: "0" };
  delete env.GIT_DIR;
  delete env.GIT_WORK_TREE;
  return env;
}

export function git(cwd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      "git",
      args,
      { cwd, encoding: "utf8", maxBuffer: 64 * 1024 * 1024, env: gitEnv() },
      (error, stdout, stderr) =>
        error ? reject(new Error(stderr.trim() || error.message)) : resolve(stdout),
    );
  });
}

export interface Commit {
  sha: string;
  subject: string;
}

export function short(sha: string): string {
  return sha.slice(0, 7);
}

/** The last commits of the current branch, newest first. None when the repository has no commits. */
export async function recentCommits(root: string, count: number): Promise<Commit[]> {
  let out: string;
  try {
    out = await git(root, ["log", `--max-count=${count}`, "--format=%H%x00%s"]);
  } catch {
    return [];
  }
  return out
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [sha, subject] = line.split("\0");
      return { sha, subject };
    });
}
