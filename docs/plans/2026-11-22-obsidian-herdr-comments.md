---
status: started
---

# Herdr Comments for Obsidian

## Goal

An Obsidian plugin that does what Herdr Comments does in VS Code and Cursor. The person comments on the text of a note, then sends the comments as one review to a coding agent in Herdr. It works in the same way, with a shortcut to comment and a shortcut to submit.

Success: the person reads a note in Obsidian (for example a plan that an agent wrote), comments on parts of it, and sends the review to the agent without leaving Obsidian.

## Solution

1. **One review for each note.** Each note has its own set of pending comments. The person submits the comments of one note only. A review never covers more than one note. This makes it easy to find the agent that the review is for. (This is different from VS Code, where one review can cover many files.)

2. **A comment is on the selected text.** In the editing view (Source or Live Preview), the person selects some text and uses the command to comment. The comment is on that text, not on full lines. When nothing is selected, the comment is on the full line of the cursor. (This is different from VS Code, where a comment is always on full lines. For notes, one line is often a full paragraph, so the selected text is more precise.)

3. **The person writes the comment in the side panel.** The command opens the side panel if it is closed. A new comment shows at the top of the panel, with the commented text, and the focus goes to it. `Enter` saves the comment. `⇧Enter` or `⌘Enter` starts a new line, as in VS Code. The person can edit or delete a comment in the panel.

4. **Comments follow the text.** When the note changes before the person submits, each comment stays on its text. For example, when lines are added above the text, the comment moves down with it. When the text of a comment is deleted, the side panel shows that the comment has lost its text. The review still sends that comment, with the text as it was.

5. **Markers.**
   - In the editing view, the commented text has a highlight, and the line has a mark in the margin.
   - In the reading view, a mark in the margin shows each block (a paragraph, a list item, or a code block) that has a comment. The reading view cannot mark a part of a block. The person cannot add a comment in the reading view; to add one, they go to the editing view.
   - A click on a highlight or a mark selects its comment in the side panel. A click on a comment in the panel goes to its text.

6. **The side panel shows the open note.** The side panel shows only the comments of the note that is open. It changes when the person opens a different note. At the top, it shows the agent that gets the review and the Submit button. A short line tells how many other notes have pending comments, so that the person does not forget them.

7. **The agent that gets the review.** The candidates are the agents in Herdr whose folder holds the note. An agent at the root of the vault is also a candidate. The default candidate is the same as in VS Code: the agent that has the focus in Herdr, then an idle agent, then the first agent. The person can choose a different candidate.

8. **No candidate: start an agent.** When no agent is a candidate, Submit starts a new agent with the comments, as in VS Code. The agent is a chat of herdr-chat when it is installed, else a terminal. It starts in the folder of the note, in the Herdr space of that folder, else in a new space. The next time, this agent is a candidate for the note.

9. **What the agent gets.** The review has the same shape as in VS Code. At the top, it gives the path of the note, relative to the folder of the agent, one time only. Then, for each comment: the line number, the commented text as it was when the person wrote the comment, and the comment. The line number is the current line of the text, because the comment follows the text.

10. **Where the comments stay.** The pending comments stay in the data of the plugin, not in the notes and not in other files of the vault. The notes do not change, and the agent does not see the comments before the person submits them. The comments stay when Obsidian restarts. When the person renames or moves a note, its comments go with it. When the person deletes a note, its comments are deleted. After a successful send, the comments of that note go away, as in VS Code.

11. **Shortcuts.** The plugin has no default shortcuts, as the Obsidian rules for community plugins ask. The README tells the person to set `⌘I` to comment and `⌘⇧I` to submit. These keys replace two Obsidian defaults: italics (`⌘I`) and the developer tools (`⌘⇧I`). The README says so.

12. **Repository and install.** The plugin is in a new public Git repository of its own, apart from the VS Code extensions. The repository can go into the list of Obsidian community plugins later; that list needs one plugin for each repository. For now, the person builds the plugin and links the build into the vault. The plugin works only on desktop, because it uses the Herdr tools of the computer, as the VS Code extension does.

13. **The Herdr part is a copy.** The part that finds the agents, sends the review, and starts an agent is a copy of the part in the VS Code extension. The two copies can change independently.

### Out of scope for now

- A file in a folder of the vault that links the folder to a worktree or a repository, to find the agent. This comes later.
- Comments from the reading view.
- A place in the list of Obsidian community plugins.

### What other plugins show

Many Obsidian plugins add comments to notes. These points come from them:

- **Side panel for the open note.** Most of them have a panel that lists the comments of the open note. You can click a comment to go to it, and edit or delete it in the panel. Side Note, Side Comments, Tandem Comments, and Document Comments all work like this.
- **Comments that stay out of the note.** Side Comments and Promptuary keep the comments outside the note, in a separate file for each note. Tandem Comments and Document Comments write the comments into the note.
- **Markers in the reading view.** Only a few plugins do this. The reading view shows rendered blocks, not lines. Obsidian tells a plugin which lines of the note each block comes from, so a plugin can mark a full block (a paragraph, a list item, or a code block) but not one line inside it. Side Comments and Document Comments do this.
- **A marker in the margin of the editor.** Side Comments puts a mark next to each commented line, in the margin of the editing view. This is the nearest to the "+" and the comment lines of VS Code.
- **Comments that follow edits.** Side Note, Side Comments, and Tandem Comments move a comment when the text above it changes. When the commented text is deleted, the comment becomes an "orphan".
- **Sending to an AI.** Promptuary collects the review comments of a note and gives them to a coding agent on the command line in one step. It is the plugin that is nearest to this one, but it does not know Herdr.

Side Note, Side Comments, Tandem Comments, Document Comments, and Promptuary use the MIT license, so we can use parts of them. Sidebar Highlights (GPL) and Review Comments (AGPL) are only examples to look at.

## Open questions

None.
