# PROD-5901 — Group repeated row values in pivot tables (without requiring subtotals)

**Status:** Design — not implemented
**Linear:** [PROD-5901](https://linear.app/lightdash/issue/PROD-5901/groupmerge-same-row-values-in-pivot-tables-without-requiring-subtotals)
**Related:** PROD-2108 (hide pivot dimensions, shipped), PROD-5789 (default subtotals expanded), PROD-4952 (column-header grouping, shipped)

## Goal

Let users get the "professional pivot look" — repeated row-dim values visually merged into a single cell spanning multiple rows — without enabling the heavyweight subtotal aggregate rows.

This was raised by a customer alongside other pivot pain points; their phrasing:

> Grouping of Row headers, I guess this is cosmetic but we use Pivot tables a lot and without this grouping they don't appear to look very professional so we're having to write Vega lite charts instead which is not ideal.

## Background

Today, repeated row values in a pivot table are only visually deduplicated when `showSubtotals` is enabled, because `showSubtotals` toggles TanStack Table's `setGrouping`, which produces *both* the visual dedup *and* the aggregate subtotal rows. There is no way to get one without the other. Customers who want the dedup but not the aggregate rows are stuck.

Mechanically, the existing effect lives in `packages/frontend/src/components/common/PivotTable/index.tsx` (~line 897). It computes a grouped-columns list from the row-index dims, drops the leaf (`.slice(0, -1)` — the leaf is unique-per-row so grouping it would create useless one-item groups), and calls `table.setGrouping(...)`.

## Design

### Config

Add a new boolean to the `TableChart` config in `packages/common/src/types/savedCharts.ts`:

```ts
showRowGrouping?: boolean; // default false
```

- Independent of `showSubtotals`. Both can be true together.
- When `showSubtotals` is `true`, `showRowGrouping` is *implicitly* true (subtotals can't exist without grouping the rows they aggregate). UI greys out the `showRowGrouping` toggle in that case with a tooltip.
- New charts default to `false`. Existing charts unchanged (`undefined` → `false`). No migration.

### UI

In the table chart **General** config panel (the same panel that hosts `showSubtotals`), add the new toggle directly under "Show row subtotals":

```
[x] Show row subtotals
[ ] Group repeated row values
```

When subtotals are on, the second toggle is disabled + checked, with a tooltip: *"Row grouping is always on when subtotals are enabled."*

### Rendering

Reuse the existing TanStack `setGrouping` machinery — it already produces both the dedup and the aggregate rows. The new mode just *hides* the aggregate row rendering when `showRowGrouping=true && showSubtotals=false`.

In `PivotTable/index.tsx`:

1. The `useEffect` that calls `table.setGrouping(...)` now triggers whenever **either** `showSubtotals` OR `showRowGrouping` is true (currently only on `showSubtotals`).
2. When grouping is active but subtotals are off:
   - Pass `initialState.expanded = true` so every group starts expanded and the expand/collapse caret is never visible.
   - In the row renderer, skip rendering the `row.getIsGrouped()` aggregate row entirely. Today these rows render the subtotal cell content; under `!showSubtotals` we render nothing.
3. The `.slice(0, -1)` rule that drops the leaf dim from the grouping list stays unchanged — leaf dim is unique-per-row by construction, so deduping it is a no-op and grouping it produces one-row groups.

### Sort interaction

Inherit from `showSubtotals`: when grouping is active, grouped dims are forced to lead `columnOrder`. This guarantees consecutive-equal-values within each group, so dedup renders correctly regardless of metric sort.

### Exports

Out of scope. CSV/XLSX exports already render the full unmerged data — dedup is purely a visual concern. No changes needed.

### Edge cases

- **All row-index dims hidden** (via PROD-2108 `hiddenDimensionFieldIds`): toggle is a no-op visually. Don't disable it in the UI — the config persists in case dims become visible again.
- **No row-index dims** (only column pivot + metrics): toggle has nothing to group. Disable in UI with tooltip.
- **Single row-index dim**: today's `.slice(0, -1)` means nothing gets grouped. We keep this rule — there's nothing to dedup if every row has a unique leaf value, and grouping the only dim would make every value its own one-row group.

## Testing

- Unit: `PivotTable` renders without aggregate rows when `showRowGrouping=true && showSubtotals=false`, and with rowSpan'd row-index cells.
- Unit: `showSubtotals=true` implies grouping regardless of `showRowGrouping`.
- Unit: config UI disables `showRowGrouping` when subtotals are on.
- Regression: existing subtotals behavior unchanged when both toggles are on.

## Out of scope

- Feature flag — low-risk, additive, opt-in. Ship straight to GA.
- Migration of existing charts to default-on.
- Column-header grouping (already shipped under PROD-4952).
- Per-dimension toggling (group some dims but not others).
- Visual styling refinements beyond what TanStack's default rowSpan produces — pick this up if design has opinions during implementation.

## Open questions

None at design time. Confirm with design during implementation whether the disabled "Group repeated row values" toggle should be visibly checked (to communicate it's implicitly on) or just disabled.
