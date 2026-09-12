# Fix: Preserve Canvas Workspace During Adjustments

The adjustments controls increased the height of the Properties panel. Without an internal overflow boundary, the inspector could influence the editor frame and make the central canvas area appear compressed or mis-sized.

The fix now gives the editor frame an explicit viewport height, prevents the workspace and inspector from overflowing the frame, and sets the Properties panel to `height: 0` with flex growth so its content scrolls inside the right column. The center canvas remains the flexible middle column and cannot be resized by the adjustment controls.

PR #58 should remain unmerged until this follow-up commit is visible in the same branch.
