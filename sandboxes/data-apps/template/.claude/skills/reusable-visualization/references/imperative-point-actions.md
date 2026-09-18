# Imperative point actions

Read this before implementing point actions in ECharts, imperative D3, canvas, or another
renderer whose marks cannot spread `getMarkProps`. This is the adapter path; the React SVG/HTML
path uses `useVizActions` in the main skill.

Keep the same eligibility and host contract. Attach actions only when a mark identifies one
original SDK row and one declared metric slot. Keep its stable point key, source row, declared
`metric`, optional multiple-input `fieldId`, accessible label, and formatted metric value in
menu state. Show underlying-data and drill items independently from their current enabled flags;
render no disabled or empty menu. Host dialogs own their data, loading, error, sorting, and
download UI.

Adapt the renderer's event into this library-neutral activation shape. Pointer coordinates are
native viewport `clientX` and `clientY`, never chart-relative coordinates. Keyboard activation
anchors at the current mark's bounding-rectangle centre.

```ts
type PointActivation = {
  point: { key: string; row: VizContextRow; metric: string; fieldId?: string; label: string; formattedValue: string };
  activator: Element;
  keyboard: boolean;
  clientX?: number;
  clientY?: number;
};
```

Open the menu at those viewport coordinates through a fixed, 1px trigger portal rendered in the
iframe's `document.body`; preserve Radix collision handling so it flips or shifts at viewport
edges. On pointer activation, blur the mark after opening. On keyboard activation, resolve the
current mark from a stable-key ref map after closing and restore focus to it. Do not retain a
stale DOM node across rerenders.

The renderer adapter makes every eligible SVG mark or equivalent accessible while either action
is enabled: a tab stop, button semantics, an accessible name, and Enter/Space activation. When
neither action is enabled, it omits action semantics and handlers. For canvas marks, provide an
equivalent focusable overlay or another per-mark keyboard path before presenting the chart as
interactive. Verify Tab → mark → Enter/Space → menu → Escape returns focus to the current mark.

Opening the menu closes the tooltip. Keep it hidden until subsequent pointer movement, leave no
persistent click or selection emphasis, and use a subtle hover treatment without a full-height
cursor band. Render only the themed, deduplicated tooltip appropriate to the renderer.
