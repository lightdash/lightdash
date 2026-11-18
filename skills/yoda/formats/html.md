# HTML

Render [canonical JSON](json.md) as one segmented card, using [assets/template.html](../assets/template.html) as the template.
Copy its markup, class names and tokens, and replace its reference content with the review.
Show inline with `show_widget`; publish with the Artifact tool when a shareable link is requested.

## Segments

One card, segments split by hairlines, in this order:

1. **Header:** the blinking pixel Yoda ([assets/yoda.gif](../assets/yoda.gif), embedded as a base64 data URI), then the verdict in its colour (green approve, amber notes, red changes); the PR as `#N` linked on the right, muted mono; the subject below.
2. **Findings:** one block per finding, state (red Fix, amber Heads-up) then the lens muted, then the finding markdown as muted prose with identifiers in mono.
   Omit the segment when there are none.
3. **Testing:** `Testing` then the rating (muted enough, amber thin, red missing).
   Rows below follow the diff's row shape: green `✓` for a verification, amber `○` for a gap, then What, with How muted and right-aligned.
   Gaps first, as the schema orders them; no rows when there are none.
4. **Diff:** one linear list in schema order, without lens groups.
   Each row is a mark, the name in mono with extras muted beside it, the lens muted and right-aligned on the name line, and the note below.
   - Marks: `+` added on a green tint, `−` deleted on a red tint with the name struck through; modified rows have no mark and no tint.
   - Impact: breaking adds a red `breaking` word after the name; notable is plain; minor mutes the name and note.

No counts, badges, pills, borders on rows, tables, collapsing or footer.

## Theme

- **Published:** keep the template's `:root` tokens and dark mode, title and icon `review`.
- **Inline:** call `read_me`; drop the page background and map tokens to widget variables (`--text-success`, `--bg-success`, `--text-danger`, `--bg-danger`, `--text-warning`, `--text-muted`, `--text-secondary`, `--border`, `--surface-2`).
  Render the card directly, with no backdrop around it.
  Give every row an explicit background and prefix any custom properties (`--yoda-*`), since the host defines short names like `--t`.
