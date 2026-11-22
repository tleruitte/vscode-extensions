---
status: done
---

# A general comment in Herdr Comments

## Goal

Today, each comment of Herdr Comments is on lines of a file. The person also wants to write a comment that is not on a file or on lines, for example "Also add tests" or "The approach is good, but rename the commands". The person writes it when the focus is not in an editor, for example in the Herdr Comments view, in Git Changes, or in the Explorer.

Success: the person sends a comment that is not on a file to the agent in Herdr, without leaving the editor.

## Solution

1. **A general comment is part of the review.** A general comment is a pending comment, as a comment on lines is. The agent does not get it immediately. The agent gets it with the other pending comments, in the same message, when the person submits the review. It is like the summary of a GitHub review, but it is not a different step.

2. **A review can have many general comments.** The person adds a general comment each time they think of one, for example "Also add tests", and later "Rename the commands". Each general comment is a row of its own in the Herdr Comments view, as each comment on lines is.

3. **The box accepts many lines.** The person writes a general comment in a box that accepts many lines, as the comment box of the editor does. `Enter` saves the comment. `⇧Enter` or `⌘Enter` starts a new line. A one-line input box is not sufficient.

4. **General comments are on a Review page.** The extension opens a read-only page, "Review", in an editor tab. Each general comment is a comment on this page. The comment box, the keys, and the edit and delete buttons are the same as for a comment on lines. The page shows only the general comments, not the comments on lines. The focus goes to the new tab. This is an acceptable cost for a comment that has no location in the code. At the top, the page has one short line that tells what it is for, for example "General comments for the agent, sent with the review".

5. **Three ways to start a general comment.** `⌃⇧C` starts a general comment when a comment on lines is not possible: when the focus is not in an editor, and in an editor that cannot get a comment on lines, for example the old side of a diff of Git Changes, or the Review page. In an editor that can get a comment on lines, `⌃⇧C` continues to start a comment on lines. In the terminal, `⌃⇧C` does not start a comment: the terminal keeps the key. A **+** button in the title of the Herdr Comments view and a command in the command palette also start a general comment. Each of the three opens the Review page with a new comment box.

6. **General comments are at the top of the view.** In the Herdr Comments view, the general comments are before the comments on lines. Each row has the label **General** and the first line of the comment. A click on the row opens the Review page at that comment. The edit and delete buttons of the row work as they do for a comment on lines.

7. **General comments are first in the message.** The agent gets the general comments before the comments on lines. The general direction of the review then comes before the details, as in a GitHub review.

8. **A review can have only general comments.** Submit is available when there is at least one pending comment of either type. The person can send "Also add tests" from Git Changes, with no comment on lines.

9. **The Review tab closes after a save.** When `Enter` saves a new general comment, or a change to a general comment, the Review tab closes and the focus goes back to where it was, for example to Git Changes. The tab is open only while the person writes. The next time, the page opens again with the earlier general comments. When the person only clicks a row to read a general comment, the tab stays open until the person closes it.

10. **The message names all folders of the window when it has only general comments.** When the review has comments on lines, the message names the folders of these files, as today. When it has only general comments, the message names all folders of the window, because a general comment is about the whole window.

11. **General comments stay when the window reloads,** as the comments on lines do.

12. **Only VS Code and Cursor.** The Obsidian plugin does not get this change. In Obsidian, a review is for one note, so the note gives the context. A later plan can add it if the person needs it.

## Open questions

None.
