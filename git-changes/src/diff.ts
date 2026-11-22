import type { Choice } from "./choice";
import { git, short } from "./git";

/** The diff of a choice: from the `base` commit to the `head` commit, or to the current files. */
export interface Diff {
  base: string;
  /** Undefined for the current files. */
  head: string | undefined;
}

export type Status = "A" | "M" | "D" | "R" | "U";

export interface Change {
  /** The path from the root of the repository, with `/`. */
  path: string;
  /** The path before a rename. */
  oldPath?: string;
  status: Status;
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

async function mainBranch(root: string): Promise<string> {
  const ref = await commit(root, "origin/HEAD");
  if (!ref) {
    throw new NoDiff("No main branch: origin/HEAD is not set.");
  }
  return ref;
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
      return { base, head: undefined };
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

export async function changes(root: string, diff: Diff): Promise<Change[]> {
  const args = ["diff", "--name-status", "-z", "--find-renames", diff.base];
  const out = await git(root, diff.head ? [...args, diff.head] : args);
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
  if (!diff.head) {
    const out = await git(root, ["ls-files", "--others", "--exclude-standard", "-z"]);
    const untracked = new Set(out.split("\0").filter(Boolean));
    // A file removed from the index but still on disk is untracked, not deleted.
    return [
      ...result.filter((c) => !untracked.has(c.path)),
      ...[...untracked].map((path): Change => ({ path, status: "U" })),
    ].sort((a, b) => a.path.localeCompare(b.path));
  }
  return result.sort((a, b) => a.path.localeCompare(b.path));
}
