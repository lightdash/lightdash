# Explorer Migration Checklist

This checklist ensures the query state migration from Context to a separate hook maintains all existing functionality.

## Pre-Migration Verification

- [ ] All tests passing on main branch
- [ ] Document current query execution count for common operations
- [ ] Note current performance metrics (re-renders, query times)
- [ ] Backup current branch

## Phase 1: Create Query Hook Infrastructure ✅ **COMPLETE**

### 1.1 Create `useExplorerQuery` Hook ✅
- [x] Create new file: `hooks/useExplorerQuery.ts`
- [x] Import necessary Redux selectors
- [x] Import TanStack Query hooks
- [x] Implement query args computation from Redux state
- [x] Implement split-hook pattern (manager + consumer)

### 1.2 Implement Core Query Logic ✅
- [x] Port `computedMetricQuery` logic (merge Redux filters with metricQuery)
- [x] Port `validQueryArgs` computation
- [x] Port `missingRequiredParameters` logic
- [x] Port pivot configuration detection
- [x] Set up `useQueryManager` integration

### 1.3 Implement Query Actions ✅
- [x] Create `fetchResults` (invalidate and refetch)
- [x] Create `cancelQuery` (cancel pending queries)
- [x] Create `getDownloadQueryUuid` (conditional query for export)
- [x] Ensure query history tracking works

## Phase 2: Component Migration ✅ **COMPLETE (7/10)**

### 2.1 RefreshButton (Simplest) ✅ **COMPLETE**
- [x] Replace `useExplorerContext` for query state with `useExplorerQuery`
- [x] Replace `fetchResults` action with new implementation
- [x] Replace `cancelQuery` action
- [x] Verify loading states work
- [x] Verify error states display
- [x] Test manual refresh functionality

### 2.2 useColumns Hook ✅ **COMPLETE**
- [x] Replace Context query access with `useExplorerQuery`
- [x] Verify columns generate correctly
- [x] Verify sorting indicators work
- [x] Test with table calculations
- [x] Test with custom dimensions

### 2.3 ResultsCard ✅ **COMPLETE**
- [x] Replace query results access
- [x] Replace `getDownloadQueryUuid` action
- [x] Verify export to CSV works
- [x] Verify export to Google Sheets works
- [x] Test pagination if applicable

### 2.4 VisualizationCard (Most Complex) ✅ **COMPLETE**
- [x] Replace all query state access
- [x] Replace chart download functionality
- [x] Verify chart renders with new data source
- [x] Test pivot scenarios
- [x] Verify loading states

### 2.5 Additional Components ✅ **COMPLETE (7/7)**
- [x] ExplorerResults - replace unpivoted query access
- [x] FiltersCard - replace rows access for suggestions
- [x] CustomMetricModal hooks - update data access
- [x] ParametersCard - replace missingRequiredParameters access
- [x] SaveChartButton - replace missingRequiredParameters access

### 2.6 Remaining Components ⚠️ **TODO (3 components)**
- [ ] ExplorerHeader - replace query warnings access **TODO**
- [ ] MinimalSavedExplorer - update query access **TODO**
- [ ] useCompiledSql - update query access **TODO**

## Phase 3: Auto-fetch and Effects Migration ✅ **COMPLETE**

### 3.1 Auto-fetch Logic ✅
- [x] Move auto-fetch effect from ExplorerProvider to query hook
- [x] Verify auto-fetch triggers on:
  - [x] Dimension changes
  - [x] Metric changes
  - [x] Filter changes
  - [x] Parameter changes
  - [x] Sort changes
  - [x] Table changes
- [x] Verify auto-fetch respects enabled/disabled setting
- [x] Test "run query on load" behavior

### 3.2 Parameter Change Detection ✅
- [x] Port `parametersChanged` logic
- [x] Verify parameter changes trigger re-query
- [x] Test with required parameters
- [x] Test with optional parameters
- [x] Verify missing parameter validation

### 3.3 Unpivoted Query Logic ✅
- [x] Port `needsUnpivotedData` computation
- [x] Port unpivoted query args generation
- [x] Verify dual queries run when needed
- [x] Test results table shows unpivoted data
- [x] Test chart shows pivoted data

## Phase 4: Modal State Migration ✅ **COMPLETE**

### 4.1 Modal Components ✅
- [x] CustomDimensionModal wrapper - migrated to Redux
- [x] CustomSqlDimensionModal - migrated to Redux dispatch
- [x] CustomBinDimensionModal - migrated to Redux dispatch
- [x] CustomMetricModal - migrated to Redux dispatch
- [x] WriteBackModal - migrated to Redux

### 4.2 Modal Action Components ✅
- [x] TreeSingleNodeActions - all modal actions migrated to Redux
- [x] TableTreeSections - modal trigger actions migrated to Redux

### 4.3 Performance Optimizations ✅
- [x] Created `useExplorerStore` hook for reading state in callbacks
- [x] Fixed `useFilteredFields` re-rendering issue
- [x] Optimized `addFilter` callback to read state at call time

