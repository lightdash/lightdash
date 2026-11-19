# Text

Render [canonical JSON](json.md) as Markdown: header, signal, Findings, Testing, Diff, footer.
Omit empty sections.
Standalone json-mode data has no review-only sections.

- **Header:** `## <subject>`, then PR link (`owner/repo#N`) or branch/checksum, author and the bare head hash (no `head` label), joined by ` · `.
- **Signal:** a one-row table directly below identity: `| Verdict | Testing | Impact |`, then each value in bold after its emoji (`| 🟡 **approve with notes** | 🟡 **thin** | 🟡 **notable** |`).
  Verdict 🟢 approve, 🟡 approve with notes, 🔴 request changes; Testing ⚪ enough, 🟡 thin, 🔴 missing; Impact 🔴 breaking, 🟡 notable, 🔵 minor, ⚪ none.
  Use the JSON values, with Impact the highest diff impact (`none` without diffs); no summary prose.
- **Findings:** `### Findings · 2` with the count, then `#### Core · Fix` or `#### Access · Heads-up` per finding, no emoji, in schema order, without links in headings.
  Render its markdown below.
- **Testing:** `### Testing · 3` with the row count, then `| Kind | What | How |`.
  Capitalize kind, prefixed with its emoji, on every row: 🔶 Gap, 🔷 Verification.
- **Diff:** `### Diff · 9` with the row count, then one `| Lens | What |` table holding every row.
  - Preserve schema ordering (breaking, notable, minor).
    Fill lens on every row, prefixed with its impact emoji: 🔺 breaking, 🔸 notable, 🔹 minor (`🔺 Live data sources`); no blank cells.
  - What: ticked change mark (`+`, `-`, `~`), a space, then name, extras in type order and note joined by ` · ` (`` `~` PostHog · custom fields unfilterable ``).
  - Tick the name only if greppable (route, flag, column); descriptions remain plain.
    Other fields and the note stay unticked.
  - Show at most one extra plus the note, each about six words; hide fields that add nothing to the row (`all`, a kind implied by the name, a `direction` the impact already says); JSON retains them.
- **Footer:** `---`, then comma-formatted `lines` (“8,020 lines”).
- **Links:** `[file.ts:120](path:120)` when the local checkout is at the reviewed head; otherwise GitHub pinned to it (`/blob/<sha>/path#L120-L128`).

No folds; emoji only in the signal, Testing kinds and the diff's impact marks.
The document has no summary, explanation or decisions.
