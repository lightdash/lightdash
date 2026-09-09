# Guided tour positioning: failure modes and diagnosis

This describes how a tour card can obstruct an interactive target, investigated against revision
`08b9718921e7dfce5be37fc859e02d39ae20c8dd`. It documents current behavior, not a shipped fix.
The original intermittent export report was not reproduced through an unmodified training walkthrough;
a controlled layout shift reproduces the obstruction in the real browser component.

## Which export control?

[The curriculum](../../packages/frontend/src/features/scopeTours/curriculum.ts) puts `manage:ExportCsv`
third. In [the generated tour](../../packages/frontend/src/features/scopeTours/generated.ts), step 6
(index 5) is **Open the export dialog**, targeting:

```css
[data-tour-scope="manage:ExportCsv"][data-tour-step="2"]
```

This is the results-table export icon in
[ResultsCard](../../packages/frontend/src/components/Explorer/ResultsCard/ResultsCard.tsx), not the
chart-image export icon. Do not use `data-testid="export-csv-button"` alone to diagnose it: the saved
chart can contain more than one element with that test ID. Step 5 opens Results; step 7 clicks Download
(or first follows the Google Drive chooser). The chooser is not the target of step 6.

## Confirmed timing failure: card and spotlight diverge

[GuidedTour](../../packages/frontend/src/components/common/GuidedTour/GuidedTour.tsx) keeps separate
rectangles for the live target (`rect`), spotlight (`shownRect`), and card anchor (`cardRect`).

1. After a target click, the card collapses and hides. Once the next target is found, the spotlight
   glides for 600 ms. The card then starts its 280 ms expansion using `latestRectRef.current`.
2. `useTargetRect` continues sampling. After two stable frames, a changed target rectangle updates
   `latestRectRef` and the spotlight.
3. While the card is **expanding**, the rect effect does **not** update `cardRect`: that update is
   guarded by `cardPhaseRef.current === 'shown'`.
4. The expansion timer changes the phase to `shown`, but does not reconcile the card anchor. The
   rect effect depends only on `[rect, glideFor]`, not the phase. If the target has now stopped moving,
   no further rect update arrives and the card remains anchored to the earlier position.

This is timing-dependent: a layout change during expansion can leave a persistent obstruction;
the same change after expansion repositions the card correctly. A subsequent target movement can
also clear it. Content settling, scrolling, resizing, or reflow are candidate triggers, **not verified
causes of the original report**. Two stable animation frames do not guarantee the layout will stay still.

### Controlled browser reproduction

Tested in Chromium with an 800 × 600 CSS-pixel viewport, on a seeded saved chart with query results.
Learn was not enabled in the local seed, so the tour was resumed using its existing session-storage
mechanism on that chart. This bypasses the library/copy-creation path and is not an end-to-end training test.

For a disposable local session only:

1. Open a saved chart using its project UUID in the route. In the console, set
   `lightdash.scopeTour` in `sessionStorage` to JSON containing
   `{ scope: 'manage:ExportCsv', projectUuid: '<current project UUID>', stepIndex: 4 }`, then reload.
   This resumes at step 5, **Open the results**. Wait for the query and tour to settle.
2. Run the following console probe. It deliberately moves the actual export button 100 px upward
   during expansion; it does not simulate a naturally occurring layout change. Use the same viewport
   and a chart layout with the export icon near the bottom, so the card is initially above it.

```javascript
const exportSelector =
  '[data-tour-scope="manage:ExportCsv"][data-tour-step="2"]';
const deadline = performance.now() + 10000;
function moveDuringExpansion() {
  const card = document.querySelector('[data-tour-card="6"]');
  const target = document.querySelector(exportSelector);
  if (card && target && card.parentElement.className.includes('cardExpand')) {
    target.style.transform = 'translateY(-100px)';
  } else if (performance.now() < deadline) {
    requestAnimationFrame(moveDuringExpansion);
  }
}
requestAnimationFrame(moveDuringExpansion);
document.querySelector('[data-tour-anchor="results-heading"]').click();
```

3. Wait at least a second, then inspect the target, card, and hit-test result:

```javascript
const target = document.querySelector(exportSelector);
const card = document.querySelector('[data-tour-card="6"]');
const rect = target.getBoundingClientRect();
const hit = document.elementFromPoint(
  rect.x + rect.width / 2,
  rect.y + rect.height / 2,
);
console.log({
  target: rect.toJSON(),
  card: card.getBoundingClientRect().toJSON(),
  hitIsTarget: target.contains(hit),
  hitIsCard: !!hit?.closest('[data-tour-card]'),
});
```

