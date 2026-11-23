import type { Choice } from "./choice";
import { git, short } from "./git";

/** The diff of a choice: from the `base` commit to the `head` commit, or to the current files. */
export interface Diff {
  base: string;
  /** Undefined for the current files. */
  head: string | undefined;
  /** The main branch that the diff compares with, for example `origin/main`. */
  main?: string;
}

export type Status = "A" | "M" | "D" | "R" | "U";

export interface Change {
  /** The path from the root of the repository, with `/`. */
  path: string;
  /** The path before a rename. */
  oldPath?: string;
  status: Status;
  /** The current file is not the one at the end of the commit or range. */
  changedSince?: boolean;
}

/** A diff that cannot be shown, with the reason for the person. */
export class NoDiff extends Error {}

async function commit(root: string, rev: string): Promise<string | undefined> {
  try {
    return (await git(root, ["rev-parse", "--verify", "--quiet", `${rev}^{commit}`])).trim();
  } catch {
    return undefined;
  }
}

/** The first parent of `sha`, as GitHub compares a merge commit, else the empty tree. */
async function parent(root: string, sha: string): Promise<string> {
  return (
    (await commit(root, `${sha}^1`)) ??
    (await git(root, ["hash-object", "-t", "tree", "/dev/null"])).trim()
  );
}

async function picked(root: string, sha: string): Promise<string> {
  const found = await commit(root, sha);
  if (!found) {
    throw new NoDiff(`Commit ${short(sha)} is not in the repository.`);
  }
  return found;
}

async function exists(root: string, ref: string): Promise<boolean> {
  try {
    await git(root, ["show-ref", "--verify", "--quiet", ref]);
    return true;
  } catch {
    return false;
  }
}

/**
 * The main branch of the remote, as GitHub compares: the branch of `origin/HEAD`,
 * else `origin/main` or `origin/master`. Without a remote, the local `main` or `master`.
 */
async function mainBranch(root: string): Promise<string> {
  const remotes = (await git(root, ["remote"])).split("\n");
  if (remotes.includes("origin")) {
    try {
      return (await git(root, ["rev-parse", "--abbrev-ref", "origin/HEAD"])).trim();
    } catch {
      // Repositories created with `git init` and then pushed have no origin/HEAD.
    }
  }
  const [prefix, refs] = remotes.includes("origin")
    ? ["origin/", "refs/remotes/origin/"]
    : ["", "refs/heads/"];
  for (const name of ["main", "master"]) {
    if (await exists(root, refs + name)) {
      return prefix + name;
    }
  }
  throw new NoDiff(
    remotes.includes("origin")
      ? "No main branch: origin/HEAD is not set, and there is no origin/main or origin/master. Run `git remote set-head origin --auto`."
      : "No main branch: there is no main or master branch.",
  );
}

export async function resolve(root: string, choice: Choice): Promise<Diff> {
  const head = await commit(root, "HEAD");
  if (!head) {
    throw new NoDiff("No commits yet.");
  }
  switch (choice.kind) {
    case "uncommitted":
      return { base: head, head: undefined };
    case "lastCommit":
      return { base: await parent(root, head), head };
    case "main": {
      const main = await mainBranch(root);
      const base = (await git(root, ["merge-base", main, head])).trim();
      return { base, head: undefined, main };
    }
    case "commit": {
      const sha = await picked(root, choice.commit.sha);
      return { base: await parent(root, sha), head: sha };
    }
    case "range": {
      const from = await picked(root, choice.from.sha);
      return { base: await parent(root, from), head: await picked(root, choice.to.sha) };
    }
  }
}

/**
 * Above this length, the paths do not go on the command line, and Git looks at
 * all the files. The command line of macOS takes about 1 MB.
 */
const MAX_PATHS_LENGTH = 100_000;

function names(out: string): string[] {
  return out.split("\0").filter(Boolean);
}

/** `args` for only `paths`, or for all the files when they are too many. */
function only(args: string[], paths: string[]): string[] {
  const length = paths.reduce((sum, p) => sum + p.length + 1, 0);
  return length > MAX_PATHS_LENGTH ? args : ["--literal-pathspecs", ...args, "--", ...paths];
}

