# Explorer Redux Migration Plan

## Overview
This issue tracks the comprehensive migration from Context-based state management to Redux for the Explorer components. This migration improves performance by reducing unnecessary re-renders and creates a more predictable state management pattern.

**🎯 END GOAL: Completely eliminate `ExplorerProvider` and Context-based state management.**

The ultimate target is to remove the `ExplorerProvider` component entirely, replacing it with:
- **Redux** for UI/configuration state (filters, dimensions, metrics, chart config)
- **TanStack Query hooks** for server state (query results, loading states)
- **Direct hook usage** in components instead of Context access

All state should be accessed via Redux selectors or TanStack Query hooks directly, making the Provider pattern obsolete.

## Current Status: ~70% Complete ✅
- ✅ **Expanded sections** (visualization, filters, results, SQL)
- ✅ **Visualization configuration** (open/close sidebar)
- ✅ **Filters state** (fully migrated to Redux)
- ✅ **Query execution state** (validQueryArgs, queryUuidHistory in Redux)
- ✅ **Core query state** (MIGRATED - split-hook pattern implemented, 7/10 components migrated)
- ✅ **Query actions** (fetchResults, cancelQuery, getDownloadQueryUuid moved to hook)
- ✅ **Modal state management** (fully migrated - custom dimensions, metrics, write-back)
- ✅ **Performance optimizations** (useExplorerStore hook, optimized callbacks)
- ❌ **Parameter state** (not migrated)
- ❌ **Chart/table calculations state** (not migrated)

### Recent Progress

#### Query Execution Migration ✅ **COMPLETE**
**PR: "migrate query execution from Context to Redux"**
- ✅ Created `useExplorerQuery` hook with split-hook pattern
- ✅ Created `useExplorerQueryManager` for orchestration (runs once at page root)
- ✅ Migrated 7 components from Context to hook: ParametersCard, VisualizationCard, ResultsCard, RefreshButton, FiltersCard, SaveChartButton, ExplorerResults
- ✅ Migrated 2 hooks: useColumns, useDataForFiltersProvider
- ✅ Removed query state from Context type (query, queryResults, unpivotedQuery, unpivotedQueryResults, missingRequiredParameters)
- ✅ Added query manager wrappers to 4 pages to ensure proper parameter flow
- ✅ Refactored to named parameters API: `useExplorerQuery({ minimal: true })`
- ✅ Consolidated implementation (removed delegation layer)
- 📊 Net change: -576 lines of code

#### Modal State Migration ✅ **COMPLETE**
- ✅ All custom dimension and metric modals migrated to Redux:
  - CustomDimensionModal (wrapper + CustomSqlDimensionModal + CustomBinDimensionModal)
  - CustomMetricModal
  - WriteBackModal
- ✅ Modal actions migrated in TreeSingleNodeActions and TableTreeSections
- ✅ Modal state now in `state.explorer.modals.*` instead of Context

#### Performance Optimizations ✅ **COMPLETE**
- ✅ Fixed sidebar re-rendering issue by optimizing `useFilteredFields` hook
- ✅ Created `useExplorerStore` hook for reading state inside callbacks without subscribing
- ✅ Removed `isFiltersExpanded` from callback dependencies to prevent unnecessary re-renders

---

## 📋 Component Migration Status

