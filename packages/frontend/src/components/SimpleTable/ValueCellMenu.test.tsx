/**
 * Regression tests for ValueCellMenu drill-down behavior with hidden pivot
 * dimensions.
 *
 * DONE_WITH_CONCERNS: The intended regression guard (asserting that
 * `getUnderlyingFieldValues` returns ALL dimension values — including hidden
 * ones — when `hiddenDimensionFieldIds` is set) cannot be written as a
 * unit test without a full TanStack Table + React mounting environment,
 * because `getUnderlyingFieldValues` is a `useCallback` inside
 * `PivotTable/index.tsx` that reads directly from `rows[rowIndex].getVisibleCells()`.
 *
 * KNOWN LIMITATION: Hidden row-index dimensions (excluded from
 * `indexValues` via `indexDimensionsForDisplay` in `pivotQueryResults.ts`)
 * will be ABSENT from the drill-down/underlying-data context passed to
 * `openUnderlyingDataModal` / `openDrillDownModal`. This means:
 *   - Right-click → "View underlying data" on a pivot cell may return broader
 *     results than expected when a row-index dim is hidden.
 *   - Right-click → "Drill into" on a metric cell may not correctly scope the
 *     drill by the hidden dimension values.
 *
 * RECOMMENDED FIX (follow-up ticket):
 *   Option A — Keep hidden dims in `indexValues` with a `hidden: true` marker;
 *              `PivotTable` skips rendering them but `getUnderlyingFieldValues`
 *              still collects their values.
 *   Option B — Add a separate `hiddenIndexValues` array to `PivotData` that
 *              `getUnderlyingFieldValues` merges alongside visible `indexValue`
 *              cells.
 *
 * Note: `hiddenDimensionFieldIds` correctly excludes hidden dims from the
 * rendered table AND from CSV/XLSX exports (tested in the common-package and
 * backend test suites). The concern here is limited to the interactive
 * drill-down path.
 */

// Intentionally empty — see comment above.
export {};
