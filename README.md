# TreeScope — Working Interactive BST Visualizer

This fixes the previous Phase 1 package: most controls were deliberately disabled there. **Use this folder instead of the old one.**

## Run on Windows / VS Code

1. Extract the ZIP archive. Keep `index.html`, `styles.css` and `app.js` **together in the same folder**.
2. Open that folder in VS Code.
3. Double-click `index.html` to launch it in your browser, or right-click `index.html` → **Open with Live Server** if you have that extension.
4. No Python, Node.js, database or npm packages required.

## Features you can use now

- **Insert**: enter a number; click Insert. The app traces BST comparisons and rejects duplicates.
- **Delete**: enter a number; click Delete. Two-child deletion uses the inorder successor.
- **Search**: enter a number; click Search. It highlights visited nodes and found node.
- **Recursive traversals**: click the left-side Inorder/Preorder/Postorder buttons for a detailed animated explanation. The tabs on the right show immediate traversal previews.
- **Playback**: Play/Pause, Previous, Next, Restart, progress, speed (0.5×–2×). Animated movement/highlighting uses **linear** timing.
- **Tree management**: Random Tree (1–15 unique values), Reset Sample, Clear Tree, and learning presets.
- **Visualization**: pan by dragging the tree, Zoom In / Zoom Out, Fit.
- **Analysis**: automatic BST statistics, complexity panel, highlighted pseudocode and explanations.
- **History**: completed operations shown newest-first with expandable details; persists in browser localStorage, with separate Clear History.
- **Compare Trees**: side-by-side balanced versus skewed BST for target 70; synchronized steps and comparison counts. Exit Comparison returns to the unchanged working tree.
- **Responsive design**: desktop, tablet, and narrow mobile layout.

## Quick acceptance tests

| Test | Expected result |
|---|---|
| First open | Seven nodes, root 50, height 2, four leaves |
| Insert 90 | Tree grows to eight nodes after animation completes |
| Insert 50 | Duplicate is rejected |
| Search 60 | Found on path 50 → 70 → 60 |
| Delete 50 from sample | New root is 60 (inorder successor) |
| Inorder from sample | 20 → 30 → 40 → 50 → 60 → 70 → 80 |
| Clear Tree | Nodes 0, height -1 |
| Reset Sample | Original seven nodes return |
| Left-skewed preset | Seven nodes, height 6 |
| Compare Trees | Searching 70: balanced 3 comparisons, skewed 7 comparisons |

## Important playback rule

Structural changes are applied to the actual tree **once, after the final animation step**. If you pause or step backward, you are inspecting animation snapshots, not changing the committed tree. Replay must not insert/delete twice.

If the visualizer seems unchanged when opened, close any old `index.html` tab and open the one from **this folder**; you may still have the older, disabled Phase 1 file open.