| Component | State Properties | Actions | Priority | Complexity | Status |
|-----------|------------------|---------|----------|------------|--------|
| **VisualizationCard** | `savedChart`, `unsavedChartVersion.*`, `metadata.tableCalculations` | `setPivotFields`, `setChartType`, `setChartConfig` | 🔴 **High** | **Complex** | ✅ **Complete** (query via hook) |
| **ExplorePanel** | `savedChart.uuid`, `unsavedChartVersion.*`, `activeFields` | `toggleActiveField`, `replaceFields` | 🔴 **High** | **Medium** | ⚠️ **Partial** |
| **useColumns** | `activeFields`, `unsavedChartVersion.*` | None (read-only) | 🔴 **High** | **Simple** | ✅ **Complete** (query via hook) |
| **Explorer** | `unsavedChartVersion.*`, `isEditMode`, `savedChart`, `fromDashboard`, `previouslyFetchedState`, `pivotConfig` | `setParameterReferences` | 🔴 **High** | **Medium** | ✅ **Complete** (query via hook) |
| **ResultsCard** | `unsavedChartVersion.tableName`, `metricQuery.sorts`, `tableConfig.columnOrder`, `savedChart` | None | 🔴 **High** | **Simple** | ✅ **Complete** (query via hook) |
| **SqlCard** | `unsavedChartVersion.tableName` | None | 🔴 **High** | **Simple** | ✅ **Complete** |
| **ParametersCard** | `unsavedChartVersion.tableName/parameters`, `parameterDefinitions` | `setParameter`, `clearAllParameters` | 🔴 **High** | **Medium** | ✅ **Complete** (query via hook) |
| **FiltersCard** | `unsavedChartVersion.tableName`, `metricQuery.filters` | `setFilters` | 🟡 **Medium** | **Simple** | ✅ **Complete** (query via hook) |
| **TreeSingleNodeActions** | None directly | `removeAdditionalMetric`, `toggleAdditionalMetricModal`, `toggleWriteBackModal`, `removeCustomDimension`, `toggleCustomDimensionModal`, `addAdditionalMetric`, `addCustomDimension` | 🟡 **Medium** | **Medium** | ✅ **Complete** (modals via Redux) |
| **RefreshButton** | `unsavedChartVersion.metricQuery.limit` | `setRowLimit` | 🟡 **Medium** | **Medium** | ✅ **Complete** (query via hook) |
| **ExplorerResults** | `isEditMode`, `unsavedChartVersion.*` | `setColumnOrder` | 🟡 **Medium** | **Complex** | ✅ **Complete** (query via hook) |
| **TableTreeSections** | `unsavedChartVersion.metricQuery.additionalMetrics/customDimensions` | `toggleCustomDimensionModal`, `toggleWriteBackModal` | 🟡 **Medium** | **Medium** | ✅ **Complete** (modals via Redux) |
| **SavedChartsHeader** | `isEditMode`, `unsavedChartVersion`, `hasUnsavedChanges`, `savedChart`, `query.data.fields`, `isValidQuery` | `reset` | 🟡 **Medium** | **Medium** | ❌ **Todo** |
| **SaveChartButton** | `unsavedChartVersion`, `hasUnsavedChanges`, `savedChart` | None | 🟡 **Medium** | **Simple** | ✅ **Complete** (query via hook) |
| **ExplorerHeader** | `savedChart`, `unsavedChartVersion`, `isValidQuery`, `queryResults.totalResults`, `query.data.warnings`, `unsavedChartVersion.metricQuery.limit/timezone` | `setTimeZone` | 🟡 **Medium** | **Simple** | ❌ **Todo** |
| **CustomSqlDimensionModal** | `unsavedChartVersion.metricQuery.customDimensions/tableCalculations` | `toggleCustomDimensionModal`, `addCustomDimension`, `editCustomDimension` | 🟢 **Low** | **Simple** | ✅ **Complete** (Redux) |
| **FormatModal** | `modals.format`, `unsavedChartVersion.metricQuery.metricOverrides` | `toggleFormatModal`, `updateMetricFormat` | 🟢 **Low** | **Simple** | ❌ **Todo** |
| **CustomMetricModal** | `modals.additionalMetric`, `unsavedChartVersion.metricQuery.additionalMetrics`, `tableName` | `toggleAdditionalMetricModal`, `addAdditionalMetric`, `editAdditionalMetric` | 🟢 **Low** | **Simple** | ✅ **Complete** (Redux) |
| **CustomBinDimensionModal** | `unsavedChartVersion.metricQuery.customDimensions` | `toggleCustomDimensionModal`, `addCustomDimension`, `editCustomDimension` | 🟢 **Low** | **Simple** | ✅ **Complete** (Redux) |
| **WriteBackModal** | `modals.writeBack` | `toggleWriteBackModal` | 🟢 **Low** | **Simple** | ✅ **Complete** (Redux) |
| **ExploreFromHereButton** | `savedChart` | None | 🟢 **Low** | **Simple** | ❌ **Todo** |

