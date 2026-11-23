# Herdr Comments

VS Code and Cursor extension that sends your comments on lines of code, as one review, to the coding agent that works on the folder in [Herdr](https://herdr.dev).

## How to use

1. Install the extension (from a `.vsix` or from the [Open VSX Registry](https://open-vsx.org/)). Herdr must run on the same computer.

2. Open the folder of a repository or a worktree that an agent works on in Herdr.

3. Put the cursor on a line, or select some lines. Click **+** in the gutter, or press `⌃⇧C` (**Add Herdr Comment**). Write the comment and press `Enter` or click **Add Comment**. `⇧Enter` or `⌘Enter` starts a new line. The comment goes to the agent at once (see step 6). Add more comments in any file of the folder.

   For a general comment, on no file (for example "Also add tests"), press `⌃⇧C` outside an editor (for example in the Explorer or in [Git Changes](https://github.com/tleruitte/vscode-extensions/tree/main/git-changes)), in an editor that is not a file (for example the old side of a diff), or click **+** in the title of the **Herdr Comments** view or of Git Changes. The **Review** page opens with a comment box. `Enter` saves the comment, closes the page, and gives the focus back to where it was. The terminal keeps `⌃⇧C`.

4. The **Herdr Comments** view lists the pending comments: the comments that did not go to the agent yet. It is in the Explorer. To move it to the Secondary Side Bar, on the right, run **View: Move View**, choose **Herdr Comments**, then **New Secondary Side Bar Entry**. Click a comment to go to it; edit or delete it there or in the editor. The comments stay when the window reloads.

5. The top of the view says which agent gets the comments, for example `To: Claude · setup / fix login`:
   - The candidates are the agents in Herdr whose folder is in the folder of the window. When the folder of the window is in a Git clone, the agent must also be in that clone: a worktree or a clone inside the folder, for example in `.worktrees/`, is not part of it.
   - The default is the agent that has the focus in Herdr, else an idle one, else the first. Click the person icon to choose another candidate.
   - With no candidate, a new agent starts with the first comment, and the next comments go to it: in a new tab of the Herdr space of that folder, else in a new space. The **Herdr Comments: Agent** setting says which agent (`claude` by default).
   - When [herdr-chat](https://github.com/ChmaraX/herdr-chat) is installed, the new agent is a chat. The **Herdr Comments: Chat** setting says which chat mod (`chat` by default; set the name of your fork if you use one). Without that mod, or for an agent other than `claude`, `codex`, or `pi`, the agent starts in a terminal.

6. Each comment goes to the agent when you save it, to the agent that the top of the view shows then. The agent gets the file, the lines, the code as it was when you wrote the comment, and the comment. A working agent gets it during its turn.
   - When the agent waits for your answer to a prompt in Herdr, the comment waits in the view, and goes after you answer, also when the view is hidden. Choose another candidate to send it there now.
   - When a send fails, the comment stays in the view with the error. Click the send icon (**Submit Comments**) to try again; the next comment you save also tries again. Comments that go together are one message, the oldest first.
   - A sent comment goes away: to correct it, write a new comment. You can edit or delete a comment while it is in the view.

### Send the comments as one review

Up to version 0.2.2, the comments stayed pending until you submitted them. To work in that way, turn off the **Herdr Comments: Send Immediately** setting. Then:

- Click the send icon (**Submit Comments**). The agent gets all comments as one message: for each, the file, the lines, the code as it was when you wrote the comment, and the comment. The general comments come first. When the agent waits for your answer to a prompt in Herdr, Submit is off until you answer.
- After a successful send, the comments go away. If the agent changed since the view showed it, Submit does not send: look at the new agent and submit again.

## Contributing

To build, package, or publish the extension, see [CONTRIBUTING.md](https://github.com/tleruitte/vscode-extensions/blob/main/CONTRIBUTING.md).
