# Fix: Preserve Canvas Workspace During Adjustments

The adjustments controls increased the height of the Properties panel. Without an internal overflow boundary, the inspector could influence the editor frame and make the central canvas area appear compressed or mis-sized.

This fix keeps the editor columns bounded, allows the inspector content to scroll inside its own panel, and constrains the canvas card to the available center workspace. The image workspace remains the flexible center column and is no longer resized by the controls added to the right panel.

PR #58 should remain unmerged until this follow-up commit is visible in the same branch.