---

## ⚠️ Critical Architecture Decision: TanStack Query State

### The Challenge
The Explorer currently has two types of state:
1. **UI/Configuration State** - filters, dimensions, metrics, chart config (currently in Context, migrating to Redux)
2. **Query/Data Fetching State** - actual query results, loading states, errors (currently TanStack Query hooks in Context)

Components like `useColumns` need both types of state, creating a dependency problem.

### Current State Management
```typescript
// In ExplorerContext
export interface ExplorerContextType {
    state: ExplorerState;                    // UI State - migrating to Redux ✅
    query: ReturnType<typeof useGetReadyQueryResults>;     // TanStack Query - problem ⚠️
    queryResults: ReturnType<typeof useInfiniteQueryResults>; // TanStack Query - problem ⚠️
    actions: { ... }                         // Actions - migrating to Redux ✅
}
```

### Options for TanStack Query Migration

#### Option 1: Keep TanStack Query, Access via Selectors (RECOMMENDED) ✅
**Approach**: Keep TanStack Query for data fetching, but expose query state through Redux-compatible selectors
```typescript
// Create a bridge hook that can be used in selectors
export const useQueryState = () => {
    const query = useGetReadyQueryResults();
    const queryResults = useInfiniteQueryResults();
    return { query, queryResults };
};

// Components can combine Redux selectors with query hooks
const MyComponent = () => {
    const uiState = useExplorerSelector(selectUIState);
    const { query, queryResults } = useQueryState();
};
```

**Pros:**
- No duplicate state management
- TanStack Query continues handling caching, refetching, background updates
- Clean separation of concerns (UI state vs data state)
- Minimal refactoring required

**Cons:**
- Components still need two hooks (Redux selector + query hook)
- Not "pure" Redux

#### Option 2: RTK Query Migration ❌
**Approach**: Replace TanStack Query with Redux Toolkit Query
**Pros:** Everything in Redux
**Cons:** Major refactor, lose TanStack Query features, significant risk

#### Option 3: Sync TanStack Query to Redux ❌
**Approach**: Mirror query state in Redux
**Pros:** Single source for selectors
**Cons:** Duplicate state, synchronization complexity, performance overhead

### ✅ CONFIRMED: Redux + TanStack Query Integration Pattern

**The system already demonstrates how Redux UI state and TanStack Query server state work together perfectly!**

#### Current Interaction Pattern
1. **UI State Changes** (Redux) → **Query Arguments** → **Server Requests** (TanStack Query)
2. **Server Response** (TanStack Query) → **Components** that need both UI + data state

```typescript
// Current implementation using split-hook pattern:
// 1. Manager hook (called ONCE at page root) - orchestrates effects
useExplorerQueryManager(viewModeQueryArgs, dateZoomGranularity, projectUuid, minimal);

// 2. Consumer hooks (called in ANY component) - lightweight reads
const { query, queryResults, isLoading, runQuery, fetchResults } = useExplorerQuery();

// Behind the scenes:
// - Manager runs effects: auto-fetch, parameter watching, unpivoted query setup
// - Consumer reads from Redux + TanStack Query cache (both shared automatically)
// - TanStack Query deduplicates requests across all hook instances
```

#### Key Benefits of This Approach
- **No Duplicate State** - Each library handles what it does best
- **Natural Query Invalidation** - Redux changes automatically trigger new queries
- **Optimal Caching** - TanStack Query continues handling server state optimally
- **No Manual Syncing Required** - Dependencies handle synchronization
- **Performance Optimized** - Effects run once, reads are cheap
- **No Provider Needed** - Direct hook usage in components

#### Split-Hook Pattern (IMPLEMENTED ✅)

To prevent multiple components from running duplicate effects, we use a split-hook pattern:

**`useExplorerQueryManager`** (Heavy Orchestration)
- Called ONCE at the page root (e.g., `Explorer.tsx` page component)
- Runs all effects: auto-fetch, parameter watching, unpivoted query setup
- Manages Redux state updates and TanStack Query lifecycle
- No return value - pure orchestration

