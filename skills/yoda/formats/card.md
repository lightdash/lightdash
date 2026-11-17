# Card

Render [canonical JSON](json.md) as one segmented card, using [card.html](card.html) as the template.
Copy its markup, class names and tokens, and replace its reference content with the review.
Show inline with `show_widget`; publish with the Artifact tool when a shareable link is requested.

## Segments

One card, segments split by hairlines, in this order:

1. **Header:** verdict on the left in its colour (green approve, amber notes, red changes); the PR as `repo#N · short sha ↗` linked on the right, muted mono; the subject below.
2. **Findings:** one block per finding, state (red Fix, amber Heads-up) then `lens · file:line` muted, then the finding markdown as muted prose with identifiers in mono.
   Omit the segment when there are none.
3. **Testing:** `Testing` then the rating (red none or missing, amber thin, muted enough); verification rows below as muted lines.
4. **Diff:** one linear list in schema order, without lens groups.
   Each row is a mark, the name in mono with extras muted beside it, the lens muted and right-aligned on the name line, and the note below.
   - Marks: `+` added on a green tint, `−` deleted on a red tint with the name struck through; modified rows have no mark and no tint.
   - Impact: breaking adds a red `breaking` word after the name; notable is plain; minor mutes the name and note.

No counts, badges, pills, borders on rows, tables, collapsing or footer.

## Theme

- **Published:** keep card.html's `:root` tokens and dark mode, title and icon `review`.
- **Inline:** call `read_me`; drop the page background and map tokens to widget variables (`--text-success`, `--bg-success`, `--text-danger`, `--bg-danger`, `--text-warning`, `--text-muted`, `--text-secondary`, `--border`, `--surface-2`).
  Render the card directly, with no backdrop around it.
  Give every row an explicit background and prefix any custom properties (`--yoda-*`), since the host defines short names like `--t`.
