<summary>
The scope-driven course board that is the Learn section's landing page: role tabs, one ring of module nodes per permission group lit by the selected role's scopes, an Ask bar that searches the library and lights the answer, and a rail with overall progress, a resume queue and a module detail pane. Everything derivable is a pure function; the components only render.
</summary>

<howToUse>
`components/LearnBoardPanel.tsx` is the only entry point. It owns the selected role, the selected module, and the submitted ask query, and feeds three pure layers:

- `model.ts`: scope tags (`holds`, `parseScopeTag`), grouping (`groupOf`, `GROUP_ORDER`), role scope sets (`roleScopes`, `heldBy`), the held course (`courseFor`) and the rail numbers (`railModel`).
- `layout.ts`: `buildLayout(modules)` returns seats, connectors and captions in a fixed 1120px board space; `seatMap` gives the previous seats for a role change.
- `motion.ts`: `resolveMotion(input)` turns a seat change into the per-node fly-in or collapse.

Ask adds a copied layer plus its lightdash-only view layer:

- `ask.ts` (copied): `askHighlights(matches, entries, held)` splits held matches from locked ones, `suggestionsFor(suggestions, entries, held)` filters the curated chips down to `SUGGESTION_LIMIT`, `lockedLabel(entry)` names the lowest role that holds a module or null when every role does.
- `askView.ts` (lightdash only): `resolveMatches` drops results the catalogue lost and caps at `ASK_RESULT_LIMIT`, `boardHighlights` adapts the published match type, `nodeAskState`/`askOpacity`/`askScale` drive the per-node treatment, `groupMatches` groups the results list, `lockedNote` is `lockedLabel` with a fallback.
</howToUse>

<codeExample>

```tsx
// An answer lights the modules it matched and dims everything else.
const matches = resolveMatches(ask.data.matches, entries);
const highlights = boardHighlights(matches, entries, roleScopes(role));
<ClusterBoard entries={entries} held={held} highlights={highlights} ... />;
```

</codeExample>

<importantToKnow>
- **Copied files, one sync rule.** Four modules, `model.ts`, `layout.ts`, `motion.ts` and `ask.ts`, plus `testFixtures.ts` and the tests `model.test.ts`, `layout.test.ts`, `motion.test.ts`, `ask.test.ts` are byte-identical twins of lightdash-university's `academy/board/` and `test/academy-board-*.test.ts`. A change to any of them lands in **both** repositories in the same piece of work, tests included, and both sides must survive `oxfmt` unchanged. The one permitted difference is the leading comment and import block: LU's `academy/board/scopeSource.ts` stands in for `@lightdash/common`. `npm run board:sync-check -- --lightdash <path>` in LU diffs the pairs.
- **`askView.ts` is lightdash only.** Anything the components need that the copied files do not export lives there, built on top of them. Nothing lightdash-specific may go into a copied file.
- **The Ask bar sits above the role tabs**, so the tabs are next to the rings the nodes fly out of. Switching role keeps the answer and re-derives which of its matches are locked; only the query changing replaces it. Asking does not close an open module pane, which is the academy's behaviour too.
- **One search at a time.** Every submit costs an upstream embedding, so a submit while a request is in flight is ignored, re-asking the question already answered is a no-op, and the panel tags each request with a sequence id so a late response never overwrites a newer answer. The previous answer and its highlights stay on screen while the next request runs.
- **Progress is never revoked by a role change.** `railModel` scores every module but filters the board, queue and totals by the held course, so a completed module stays completed after a role switch.
- **Ask never blocks the board.** It fails inline: a failed request shows "Couldn't search right now", nothing left after `resolveMatches` shows "Nothing in the library matches that yet", and the board is left untouched in both cases. Results are resolved against the catalogue and capped once, before both the list and the highlights, so the two light the same set.
- **A locked match is visible, not openable.** Locked modules have no ring seat, so a locked match is parked at its cluster centre and takes no part in the role-switch flight. Its group in the results list names the lowest holding role instead of an Open link; the node stays disabled and out of the accessibility tree, so the results list is the accessible route to that answer. A matched glow beats the next-up pulse: two highlights at once read as two answers.
- **Suggestion chips are content.** They come from `catalogue.suggestions`, curated in lightdash-university and validated against promoted modules there. The field defaults to `[]`, so an older catalogue simply shows no chips.
- **The board geometry is fixed at 1120px** and scaled down with a transform to fit the column. Seats are in board space, so anything converting client coordinates must divide by the same scale.
</importantToKnow>

<links>
- @/packages/frontend/src/features/learn/hooks.ts (catalogue, course, rollups, ask)
- @/packages/backend/src/services/LearnService/LearnService.ts (the proxies these hooks call)
- @/packages/common/src/types/learn.ts (the published contract and its zod schemas)
</links>