**`useExplorerQuery`** (Lightweight Consumer)
- Called from ANY component that needs query state
- Reads from Redux selectors (cheap - memoized)
- Accesses TanStack Query cache (cheap - shared across instances)
- Provides action functions (cheap - just dispatch wrappers)
- Can be called many times without performance penalty
- Uses named parameters API: `useExplorerQuery({ minimal: true })`

**Implementation Details:**
- Manager wrapper components added to 4 pages: Explorer, SavedExplorer, MinimalSavedExplorer, ChartHistory
- Each wrapper passes appropriate parameters (viewModeQueryArgs, dateZoomGranularity, minimal)
- Consumer hook used in 7+ components for query state access
- All query state removed from ExplorerProvider Context

#### Bridge Pattern for Components
```typescript
// Custom hook to access query state (future implementation)
export const useQueryState = () => {
    // Bridge between current Context and future pure hook approach
    const context = useExplorerContext();
    return {
        query: context.query,
        queryResults: context.queryResults,
        unpivotedQuery: context.unpivotedQuery,
        unpivotedQueryResults: context.unpivotedQueryResults,
    };
};

// Component usage pattern
const MyComponent = () => {
    // UI State from Redux
    const dimensions = useExplorerSelector(selectDimensions);
    const chartConfig = useExplorerSelector(selectChartConfig);

    // Server State via bridge hook
    const { query, queryResults } = useQueryState();

    // Both work together seamlessly
    const hasResults = queryResults.data && dimensions.length > 0;
};
```

### Recommended Strategy (REVISED)
1. **Phase 1**: Migrate all UI state to Redux (current work)
2. **Phase 2**: Create bridge hook for query state access
3. **Phase 3**: Remove TanStack Query from Context, use bridge pattern
4. **Phase 4**: Optionally migrate query triggers to Redux actions

### Implementation Notes for Blocked Components
Components that depend on query results will use the bridge pattern:
- `useColumns` - needs `query.data?.metricQuery` and `query.data?.fields`
- `ExplorerResults` - needs `queryResults.data`, `queryResults.isLoading`
- `RefreshButton` - needs `query.isFetching`, `query.cancel`

**Example Migration:**
```typescript
// BEFORE: Mixed Context usage
const useColumns = () => {
    const metricQuery = useExplorerContext(context => context.state.unsavedChartVersion.metricQuery);
    const queryResults = useExplorerContext(context => context.queryResults);
};

// AFTER: Redux + TanStack Query bridge
const useColumns = () => {
    const metricQuery = useExplorerSelector(selectMetricQuery);
    const { queryResults } = useQueryState();
};
```

---

## 🎯 Migration Phases

### Phase 1: Core UI State (High Priority) ✅ **COMPLETE**
**Goal**: Migrate UI state that doesn't depend on query results
- [x] **FiltersCard** - ✅ Complete
- [x] **SqlCard** - ✅ Complete
- [x] **ParametersCard** - ✅ Complete (query via hook)
- [x] **SaveChartButton** - ✅ Complete (query via hook)
- [x] **CustomMetricModal** - ✅ Complete (modal state in Redux)
- [x] **CustomDimensionModal** - ✅ Complete (modal state in Redux)
- [ ] **ExplorerHeader** - Timezone and limit controls **TODO**

**New Selectors Needed:**
```typescript
selectUnsavedChartVersion
selectMetricQuery
selectSavedChart
selectActiveFields
selectQueryResults
selectIsValidQuery
selectHasUnsavedChanges
selectTableName
selectQueryLimit
selectTimezone
selectMissingRequiredParameters
```

**New Actions Needed:**
```typescript
setActiveField
toggleActiveField
setChartConfig
setChartType
setPivotFields
setColumnOrder
setRowLimit
setTimeZone
setParameter
clearAllParameters
```

### Phase 2: Components with Query Dependencies ✅ **COMPLETE**
**Goal**: Migrate components that need both UI state AND query results
**Solution**: Implemented split-hook pattern with `useExplorerQuery`

