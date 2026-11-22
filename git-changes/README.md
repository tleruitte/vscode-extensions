# Git Changes

VS Code and Cursor extension that shows the files of a chosen diff as a tree, in a sidebar of its own, like the Files changed tab of a GitHub pull request.

## How to use

1. Install the extension (from a `.vsix` or from the [Open VSX Registry](https://open-vsx.org/)).

2. Open the folder of a Git repository or a worktree.

3. Click the **Git Changes** icon in the activity bar.

4. Click the compare icon (**Choose the Diff**) in the title of the sidebar, and choose which changes to show:
   - **Uncommitted changes**: the current files compared with the last commit.
   - **Last commit**: only the changes of the last commit.
   - **Compared to main**: the current files compared with the point where the branch left the main branch, with the uncommitted changes.
   - **Range of commits…**: pick the first commit, then the last commit.
   - One of the last 10 commits: only the changes of that commit.

   The title of the sidebar shows the choice. Git Changes remembers it for the workspace.

## Contributing

To build, package, or publish the extension, see [CONTRIBUTING.md](https://github.com/tleruitte/vscode-extensions/blob/main/CONTRIBUTING.md).
