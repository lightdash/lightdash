# AI artifact panel redesign — v2

**Date:** 2026-05-18
**Branch:** isolated worktree off `main` (`worktree-feat-ai-artifact-panel-redesign`), kept independent of in-flight backend work on `feat-ai-runquery-period-comparisons`.
**Prototype:** `.superpowers/brainstorm/50589-1779121545/content/04-prototype.html` (in the main worktree)

## Problem

The current AI artifact panel (`packages/frontend/src/ee/features/aiCopilot/components/ChatElements/AiArtifactPanel.tsx`, rendered via `AiAgentPageLayout.tsx`) takes the full vertical span of the right side, has a heavy multi-row header (large title + full description + chart-type icon strip + eye/check/menu/close), and meets the chat column at a hard 90° seam. It does not visually connect to the chat message that produced it.

## Goals

- Make the panel feel like part of the chat experience rather than a separate wall.
- Reduce visual weight: chromeless card, single-line header, the chart-type switcher detached as a floating pill.
- Open/close motion morphs from the inline `AiArtifactButton` ("source card") in the chat thread to the floating panel and back.

## Non-goals

- Dashboard artifact rendering. Charts only for v2; dashboards continue to use the current panel.
- Mobile layout changes. The current bottom-drawer (`<Drawer>` in `AiAgentPageLayout`) stays as-is.
- Touching any backend, agent, or query code. Frontend-only.

## Approved direction (from prototype rounds)

1. **Spatial** — Floating rounded card with all-around margin, soft shadow. Chat keeps a calm gutter next to it.
2. **Chrome** — Chromeless card: title + `i` tooltip on the left, pin/save/more/close on the right, single ~44 px row. The chart-type switcher detaches as a dark pill floating at the bottom edge of the card.
3. **Motion** — The `AiArtifactButton` in the chat thread morphs into the floating panel via a shared-element transition. Reverse on close.

## Implementation approach

### Animation library

Add `motion` (formerly framer-motion) as a frontend dependency. Use `layoutId` for the shared-element morph between source card and panel.

**Bundle cost:** ~32 KB gzipped (`motion` + layout features). Goal is to scope it to the EE AI agent route so non-agent pages don't pay it.

**Assumption to verify in implementation:** EE routes in `packages/frontend/src/ee/` are already code-split via `React.lazy` (check `CommercialRoutes.tsx`). If not, the import of `motion` from inside `AiAgentPageLayout` will pull it into the main bundle. In that case, we either (a) confirm the EE chunk is already split and motion lives there, or (b) dynamic-import `motion` inside a small wrapper component used only by the v2 path. Decide once measured.

**Why motion over vanilla FLIP:** The `layoutId` API gives us a single declarative knob (same string on source and destination) and handles measurement, interruption, and reverse playback. Vanilla FLIP would be ~120 LOC of hand-rolled React with manual `getBoundingClientRect` plumbing and tricky cleanup; motion handles these for free. The bundle cost is meaningful but acceptable as a one-time route-scoped expense, and the same motion infra can be reused for future shared-element transitions (e.g., dashboard tile reordering).

### Rollout

Direct replacement, no feature flag. The redesign ships as the new default; the old `AiArtifactPanel` is removed in the same change. The `AiArtifactInline` admin/verified-content view continues to use a shared inner rendering (chart visualization) so it keeps working unchanged.

### File layout

```
packages/frontend/src/ee/features/aiCopilot/components/
  ChatElements/
    ArtifactButton/
      AiArtifactButton.tsx                  ← add layoutId wiring
      AiArtifactButton.module.css           ← keep
    AiArtifactPanel.tsx                     ← REWRITE: chromeless floating panel
                                              (keeps the same exported component name
                                              and props so existing imports don't break;
                                              AiArtifactInline still uses it for its
                                              `showCloseButton={false}` mode by branching
                                              on a `variant` prop, see below)
  AiAgentPageLayout/
    AiAgentPageLayout.tsx                   ← swap the right Panel for the floating region;
                                              wrap workspace in LayoutGroup
    aiAgentPageLayout.module.css            ← add styles for the floating region
```

**`AiArtifactPanel` variant prop.** To keep `AiArtifactInline` working (it embeds the panel inside a bordered Paper for admin views with `showCloseButton={false}`), the rewritten panel accepts a `variant: 'floating' | 'inline'` prop. `'floating'` is the new chromeless treatment used by `AiAgentPageLayout`; `'inline'` keeps the existing minimal treatment without the morph wrapper or floating pill. This lets us delete the v1 panel code without breaking the admin view.

### How the morph wires up

The `layoutId` is `ai-artifact-${artifactUuid}-${versionUuid}` so each artifact version has its own shared-element identity.

