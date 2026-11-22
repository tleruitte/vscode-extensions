---
status: done
---

# Git Changes

## Goal

A new extension of this repository, Git Changes. It gives the editor a sidebar of its own, like the Changes panel of Herdr, that shows the files of one diff as a tree, as the Files changed tab of a GitHub pull request does.

The person chooses the diff:

- the uncommitted changes,
- the last commit,
- the changes compared to the main branch,
- a commit, or a range of commits, from the list of recent commits.

The main use is review: the person reads the work of an agent (or their own work), and sometimes comments on it with Herdr Comments. Editing during the review is rare.

Success: the person can review a commit, a range of commits, or a whole branch, without leaving the editor and without the Source Control view.

## Solution

1. **Sidebar.** The extension has its own icon in the activity bar, and its own sidebar.

2. **Choice of the diff.** A button in the title of the sidebar opens a picker. The picker shows, in this order: the uncommitted changes, the last commit, compared to the main branch, "Range of commits…", then the last 10 commits of the current branch. A click on a commit selects only that commit. "Range of commits…" asks for the first commit, then the last commit. The current choice shows next to the title of the sidebar. The extension remembers the choice for each workspace.

3. **What each choice shows.**
   - **Uncommitted changes**: the current files compared with the last commit.
   - **Compared to the main branch**: the current files compared with the point where the branch left the main branch. This includes the uncommitted changes, so the diff is the pull request as it would be if the person committed now. Apart from the uncommitted changes, the diff is the same as the Files changed tab of the GitHub pull request.
   - **Last commit**: only the changes of the last commit, not the later uncommitted changes.
   - **A commit from the list**: only the changes of that commit, not the changes of the later commits or the uncommitted changes.
   - **A range of commits**: the changes of all the commits of the range together, as one diff. Not the changes of the later commits or the uncommitted changes. Separate commits that do not follow each other cannot be combined: the result is not well defined when the commits between them change the same lines.

4. **Main branch.** The main branch is the main branch of the remote, as GitHub compares: the default branch of the remote, else its `main` or `master` branch. When there is no remote, the local main branch is used. The extension does not fetch: the remote branch is as recent as the last fetch of the person.

5. **Tree.** The sidebar shows the changed files of the chosen diff as a folder tree, like a GitHub pull request. Each row looks like an uncommitted file in the Explorer: the file icon of the theme, the name in the color of its status, and the status letter on the right (added, modified, deleted, renamed, untracked). Folders that contain changes have the same color. The status comes from the chosen diff, not from the uncommitted changes: in "compared to the main branch", a file that the agent added and committed shows as added. A renamed file shows under its new name, with its old name as a hint.

6. **Click on a file.**
   - In "uncommitted changes" and "compared to the main branch", a click opens the file in a normal editor.
   - In "last commit", "a commit from the list", and "a range of commits", a click opens the file in a normal editor when the file did not change after the end of that commit or range. This is the usual case. Otherwise, a click opens the diff of that file for that commit or range, and the row shows a small hint ("changed since"). Both sides of that diff are read-only versions: the version before and the version at the end of that commit or range. Herdr Comments does not work on them, because they are not the current file. When the file did not change since, the diff of the row button has the current file on its right side, so Herdr Comments works there.
   - A click on a deleted file opens its diff, because a normal editor cannot open a file that does not exist.

7. **Change marks in the gutter.** In a normal editor, the gutter shows the added, changed, and deleted lines of the chosen diff, also when they are already committed. A click on a mark shows the change in the editor, with the removed lines.
   - In "uncommitted changes", the extension adds no marks: the built-in Git marks are already correct.
   - In the other choices, the editor draws the marks of the chosen diff with its own marks, in its own style. VS Code and Cursor cannot hide the built-in Git marks for one extension, so both show. In the commit and range choices, a file that opens in a normal editor has no uncommitted changes, so only the marks of the chosen diff show. In "compared to the main branch", a file with uncommitted changes also shows the built-in Git marks, mostly on the same lines.
   - The extension does not draw marks of its own: the built-in Git marks would still show next to them, and a click on them would show nothing.
   - To give the editor the marks of the chosen diff, the extension shows as an empty "Git Changes" entry in the Source Control view, only while a choice other than "uncommitted changes" is active.

8. **Diff button.** Each file row also has a button that opens the diff of that one file. The built-in "Open Changes" button of the editor is not enough: it always compares with the last commit.

9. **More than one repository.** When the workspace has more than one folder or Git repository, the tree has one top-level row for each repository, with its changed files below it. With one repository, the tree shows its files directly, without that row.
   - The choice in the title of the sidebar (uncommitted changes, last commit, compared to the main branch) applies to all the repositories.
   - Each repository row has its own picker button. It changes only that repository to a commit or a range of commits of that repository. The choice of each repository shows next to its name.
   - With more than one repository, the picker in the title does not show commits, because a commit belongs to one repository only.
   - A worktree works like any other repository.

10. **Details.**
    - When a click on a row already opens the diff (a "changed since" row, or a deleted file), the button of the row opens the current file instead. That is the only view the click does not give.
    - A file that was deleted or renamed after the chosen commit or range counts as "changed since", so a click opens its diff.
    - When the person changes the choice, the marks of the files that are already open change at once.
    - A merge commit is compared with its first parent, as GitHub does.
    - Binary files show in the tree. A click opens them as the editor usually does, without marks.
    - When the folder is not a Git repository, or the repository has no commits, the sidebar shows a message that says so. On the main branch itself, "compared to the main branch" compares with the main branch of the remote, so it shows the commits that are not pushed and the uncommitted changes, or "No changes".

11. **Refresh.** The sidebar refreshes by itself when files change, after a commit, and when the person changes the branch.

12. **Not included.** The sidebar cannot commit. The person commits in Herdr or in the terminal.

## Open questions

None.