Observed geometry after expansion finished:

| State                                 | Target Y range | Card Y range | Hit at target centre |
| ------------------------------------- | -------------- | ------------ | -------------------- |
| Unshifted step 6                      | 547–575        | 303–533.22   | Target descendant    |
| Shift during expansion                | 447–475        | 303–533.22   | Tour card (step 6)   |
| Further 1 px movement after expansion | 448–476        | 204–434.22   | Target descendant    |

For the recovery check, change the transform to `translateY(-99px)` and repeat the probe after a
frame or two. Remove the transform and the `lightdash.scopeTour` storage item, then reload to clean up.
Do not force-click the export button to validate accessibility: a programmatic `.click()` bypasses
browser hit testing. The programmatic Results click above is only test setup.

The spotlight and click-through blockers track the live rect, but
[the card CSS](../../packages/frontend/src/components/common/GuidedTour/GuidedTour.module.css) has
`pointer-events: auto` and sits above the page. Therefore the stale card still intercepts clicks inside
the spotlight. `isInViewport` deliberately excludes tour layers from its occlusion test, so it cannot
notice or repair this self-obstruction.

A temporary Vitest probe through the public `GuidedTour` component independently reproduced this:
mount with `initialBeacon`, a 1280 × 768 viewport, a mocked target rect `(1100, 500, 32, 32)`, and the
220 px fallback card height (no ResizeObserver delivery). Advance timers in 20 ms `act` increments;
change the target Y to 400 at 700 ms, then inspect at 1600 ms. The card top is **266 px**, not the
**446 px** expected for the current target. Moving at 1100 ms instead yields **446 px**. The early-move
assertion failed and the late-move control passed. This diagnostic was not retained as a failing CI test.

The existing `GuidedTour.test.tsx` suite passed all 12 tests. Backend query requests completed with
HTTP 200 and corresponding successful Maple spans during the browser run; the obstruction was reproduced
by frontend geometry alone. That does not rule out loading-induced layout changes in a real session.

## Separate deterministic limit: neither vertical side fits

[cardLayout](../../packages/frontend/src/components/common/GuidedTour/cardLayout.ts) tries below,
then above, then `inside`. It has no left/right placement. `inside` intentionally overlaps the target
and is used for interactive controls as well as large explanatory surfaces.

A geometry probe confirmed that for a 1280 × 450 viewport, target `(1100, 210, 32, 32)`, and card height
220, neither side fits. Placement is `inside`, with top clamped to 12: the card ends at Y=232, covering
the target centre at Y=226. This is a geometry-level example, not a measured export-step reproduction.
Short CSS-pixel viewports, zoom, or more text wrapping could expose this path. It is independent of the
animation race and has not been linked to the original report.

## Follow-up verification and fix criteria

- **Prioritize the stale-anchor race:** reconcile the card with the latest target when expansion ends,
  without restarting the beacon/glide sequence or revealing old step text. Add a regression test for a
  target that moves and then stops during expansion, plus the after-expansion control and a real
  step-5-to-step-6 click transition. Include target removal/replacement and closing mid-animation.
- **Treat constrained placement separately:** choose a non-obstructing fallback for interactive targets
  (for example lateral placement when space exists, or a compact/repositionable card). Do not merely
  raise the export button's z-index, lower the overlay, or make all card content click-through: those
  approaches undermine the tour's interaction guard or its Skip button.
- **Browser acceptance:** after settling, the card must not intersect the clickable target, and hit tests
  at the centre and inset corners must resolve to the target or its descendants. A real pointer click
  must open the export popover and reach step 7; Skip must remain accessible. Check both the direct
  Download path and the Drive chooser path.
- **Reproduction matrix:** normal motion and reduced motion; fresh tour and resumed step; collapsed and
  already-open Results; warm and delayed query loading; scroll/resize during and after expansion;
  normal and short viewports (including browser zoom). Record actual `innerWidth`/`innerHeight`, not
  screenshot dimensions, and wait past all animations before declaring a persistent obstruction.
- **Capture on recurrence:** record the target selector and match count, target/card/spotlight rectangles,
  computed card transform and pointer-events, target disabled state, hit-test element, and a short trace
  of rect changes around expansion. A matching spotlight with a stale card supports the timing failure;
  matching anchors with `inside` placement supports the constrained-layout case.

The missing evidence is the natural sequence that moves the target during the vulnerable window in the
reported training module. The original screenshot was not available as inspectable image content during
this investigation, so its viewport, card placement, and animation phase are not inferred here.
