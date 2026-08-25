---
target: explorer chart-type authoring flow
total_score: 23
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 2
timestamp: 2026-08-25T11-53-31Z
slug: rontend-src-components-explorer-charttypeauthoring
---
Method: dual-agent (A: design-review agent · B: detector-evidence agent)

# Critique: explorer chart-type authoring flow (`explorer-chart-gallery`)

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | "Building"/"v4 ready" is screen-reader-only; no visible version/status chip in the embedded header |
| 2 | Match System / Real World | 3 | "You cannot author this chart type" toast; "Gallery" means two different things |
| 3 | User Control and Freedom | 3 | Prompt builds against a shared type commit instantly; undo is a version restore two panels deep |
| 4 | Consistency and Standards | 2 | Embedded vs standalone diverge: icon-only vs labeled History, puzzle tiles vs preview cards, "Back to chart" vs "Gallery" |
| 5 | Error Prevention | 2 | No signal that editing a shared project type mutates every chart using it |
| 6 | Recognition Rather Than Recall | 2 | Edit pencil is opacity:0 until hover; chart-vs-type ownership split unlabeled |
| 7 | Flexibility and Efficiency | 2 | 4 interactions to enter authoring; no direct "edit this type" from where the type name is shown |
| 8 | Aesthetic and Minimalist Design | 3 | Three stacked header rows; disabled Save chart + share are dead weight in the mode |
| 9 | Error Recovery | 2 | Forbidden state = terse toast + silent ejection; no guidance after failed builds |
| 10 | Help and Documentation | 1 | No contextual help on what a chart type is, what a build does, or what the prompt bar costs |
| **Total** | | **23/40** | **Acceptable — flow mechanics are sound, flow comprehension is not** |

## Design Specificity Verdict

**LLM assessment**: The flow's mechanics are strongly authored for Lightdash — preview bound to the live explorer query, pivot-staleness warning carried over, exact chart-state restore on cancel, orphan cleanup on exit. The visual layer is weaker: identical grey puzzle-piece tiles in the gallery step (while `/gallery` proves live-preview thumbnails exist) and a stock back-plus-title header. Specificity lives in behavior, not composition — and the surface that sells the feature (the gallery step) is the most interchangeable.

**Deterministic scan**: Static CLI scan over the five flow paths: clean (exit 0, 0 findings; weak signal for CSS-module tsx). Live in-page scan while authoring: 20 findings across 12 elements, of which **one is flow-owned** — a skipped heading level (h2 "Editing chart type · …" followed directly by the chart card's h5). The rest are surrounding app chrome (ExploreTree divider labels at 4.1:1 contrast in dark theme, sidebar layout transitions, the Ask AI purple glow, app-wide Inter) or false positives (2 detector-overlay self-detections, a hidden UTC badge, the Headway widget).

**Visual overlays**: Injection succeeded; the evidence tab was closed after capture. Overlay screenshot saved at `.playwright-mcp/impeccable-overlay-authoring.png`.

## Overall Impression
The state model is better than the story the UI tells about it. Entry is hidden behind a hover-only pencil, the mode juggles three unlabeled object scopes (query / chart / type), and the exit is silent about three different outcomes. The single biggest opportunity: make the flow say what it already does.

## What's Working
1. **Exit-state integrity**: prior chart+pivot config snapshotted on entry, restored on cancel with stale pivot columns pruned; never-built types deleted; running first builds discarded, not orphaned.
2. **Focus & a11y craft**: mode heading takes focus on entry, sidebar title takes it back on exit, labeled region, role=status announcements.
3. **The mode collapse is right**: Filters/Results/SQL yield to the builder while the query keeps running — authoring against real data is the flow's premise and it structurally delivers.

## Priority Issues
1. **[P1] Editing a shared type reads as chart-local customization.** Every accepted build permanently versions a project-wide asset; nothing says other charts exist. Fix: "Used by N charts" in the authoring header + one-line blast-radius note near the prompt bar; consider edit-a-copy for non-owners. (/impeccable harden)
2. **[P1] Authoring entry is undiscoverable.** Configure → Change → hover → opacity-0 pencil; tile's primary click selects, so misses rewire the chart. Fix: persistent edit affordance on project cards + "Edit chart type" beside the type name in the configure step. (/impeccable onboard)
3. **[P2] The chart/type split is unlabeled.** Sidebar still titled "Configure chart" while its edits are chart-local and the canvas edits the type. Fix: retitle the sidebar during authoring ("This chart's settings") and/or frame the authoring region to exclude it. (/impeccable clarify)
4. **[P2] "Back to chart" hides three outcomes behind one silent button.** Keep-path says nothing; exiting mid-build of an existing type says nothing. Fix: confirm when a build is in flight; toast the keep-path ("Chart updated to … v5"). (/impeccable clarify)
5. **[P3] Embedded surfaces undersell and diverge from standalone.** Puzzle tiles vs preview thumbnails; icon-only vs labeled History; status chip screen-reader-only. Fix: reuse thumbnails, label the history toggle, render the ready/building chip visually. (/impeccable polish)

## Persona Red Flags
- **Alex (power user)**: 4 interactions + hover-gated pencil to enter; no shortcuts; can't close the forced sidebar; 6px miss on the pencil rewires the chart.
- **Jordan (first-timer)**: never finds the pencil; lands in an empty canvas with "Ask for a change…" + a "Sonnet" model picker and zero explanation; ejection toast doesn't say why.
- **Priya (weekly type maintainer)**: path never shortens; no visible "v5 ready"; no exit confirmation; sidebar option tabs she edits while authoring write chart-local values she believes are type defaults.

## Minor Observations
- Skipped heading level h2 → h5 (flow-owned; give the collapsable cards a matching level or aria).
- Middle header row keeps disabled Save chart + share during authoring — honest, but clutter under a mode header.
- Sidebar's Change link and close button silently disappear while authoring rather than reading as an explained lock.
- History panel docks between canvas and sidebar: three columns whose ownership alternates type/type/chart.
- Gallery card tooltips fall back to "{N} fields" filler.
- `authoringStatus.ts` is well-factored and tested; it deserves a visual consumer.

## Questions to Consider
- What if editing a shared type from a chart forked it by default — edit a copy, publish back — dissolving the blast-radius problem instead of warning about it?
- The explorer knows the query shape; what would "recommended for this data" do to the 21-tile gallery step?
- Does the embedded builder need the field tree at all, or is the honest layout builder-full-bleed with one Run query button?