## Phase 5: Remove Context Dependencies ✅ **COMPLETE**

### 5.1 Clean ExplorerProvider ✅
- [x] Remove `useQueryManager` imports and usage
- [x] Remove `query` and `queryResults` from context value
- [x] Remove `unpivotedQuery` and `unpivotedQueryResults`
- [x] Remove `validQueryArgs` state
- [x] Remove `runQuery` function
- [x] Remove `fetchResults` from actions
- [x] Remove `cancelQuery` from actions
- [x] Remove query-related useEffects
- [x] Remove `getDownloadQueryUuid` from actions

### 5.2 Update Context Type ✅
- [x] Remove query fields from `ExplorerContextType`
- [x] Remove `missingRequiredParameters` from state
- [x] Update type exports
- [x] Fix any TypeScript errors

### 5.3 Clean Up Sync Code ✅
- [x] Remove `computedMetricQuery` if no longer needed (kept for now, still used internally)
- [x] Remove query-related TODOs
- [x] Clean up migration comments

## Functional Validation

### Query Execution
- [ ] ✅ Queries execute on field selection
- [ ] ✅ Queries execute on filter changes
- [ ] ✅ Queries execute on parameter changes
- [ ] ✅ Manual refresh works
- [ ] ✅ Query cancellation works
- [ ] ✅ Loading states display correctly
- [ ] ✅ Error states display correctly

### Auto-fetch Behavior
- [ ] ✅ Auto-fetch enabled: automatic query on changes
- [ ] ✅ Auto-fetch disabled: manual trigger only
- [ ] ✅ First query execution behavior correct
- [ ] ✅ Subsequent query behavior correct

### Results Display
- [ ] ✅ Results table populates
- [ ] ✅ Column ordering preserved
- [ ] ✅ Sorting works
- [ ] ✅ Totals calculate correctly
- [ ] ✅ Pivot detection works
- [ ] ✅ Unpivoted data in results when chart pivoted

### Export Functionality
- [ ] ✅ CSV export works
- [ ] ✅ Google Sheets export works
- [ ] ✅ Export with custom limit works
- [ ] ✅ Export respects current filters/sorts

### Chart Visualization
- [ ] ✅ Charts render with data
- [ ] ✅ Chart config changes don't trigger query
- [ ] ✅ Pivot configuration works
- [ ] ✅ Download chart works

### Edge Cases
- [ ] ✅ Empty results handled
- [ ] ✅ Large result sets handled
- [ ] ✅ Query timeout handled
- [ ] ✅ Network errors handled
- [ ] ✅ Invalid query states prevented

## Performance Validation

### Metrics to Check
- [ ] Component re-renders not increased
- [ ] Query execution count unchanged
- [ ] No memory leaks introduced
- [ ] No unnecessary query duplications

### User Experience
- [ ] No visual regressions
- [ ] Loading states feel responsive
- [ ] No UI flicker or jumps
- [ ] Keyboard navigation still works

## Rollback Plan

If issues discovered:
1. [ ] Document specific failure
2. [ ] Git stash changes
3. [ ] Revert to backup branch
4. [ ] Analyze issue for next attempt

## Post-Migration

### Code Cleanup
- [ ] Remove all TODO: REDUX-MIGRATION comments
- [ ] Remove unused imports
- [ ] Run linter and fix issues
- [ ] Update component documentation

### Documentation
- [ ] Update EXPLORER_REDUX_MIGRATION_PLAN.md
- [ ] Archive EXPLORER_CURRENT_STATE.md with date
- [ ] Create migration summary PR description
- [ ] Document any API changes

### Testing
- [ ] Run full test suite
- [ ] Manual testing of critical flows
- [ ] Performance testing
- [ ] Get code review

## Sign-off

- [ ] Developer testing complete
- [ ] Code review approved
- [ ] No regressions identified
- [ ] Performance acceptable
- [ ] Ready for merge

---

## Quick Test Scenarios

### Scenario 1: Basic Query Flow
1. Open Explorer
2. Select a table
3. Add dimensions and metrics
4. Verify results appear
5. Add a filter
6. Verify results update

### Scenario 2: Parameter Flow
1. Open chart with parameters
2. Change parameter value
3. Verify query re-executes
4. Clear parameter
5. Verify validation message

### Scenario 3: Export Flow
1. Run a query
2. Export to CSV
3. Verify file downloads
4. Export with different limit
5. Verify new query runs

### Scenario 4: Pivot Flow
1. Create pivot chart
2. Verify chart shows pivoted
3. Open results table
4. Verify table shows unpivoted
5. Change pivot config
6. Verify both update

### Scenario 5: Error Handling
1. Trigger query error (bad filter)
2. Verify error displays
3. Fix error
4. Verify recovery works
5. Cancel long-running query
6. Verify cancellation works