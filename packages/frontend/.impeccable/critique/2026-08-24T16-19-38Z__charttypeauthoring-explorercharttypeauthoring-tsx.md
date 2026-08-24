---
target: Explorer chart type authoring (GLITCH-680)
total_score: 24
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 4
timestamp: 2026-08-24T16-19-38Z
slug: charttypeauthoring-explorercharttypeauthoring-tsx
---
## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 2 | Rail shows no state while building or after a failed build; stage changes are silent to AT |
| 2 | Match System / Real World | 3 | "Explorer remains active", rail title "Project chart type" for a new type |
| 3 | User Control and Freedom | 2 | Back silently discards a running first build; no Escape; a failed first build then Back orphans an app |
| 4 | Consistency and Standards | 2 | Header diverges from the standalone builder (subtle Back, badge stepper, icon-only History, "Done"); `indigo` pills vs `blue` everywhere else |
| 5 | Error Prevention | 2 | Page Save changes / Save as new / Cancel stay live; a new type's `dataAppVizUuid: ''` placeholder can be saved |
| 6 | Recognition Rather Than Recall | 2 | Edit is hover-only; Create new is a subtle text button at the bottom of the Project list, below the fold at 1280 |
| 7 | Flexibility and Efficiency | 3 | Queue / interrupt / model picker / resizable history are strong; no keys for Back or Done |
| 8 | Aesthetic and Minimalist Design | 3 | Header packs seven elements into one non-wrapping row and clips at 1600 with history open |
| 9 | Error Recovery | 3 | Failed build copy is good; rail keeps saying "once the first version is ready" and Done stays disabled with no reason |
| 10 | Help and Documentation | 2 | Starter prompts only; nothing explains what Done commits |
| **Total** | | **24/40** | **Acceptable** |

Audit (technical): Accessibility 2, Performance 2, Theming 3, Responsive 2, Integrity 3 = 12/20 Acceptable. Detector: 0 findings (verified live on seeded anti-patterns).

## Priority Issues

- [P1] Header clips and wraps: Back is cut to "Back to Explor" at 1600 with history open; at 1280 the title is "Revenue Ch…" and the subtitle wraps. `wrap="nowrap"` + non-shrinking actions inside `overflow: hidden`.
- [P1] The hidden VisualizationCard keeps rendering its DataAppVizRenderer iframe and polling render-metadata while authoring: two iframes and three pollers per build.
- [P1] Two commit points and a trap: page Save changes / Save as new / Cancel stay enabled; a new type's placeholder config is saveable and lands in the URL on refresh.
- [P1] Rail content shifts ~8px left after toggling an option and never recovers (capture a-07, not re-reproduced by the parent).
- [P2] Author is a mode dressed as a wizard: non-interactive stepper pills, "Explorer remains active" subtitle, a11y-inert `aria-current` on badges.
- [P2] Entry points least discoverable on Choose: hover-only Edit, bottom-of-list Create new.
- [P2] Focus dropped on enter/exit; no heading or landmark for the swapped area.
- [P2] Cancel restores a raw snapshot that may not match a query changed meanwhile; failed-first-build-then-Back orphans an app; `finishChartTypeAuthoring` unguarded.
- [P3] `light-dark()` pattern carried into ChartTypeBuilderWorkspace.module.css; dead `optionValues` param on `useSelectProjectChartType`; unused option/palette state in the workspace when embedded; comments over the 1-2 line rule.
