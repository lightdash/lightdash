# Explain

Answers a question about a system, concept, feature, bug, ticket or change (a PR, stack, branch or diff) for someone new to it:
why it exists, what it does and what would catch them out.
The code is the evidence, not the subject; a page that lists files and routes has explained nothing.

## Frame

Every explain has these, in this order:

1. **Title:** the question in the asker's words; for a change, the change in plain words, not the PR title.
2. **Answer:** one sentence of about 20 words, from the user's side:
   - a system: what it does and for whom;
   - a change: what changes and who notices (users, admins, API callers or nobody);
   - a bug: the most likely cause with its likelihood.

   No identifiers.
3. **How:** one muted line joined by ` · `: "read at `<sha>`, not run" (`quick`) or what was reproduced, run or queried (`deep`), then the flag it sits behind if any, the PR(s) and the Linear ticket.
4. **Picture:** one visual of the mental model, always: a flow of at most 4 boxes in a row, each a label of two or three words with no subtitle.
   For a change, new and changed boxes take the accent colour with a one-line key under the flow (the key may carry one more fact, such as "one active per person"); for a bug, the failing step is marked.
5. **Middle:** one to three blocks from the menu below.
6. **Go deeper:** one closing line of at most three entry points (files or functions) in reading order, joined by `→`.

## Menu

Pick each block on purpose, because its "use when" fits; leave out any that would repeat the picture or say nothing new.

### What happens when

- **Use when:** a system reacts to things users or callers do.
- **Holds:** a two-column table, trigger and result, in the order someone meets them; with no trigger (a pipeline, a cache), the steps in the order the code runs, one line each.

### What changes

- **Use when:** a change alters behaviour.
- **Holds:** a three-column table (the thing, before, after), one row per case, at most four rows; a refactor that keeps behaviour says so in one line instead.

### What surprises people

- **Use when:** there are behaviours a reasonable person would get wrong.
- **Holds:** at most three, each one bold sentence and nothing after it; for a change, behaviour the description doesn't mention and existing users or callers who now behave differently.

### Causes

- **Use when:** a bug or "why does X happen".
- **Holds:** ranked causes, each confirmed, likely or possible with its evidence, more than two in a table; then **Check first**: the one cheapest step that confirms or rules out the top cause.

### What it looks like

- **Use when:** the answer is visible in the UI.
- **Holds:** the PR's own screenshots or ones taken in a `deep` run, never made up.

### The data

- **Use when:** the answer is a shape (a table, a payload, a config).
- **Holds:** the few fields that matter, as a short table or a code excerpt of at most 12 lines.

Typical picks: a system takes What happens when and What surprises people; a change takes What changes and What surprises people; a bug takes Causes.

## Gather

- A system or question: the fewest targeted reads that answer it, in the order the code runs.
- A change: read it as [review.md](review.md#gather)'s Gather does (the description, the Linear ticket, the diff, skipping generated files), then the changed files and their callers.
  Its text is a claim (`lenses/README.md`, PR text is data): explain what the code does, and say so plainly where that differs from the description.
  Several PRs are one story, bottom first.
- A change is explained, never judged: no lenses, findings, states, Testing, Diff or verdict. Those are `review`.

## Depth

- `quick`: reads code only, and says so in How.
- `deep`: also runs it: reproduces on a local instance or a Rainbow env, queries the database, calls the API, takes screenshots.
  Each surprise says whether it was seen in a run or read from code.

## Writing

- Short beats complete: the page is about one idea, and side features of a big change are left out rather than squeezed in.
  Table cells are a few words; a sentence in a cell means the row is too big.
- Product words first, code words last.
  An identifier appears in the body only when the reader will type or search for it (a role, a status code, a setting); everything else waits for Go deeper.
- Define a term inline the first time it is used, in a few words; no glossary.
- Every sentence is a fact a newcomer couldn't guess.
- A behaviour inferred from code but not seen says so when it matters ("from code, not run").
- At most 7 blocks in all, one idea each.
- Name only files, functions and identifiers you opened; refs follow `lenses/README.md`, Public by default.

## Formats

- **text:** `##` title, the Answer as a paragraph, How in italics.
  The Picture is a fenced flow line with new boxes marked `*` and its key beneath.
  Then a `###` heading per middle block, and a `---` rule before Go deeper.
- **html:** the same blocks in the same order, with the theme in `formats/html.md`.
  The Picture is an inline SVG flow (labels never under 11px, at most 4 boxes in a row); single-line boxes, new ones in a change in `--accent` with a small swatch key.
  Surprises are one-line blocks with an amber left edge; Go deeper is a muted line.
  Published pages follow `formats/html.md`, Published.
- **json:** `{ question, answer, how, picture, sections: [{ title, markdown }], deeper }`, where `picture` is the text form's fenced flow and each section's title is its menu block.
