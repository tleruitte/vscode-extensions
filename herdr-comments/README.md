# Herdr Comments

VS Code and Cursor extension that sends your comments on lines of code, as one review, to the coding agent that works on the folder in [Herdr](https://herdr.dev).

## How to use

1. Install the extension (from a `.vsix` or from the [Open VSX Registry](https://open-vsx.org/)). Herdr must run on the same computer.

2. Open the folder of a repository or a worktree that an agent works on in Herdr.

3. Put the cursor on a line, or select some lines. Click **+** in the gutter, or press `⌃⇧C` (**Add Herdr Comment**). Write the comment and click **Add Comment**. Add more comments in any file of the folder.

4. The **Herdr Comments** view of the Explorer lists the pending comments. Click a comment to go to it; edit or delete it there or in the editor. The comments stay when the window reloads.

5. The top of the view says which agent gets the comments, for example `To: Claude · setup / fix login`:
   - The candidates are the agents in Herdr whose folder is in the folder of the window.
   - The default is the agent that has the focus in Herdr, else an idle one, else the first. Click the person icon to choose another candidate.
   - With no candidate, a new agent starts with the comments: in a new tab of the Herdr space of that folder, else in a new space. The **Herdr Comments: Agent** setting says which agent (`claude` by default).

6. Click the send icon (**Submit Comments**). The agent gets all comments as one message: for each, the file, the lines, the code as it was when you wrote the comment, and the comment. A working agent gets it during its turn. When the agent waits for your answer to a prompt in Herdr, Submit is off until you answer.

After a successful send, the comments go away. If the agent changed since the view showed it, Submit does not send: look at the new agent and submit again.

## Contributing

To build, package, or publish the extension, see [CONTRIBUTING.md](https://github.com/tleruitte/vscode-extensions/blob/main/CONTRIBUTING.md).