- [x] **useColumns** - ✅ Complete: uses `useExplorerQuery` hook
- [x] **ExplorerResults** - ✅ Complete: uses `useExplorerQuery` hook
- [x] **RefreshButton** - ✅ Complete: uses `useExplorerQuery` hook
- [x] **ResultsCard** - ✅ Complete: uses `useExplorerQuery` hook
- [x] **VisualizationCard** - ✅ Complete: uses `useExplorerQuery` hook
- [x] **Explorer** - ✅ Complete: uses `useExplorerQueryManager` wrapper

### Phase 3: Modal Management ✅ **COMPLETE**
**Goal**: Migrate all modal state to Redux
- [x] **CustomMetricModal** + actions ✅
- [x] **CustomDimensionModal** + actions (including CustomSqlDimensionModal, CustomBinDimensionModal) ✅
- [x] **WriteBackModal** + actions ✅
- [x] **TreeSingleNodeActions** - modal trigger actions ✅
- [x] **TableTreeSections** - modal trigger actions ✅
- [ ] **FormatModal** + actions **TODO**
- [ ] **TableCalculation modals** (4 components) **TODO**

**New Selectors/Actions:**
```typescript
// Modal state
selectModals
selectFormatModal
selectAdditionalMetricModal
selectCustomDimensionModal

// Modal actions
toggleFormatModal
toggleAdditionalMetricModal
toggleCustomDimensionModal
toggleWriteBackModal

// Metric/Dimension management
addAdditionalMetric
editAdditionalMetric
removeAdditionalMetric
addCustomDimension
editCustomDimension
removeCustomDimension
```

---

## 📝 Sub-Issues to Create

### Critical Path Issues:
1. **[High] Migrate Core Query State Selectors**
   - Components: useColumns, Explorer, VisualizationCard
   - Estimated effort: 2-3 days

2. **[High] Migrate Parameter Management**
   - Components: ParametersCard, Explorer (setParameterReferences)
   - Estimated effort: 1-2 days

3. **[High] Migrate Query Results Display**
   - Components: ResultsCard, ExplorerResults
   - Estimated effort: 1-2 days

### Medium Priority Issues:
4. **[Medium] Migrate Interactive Components**
   - Components: RefreshButton, TreeSingleNodeActions, Headers
   - Estimated effort: 2-3 days

### Low Priority Issues:
5. **[Low] Migrate Modal State Management**
   - All modal components
   - Estimated effort: 1-2 days

---

## ✅ Success Criteria

- [x] All `useExplorerContext` usage eliminated from High priority components (for query state)
- [x] No state inconsistencies between Context and Redux
- [x] Performance improvements measured (fewer re-renders from shared TanStack Query cache)
- [x] All existing E2E tests pass
- [ ] New E2E tests for critical state transitions (view ↔ edit mode)
- [x] Query state successfully migrated from Context to hooks
- [x] Net negative line count (-576 lines)

---

## 🧪 Testing Strategy

### Development Testing:
- Use `useStateDebugger()` hook to catch inconsistencies
- Monitor console for state synchronization warnings
- Test view ↔ edit mode transitions

### E2E Testing Focus:
- Configure button appears in edit mode ✅ **Fixed**
- Configure sidebar toggles correctly ✅ **Fixed**
- State persists during mode transitions
- Modal interactions work correctly
- Query building workflow (dimensions → metrics → filters → results)

---

## 📚 Migration Patterns

### Read-Only Components (Simple):
```typescript
// Before
const tableName = useExplorerContext(context => context.state.unsavedChartVersion.tableName);

// After
const tableName = useExplorerSelector(selectTableName);
```

### Interactive Components (Medium):
```typescript
// Before
const setChartType = useExplorerContext(context => context.actions.setChartType);

// After
const dispatch = useExplorerDispatch();
const setChartType = useCallback((type) => dispatch(explorerActions.setChartType(type)), [dispatch]);
```

### Complex State (Advanced):
```typescript
// Create computed selectors for complex derived state
export const selectActiveFields = createSelector(
  [selectDimensions, selectMetrics, selectTableCalculations],
  (dimensions, metrics, tableCalculations) => new Set([
    ...dimensions,
    ...metrics,
    ...tableCalculations.map(tc => tc.name)
  ])
);
```