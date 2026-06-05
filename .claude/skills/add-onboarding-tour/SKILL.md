---
name: add-onboarding-tour
description: Add a first-run guided tour, product walkthrough, coachmarks, or empty-state mock/example data to a Lightdash frontend feature. Use when the user wants to onboard users to a page, add a "Take the tour" flow, explain an unfamiliar UI, or show sample data on an empty page.
allowed-tools: Read, Edit, Write, Glob, Grep
---

# Add an Onboarding Tour

A zero-dependency, centralised kit for first-run onboarding in `packages/frontend`. Three reusable pieces do the heavy lifting; each feature only supplies its own steps, copy, anchors, and (optionally) example data.

## Building blocks

| Piece | Path | Job |
|---|---|---|
| `useGuidedTour` | `src/hooks/useGuidedTour.ts` | localStorage seen-flag, first-visit auto-open, replay. Returns `{ isOpen, startTour, closeTour }`. |
| `GuidedTour` | `src/components/common/GuidedTour` | Spotlight rendering. Dims the page, highlights a `data-tour` target, anchors a Next/Back/Skip card. `target: null` → centered card. |
| `useOnboardingMock` | `src/hooks/useOnboardingMock.ts` | A react-query `select` that swaps real data for deterministic mock rows while a flag is on. |

**Reference implementation:** `src/ee/features/aiCopilot/components/Admin/settings/AiReviewsSettingsPage.tsx` (wiring) and `AiAgentAdminReviewItemsTable.tsx` (mock rows). Read these first — copying them is the fastest path.

## Recipe

1. **Wire the tour state** in the feature page:
   ```tsx
   const { isOpen, startTour, closeTour } = useGuidedTour({
       storageKey: 'ld.<feature>.tour.v1',
   });
   ```

2. **Define steps** (memoised). Each `target` is a CSS selector resolved when the step is reached, or `null` for a centered explainer:
   ```tsx
   const steps: GuidedTourStep[] = useMemo(() => [
       { target: '[data-tour="<feature>-intro"]', title: '…', body: '…' },
       { target: '[data-tour="<feature>-row"]',   title: '…', body: '…' },
       { target: null, title: '…', body: <SomeDiagram /> }, // centered
   ], []);
   ```

3. **Add `data-tour` anchors** to the elements each step points at. For a **table row**, add it in the row props so the whole row is spotlit:
   ```tsx
   mantineTableBodyRowProps: ({ row }) =>
       row.index === 0 ? { 'data-tour': '<feature>-row' } : {},
   ```

4. **Render** the tour and a replay button:
   ```tsx
   <Button variant="subtle" leftSection={<MantineIcon icon={IconRoute} />} onClick={startTour}>
       Take the tour
   </Button>
   <GuidedTour steps={steps} opened={isOpen} onClose={closeTour} />
   ```

5. **(Optional) Deterministic example data** so a tour on an empty (or any) page always highlights the same rows. Define stable, clearly-labelled mock rows and inject them via `select` while the tour is open:
   ```tsx
   const select = useOnboardingMock(EXAMPLE_ROWS, isOpen);
   const { data } = useThings(args, { select }); // hook must forward `select` to useQuery
   ```
   Render example rows muted and inert (disabled actions, no navigation); mark them with an "Example" badge. Gate interactivity off a sentinel id (e.g. `id.startsWith('example:')`).

## Conventions

- **Zero dependencies.** No joyride/driver/intro.js. The spotlight is a `box-shadow: 0 0 0 9999px` dim — already handled by `GuidedTour`.
- **storageKey:** `ld.<feature>.tour.v<n>`. Bump the version to re-show the tour after a redesign.
- **Copy:** warm, natural, straight to the point. **No em dashes, no arrows.** Short titles.
- **Styling:** follow `frontend-style-guide` — no `style` prop (pass runtime geometry via `__vars`), CSS modules, theme tokens / `ldGray`/`ldDark`.
- **Mock rows must never look or act real:** muted, "Example" badge, disabled actions.

## Gotchas

- **Targets that render late** (data still loading): handled — `GuidedTour` polls for each step's element and shows a centered card until it appears. Do **not** filter steps at open time; that drops steps whose targets haven't rendered yet.
- **Determinism:** tie mock data to `isOpen` (tour running), not to emptiness, if you want the tour to highlight the same rows every run. Closing the tour flips back to real data.
- **`select` passthrough:** the data hook must accept and forward a `select` option to `useQuery` (see `useAiAgentAdminReviewItems`). Add it if missing.