/** The path of an entry of `git status --porcelain=v2`, after its first `fields` fields. */
function pathAfter(entry: string, fields: number): string {
  let at = 0;
  for (let n = 0; n < fields; n++) {
    at = entry.indexOf(" ", at) + 1;
  }
  return entry.slice(at);
}

interface OnDisk {
  /** The tracked files that differ from HEAD or from the index, with the old path of a staged rename. */
  tracked: string[];
  untracked: string[];
}

/**
 * The files that differ from HEAD, from the status of Git. In a large
 * repository the status is fast, because it uses the file monitor and the
 * untracked cache, which a diff of the files on disk and `git ls-files` do not.
 */
async function onDisk(root: string): Promise<OnDisk> {
  const parts = (await git(root, ["status", "--porcelain=v2", "-z", "--untracked-files=normal"])).split("\0");
  const tracked: string[] = [];
  const untracked: string[] = [];
  const folders: string[] = [];
  for (let i = 0; i < parts.length; i++) {
    const entry = parts[i];
    switch (entry[0]) {
      case "1":
        tracked.push(pathAfter(entry, 8));
        break;
      case "2":
        tracked.push(pathAfter(entry, 9), parts[++i]);
        break;
      case "u":
        tracked.push(pathAfter(entry, 10));
        break;
      case "?": {
        const path = entry.slice(2);
        (path.endsWith("/") ? folders : untracked).push(path);
        break;
      }
    }
  }
  // The status shows a new folder as one entry: list the files in it.
  if (folders.length) {
    untracked.push(...names(await git(root, only(["ls-files", "--others", "--exclude-standard", "-z"], folders))));
  }
  return { tracked, untracked };
}

function parseNameStatus(out: string): Change[] {
  const parts = out.split("\0");
  const result: Change[] = [];
  for (let i = 0; i + 1 < parts.length; ) {
    const letter = parts[i++][0];
    if (letter === "R" || letter === "C") {
      const oldPath = parts[i++];
      const path = parts[i++];
      result.push(letter === "R" ? { path, oldPath, status: "R" } : { path, status: "A" });
    } else {
      const path = parts[i++];
      result.push({ path, status: letter === "A" || letter === "D" ? letter : "M" });
    }
  }
  return result;
}

const NAME_STATUS = ["diff", "--name-status", "-z", "--find-renames"];

/** The files that changed from `from` to HEAD, with no rename. */
async function committedSince(root: string, from: string): Promise<string[]> {
  return names(await git(root, ["diff", "--name-only", "-z", "--no-renames", from, "HEAD"]));
}

/**
 * The changes of the diff. A diff with the files on disk runs only on the files
 * that can differ: the ones of the status, and the ones of the commits since
 * the start of the diff.
 */
export async function changes(root: string, diff: Diff): Promise<Change[]> {
  if (diff.head) {
    const [result, disk, later] = await Promise.all([
      git(root, [...NAME_STATUS, diff.base, diff.head]).then(parseNameStatus),
      onDisk(root),
      committedSince(root, diff.head),
    ]);
    const maybe = new Set([...disk.tracked, ...later]);
    const candidates = result.map((c) => c.path).filter((p) => maybe.has(p));
    const after = new Set(
      candidates.length
        ? names(await git(root, only(["diff", "--name-only", "-z", "--no-renames", diff.head], candidates)))
        : [],
    );
    for (const change of result) {
      change.changedSince = after.has(change.path);
    }
    return result.sort((a, b) => a.path.localeCompare(b.path));
  }
  const [disk, committed] = await Promise.all([onDisk(root), committedSince(root, diff.base)]);
  const candidates = [...new Set([...committed, ...disk.tracked])];
  const result = candidates.length
    ? parseNameStatus(await git(root, only([...NAME_STATUS, diff.base], candidates)))
    : [];
  const untracked = new Set(disk.untracked);
  // A file removed from the index but still on disk is untracked, not deleted.
  return [
    ...result.filter((c) => !untracked.has(c.path)),
    ...[...untracked].map((path): Change => ({ path, status: "U" })),
  ].sort((a, b) => a.path.localeCompare(b.path));
}
