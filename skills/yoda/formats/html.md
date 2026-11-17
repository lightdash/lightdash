# HTML

Render [canonical JSON](json.md) with [text.md](text.md)'s section visibility, ordering, tables and identifier treatment.
Show inline with `show_widget`; publish with the Artifact tool when a shareable link/page is requested.
Both use the same markup, with different theme tokens.

## Layout

One column with generous spacing:

1. **Header:** subject, muted PR/branch identity, author and the bare head hash (no `head` label); no badges.
2. **Signal:** labels muted, values as small pills.
   Verdict green/amber/red for approve/notes/changes; Testing grey/amber/red for enough/thin/missing; Impact (highest diff impact) red/amber/blue/grey for breaking/notable/minor/none. No summary prose.
3. **Findings:** headed `Findings · N` with the count; lens/state above markdown; red left edge for Fix, amber for Heads-up.
4. **Testing:** headed `Testing · N` with the row count; kind, What, How table; kind muted on its first row, How small muted mono.
   Testing and Diff tables share fixed column widths (first column, mark column, text), so columns line up across sections.
5. **Diff:** Breaking/Notable tables headed with impact and count, in impact colour.
   Minor follows as its own table, headed `Minor · N` in muted grey, not collapsed.
   Three columns: muted lens (first row only), mono change mark without background, then name/extras/note joined by ` · `.
   Only identifier names get pills.
   Change marks use git-added/removed/modified tokens, falling back to success/danger/warning. Rows stay quiet.
6. **Footer:** hairline, muted line count; no CI line.

## Theme

- Use tokens, never raw element colours: `--fix`, `--heads`, `--ok`, `--accent`, `--line`, `--muted` and soft status variants.
- **Inline:** call `read_me`; map tokens to widget variables (`--text-danger`, `--text-warning`, `--text-success`, `--text-accent`, `--border`, `--text-secondary`, background variants).
  Transparent background, no page padding.
- **Published:** load `artifact-design`; define light/dark `:root` tokens, a two-to-four-word title and icon `review`.
- Outside Diff, red means Fix/changes/missing; amber Heads-up/notes/thin; green approve; grey enough/checked/clear.
  Diff uses impact-header and git-mark colours.
- Finding identifiers/routes/flags/numbers: mono pills on `--surface-1`, hairline border, small radius.
