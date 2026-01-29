# Spec: Period over Period - Support consistent comparison config across multiple metrics

**Issue source:** [Slack thread](https://lightdash.slack.com/archives/C09UGKWHGR5/p1769683978855179?thread_ts=1769602844.370549&cid=C09UGKWHGR5) / [Loom video](https://www.loom.com/share/a5f594ae2e18448c844bd133659559a4)
**Reported by:** Jess Hitchcock
**Area:** Period over Period (PoP) comparisons in the Explore view

---

## Problem

When a chart already has a metric with a Period over Period (PoP) comparison configured, adding a second metric and attempting to add a PoP comparison to it results in a backend error:

> "Multiple period comparison configurations in a single query are not supported yet"

### Steps to reproduce

1. Open a saved chart (or Explore view) that has at least one metric with a PoP comparison already configured (e.g., "Total Revenue" with "Previous Month" comparison)
2. Add a second metric to the chart (e.g., "Total Orders")
3. Right-click the new metric column header and select **"Add period comparison"**
4. In the modal, select a time dimension and set an offset (e.g., offset = 1)
5. Click **"Add comparison"**
6. The query executes and returns a `CompileError`

### Root cause

The backend (`MetricQueryBuilder.ts:336-363`) validates that all PoP additional metrics in a query share the **exact same configuration** (time dimension, granularity, and period offset). However, the frontend **PoP comparison modal** (`PeriodOverPeriodComparisonModal.tsx`) does not know about any existing PoP configuration in the query. It always starts with a blank state, letting the user pick any time dimension and offset independently. This means:

- Even if the user picks the **same** time dimension but a **different** offset, the query fails
- Even if the user picks a **different** time dimension with the same offset, the query fails
- Only if the user independently arrives at the exact same config does the query succeed - which is not discoverable

The UI provides no indication that a PoP configuration already exists, and no guidance on what configuration would be compatible.

---

## Proposed solution

When the user opens the "Add period comparison" modal and there is already an existing PoP comparison configured in the current query, the modal should **automatically inherit the existing configuration** rather than presenting a blank form.

### Behavior

#### Case 1: No existing PoP configuration in the query
- **No change** - the modal works exactly as it does today (user picks time dimension, offset, etc.)

#### Case 2: Existing PoP configuration in the query
- The modal should detect that other metrics already have PoP comparisons configured
- The time dimension and offset should be **pre-populated and locked** to match the existing configuration
- Display an informational message explaining why the fields are locked, e.g.:
  > "Period comparison settings are shared across all metrics in this query. Using: [Time Dimension] with offset [N]."
- The user can still confirm or cancel, but cannot change the configuration
- On confirm: the new PoP metric is created with the inherited configuration, and the query executes successfully

#### Case 3: User wants a different PoP configuration
- As Jess noted in the Loom, if the user wants to change the PoP configuration, they would need to:
  1. Remove the existing PoP comparisons from all metrics
  2. Re-add them with the new desired configuration
- This is acceptable for the initial implementation. A future enhancement could add a "Change comparison settings for all metrics" flow.

### Implementation details

#### Frontend changes

**`PeriodOverPeriodComparisonModal.tsx`**
- Read the existing `additionalMetrics` from the explorer state
- Filter for any `PeriodOverPeriodAdditionalMetric` that is currently selected in the query
- If any exist, extract their shared config: `{ timeDimensionId, granularity, periodOffset }`
- Pre-populate the modal form with these values
- Disable the time dimension `Select` and offset `NumberInput` fields
- Show an informational `Text` or `Alert` component explaining the lock

**`explorerSlice.ts`** (optional)
- Add a selector `selectExistingPopConfig` that returns the current PoP configuration (if any) from the active query's additional metrics. This keeps the logic reusable and testable.

#### No backend changes required
The backend validation is correct - it enforces that all PoP metrics share the same config. The fix is entirely in the frontend to prevent the user from creating conflicting configurations.

---

## Out of scope (future enhancements)

- **Bulk update PoP configuration**: A UI to change the PoP config for all metrics at once (instead of remove-all-then-re-add)
- **Per-metric PoP configurations**: Lifting the backend restriction to allow different PoP configs per metric (requires significant query builder changes)
- **PoP config in chart settings panel**: A centralized place to view/edit the query-level PoP configuration

---

## Files involved

| File | Change |
|------|--------|
| `packages/frontend/src/components/Explorer/PeriodOverPeriodComparisonModal/PeriodOverPeriodComparisonModal.tsx` | Detect existing PoP config, pre-populate and lock fields |
| `packages/frontend/src/features/explorer/store/explorerSlice.ts` | (Optional) Add `selectExistingPopConfig` selector |
| `packages/backend/src/utils/QueryBuilder/MetricQueryBuilder.ts` | No changes needed (validation is correct) |