**Pattern:** at any moment, exactly one element with that `layoutId` is mounted. When the artifact's `setArtifact` state flips:

- **Panel closed** → `AiArtifactButton` renders `<motion.div layoutId={key}>` as its outermost wrapper. The chat-thread version of the artifact is the "host" of that layoutId.
- **Panel open** → `AiArtifactButton` switches to a non-motion placeholder of the same size (preserves chat layout so messages don't reflow), and `AiArtifactPanelV2` becomes the host of the layoutId via `<motion.div layoutId={key}>`.

`AiAgentPageLayout` wraps the entire workspace (chat column + panel region) in `<LayoutGroup>` so motion can connect the layoutId across the tree as it migrates from button to panel.

When the Redux `setArtifact` action fires, the button swaps to its placeholder and the panel mounts. Motion sees the layoutId move from the button's rect to the panel's rect and animates the bounding box. `clearArtifact` reverses it.

**Inner content fade-in.** The shared-element morph only animates the outer container's rect; the contents (panel head, chart-stage, floating pill) are different DOM trees. We fade them in coordinated with the layout settling:

- Panel inner content wrapped in `<motion.div>` with `initial={{ opacity: 0 }}`, `animate={{ opacity: 1 }}`, `transition={{ duration: 0.2, delay: 0.3 }}` — the delay is matched to motion's default layout transition (~0.3s with spring) so content fades in just as the morph settles.
- The same `transition` is set on the source button's content for the reverse direction so it doesn't snap on close.

**Floating pill placement.** The dark chart-type switcher pill is rendered as a positioned child *inside* the `motion.div` panel host (not a sibling) so its position is relative to the morphing container. During the morph it scales with the container, which means it starts as a tiny chip and grows; this is visually acceptable because it's small and centered. (If it looks distracting, we can wrap it in its own motion element with `initial={{ scale: 0 }}` and `animate={{ scale: 1 }}` after a short delay — try simpler first.)

### What stays unchanged

- `AiChartVisualization.tsx` — renders the chart inside whatever panel container it's given. v2 panel just embeds it.
- Redux store (`aiArtifactSlice`) — same `setArtifact` / `clearArtifact` API.
- `AiArtifactInline` (used in admin / verified-content views) — keeps the old panel; not in scope.
- All existing chart-type quick-options, save flows, verification — same behaviors, just rendered inside the new chrome.

### Header content mapping

The v1 panel has: large title, full description, 4-icon chart-type switcher, eye-toggle (verify view), check (mark verified), menu, close. v2 distributes this as:

| v1 location | v2 location |
|---|---|
| Title | Header left, single line, truncate-with-tooltip |
| Description | `i` icon tooltip next to title |
| Chart-type switcher (top right) | Floating dark pill, bottom-center of card |
| Eye / verify / menu | Header right, icon-only `ActionIcon`s |
| Close | Header far right, soft-grey circular `ActionIcon` |

### Risks and unknowns

- **`layoutId` with conditional mount + interruption.** If the user spam-clicks open/close, motion handles it (interruption is well-supported), but we should test rapid toggling.
- **`AiArtifactButton` inside a scrolling chat thread.** If the user scrolls so the source button is offscreen and then closes the panel, the morph target is offscreen. Motion handles this by animating to a position that's offscreen — the panel just "flies off" upward. Acceptable. (Future polish: scroll the source into view before morph-back.)
- **`LayoutGroup` wrapping cost.** Wrapping the whole workspace in a `LayoutGroup` doesn't add overhead unless layout animations are triggered, but worth measuring with React DevTools profiler once wired.
- **`react-resizable-panels` interaction.** The v1 path uses it for the artifact column; v2 doesn't. Branching cleanly on the flag avoids any conflict — they don't coexist in the same render.
- **Verified state visual treatment.** Decision: render the verified state as a small green check `Badge` immediately to the right of the title text (before the `i` tooltip). Falls back to a tooltip-only marker if it would push the right-side icons off the row at small widths.

### Testing plan

- Manual: open agent thread with a chart artifact, click source button → morph plays. Click close / press Esc → reverse plays. Toggle the feature flag off → old panel returns.
- Manual: open the prototype side-by-side and confirm the timing/easing matches.
- No new automated tests for the motion itself (visual). Existing chart visualization tests still cover the inner chart.
- Lint + typecheck pass on `packages/frontend` and `packages/common`.

### Out of scope (follow-ups)

- Apply the same chrome+motion to dashboard artifacts (`AiDashboardVisualization`).
- Apply the new chrome to `AiArtifactInline` (admin verified-content view) — currently keeps the inline variant.

## Rollout

Single PR replaces the panel. Worktree-isolated implementation so it can be merged independently of the in-flight backend work on `feat-ai-runquery-period-comparisons`.
