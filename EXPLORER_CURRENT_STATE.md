# Explorer Current State Documentation

This document captures the current state of Explorer component dependencies as of the Redux migration effort. It serves as a reference for understanding data flow and dependencies before migrating query state out of Context.

## Overview

- **Total Components Using Context**: 26 (down from 35)
- **Components Also Using Redux**: ~20 (hybrid pattern)
- **Query-Dependent Components**: 3 (down from 10)
- **Migration Status**: ~70% complete

## Recent Progress

### Query Execution Migration ✅ **COMPLETED**
- Created split-hook pattern: `useExplorerQueryManager` (orchestration) + `useExplorerQuery` (consumption)
- Migrated 7 components from Context to hooks for query state
- Net change: -576 lines of code
- Query state now accessed via `useExplorerQuery()` hook instead of Context

### Modal State Migration ✅ **COMPLETED**
- All custom dimension and metric modals migrated to Redux:
  - CustomDimensionModal (wrapper + CustomSqlDimensionModal + CustomBinDimensionModal)
  - CustomMetricModal
  - WriteBackModal
- Modal actions migrated in TreeSingleNodeActions and TableTreeSections
- Modal state now in `state.explorer.modals.*` instead of Context

### Performance Optimizations ✅ **COMPLETED**
- Fixed sidebar re-rendering issue by optimizing `useFilteredFields` hook
- Created `useExplorerStore` hook for reading state inside callbacks without subscribing
- Removed `isFiltersExpanded` from callback dependencies to prevent unnecessary re-renders

## Component Dependency Matrix

### Primary Components

#### 1. ParametersCard (`components/Explorer/ParametersCard/ParametersCard.tsx`) ✅ **MIGRATED**
**Purpose**: Manages parameter input and validation
| Dependency Type | Context | Hook (`useExplorerQuery`) | Redux |
|----------------|---------|---------------------------|-------|
| **State** | - | `missingRequiredParameters` | `isParametersExpanded`, `isEditMode`, `tableName`, `parameterDefinitions`, `parameters` |
| **Actions** | `setParameter`, `clearAllParameters` | - | `toggleExpandedSection` |
| **Query** | - | Query state via hook | - |

#### 2. VisualizationCard (`components/Explorer/VisualizationCard/VisualizationCard.tsx`) ✅ **MIGRATED**
**Purpose**: Renders charts and manages visualization configuration
| Dependency Type | Context | Hook (`useExplorerQuery`) | Redux |
|----------------|---------|---------------------------|-------|
| **State** | `savedChart`, `unsavedChartVersion`, `tableCalculationsMetadata` | `missingRequiredParameters` | `isVisualizationExpanded`, `isEditMode`, `isVisualizationConfigOpen` |
| **Actions** | `setPivotFields`, `setChartType`, `setChartConfig` | `getDownloadQueryUuid` | `toggleExpandedSection`, `openVisualizationConfig`, `closeVisualizationConfig` |
| **Query** | - | `query.isFetching`, `queryResults` | - |

#### 3. ExplorePanel (`components/Explorer/ExplorePanel/index.tsx`)
**Purpose**: Data model tree and field selection
| Dependency Type | Context | Redux |
|----------------|---------|-------|
| **State** | `savedChart.uuid`, `tableName`, `activeFields`, `additionalMetrics`, `dimensions`, `customDimensions`, `metrics` | `isVisualizationConfigOpen` |
| **Actions** | `toggleActiveField`, `replaceFields` | - |
| **Query** | - | - |

#### 4. ResultsCard (`components/Explorer/ResultsCard/ResultsCard.tsx`) ✅ **MIGRATED**
**Purpose**: Query results display and export
| Dependency Type | Context | Hook (`useExplorerQuery`) | Redux |
|----------------|---------|---------------------------|-------|
| **State** | `savedChart` | - | `isEditMode`, `isResultsExpanded`, `tableName`, `sorts`, `metricQuery`, `columnOrder` |
| **Actions** | - | `getDownloadQueryUuid` | `toggleExpandedSection` |
| **Query** | - | `queryResults.totalResults` | - |

#### 5. RefreshButton (`components/RefreshButton.tsx`) ✅ **MIGRATED**
**Purpose**: Query execution control
| Dependency Type | Context | Hook (`useExplorerQuery`) | Redux |
|----------------|---------|---------------------------|-------|
| **State** | `metricQuery.limit` | `isValidQuery` | - |
| **Actions** | `setRowLimit` | `fetchResults`, `cancelQuery` | - |
| **Query** | - | `query.isFetching`, `query.error` | - |

#### 6. FiltersCard (`components/Explorer/FiltersCard/FiltersCard.tsx`) ✅ **FULLY MIGRATED**
**Purpose**: Filter management
| Dependency Type | Context | Hook (`useExplorerQuery`) | Redux |
|----------------|---------|---------------------------|-------|
| **State** | - | - | `isFiltersExpanded`, `additionalMetrics`, `customDimensions`, `tableCalculations`, `filters`, `isEditMode`, `tableName` |
| **Actions** | - | - | `setFilters`, `toggleExpandedSection` |
| **Query** | - | `queryResults.rows` (for filter suggestions) | - |

### Hook Dependencies

#### useColumns (`hooks/useColumns.tsx`) ✅ **MIGRATED**
**Purpose**: Table column configuration
| Dependency Type | Context | Hook (`useExplorerQuery`) | Redux |
|----------------|---------|---------------------------|-------|
| **State** | `activeFields`, `parameters` | `query.data?.metricQuery`, `query.data?.fields` | `tableName`, `tableCalculations`, `customDimensions`, `additionalMetrics`, `sorts` |
| **Actions** | - | - | - |
| **Query** | - | Via hook | - |

#### useFilters (`hooks/useFilters.ts`) ✅ **FULLY MIGRATED**
**Purpose**: Filter utilities
| Dependency Type | Context | Hook | Redux |
|----------------|---------|------|-------|
| **State** | - | - | `filters`, `isFiltersExpanded` |
| **Actions** | - | - | `setFilters`, `toggleExpandedSection` |
| **Query** | - | - | - |

### Secondary Components

| Component | Context Dependencies | Hook Dependencies | Redux Dependencies | Query Dependencies |
|-----------|---------------------|-------------------|--------------------|--------------------|
| SaveChartButton ✅ | `unsavedChartVersion`, `hasUnsavedChanges`, `savedChart` | `missingRequiredParameters` | - | - |
| ExplorerHeader | `savedChart`, `unsavedChartVersion`, `timezone` | `isValidQuery`, `query.data?.warnings`, `queryResults.totalResults` | - | Via hook |
| ExplorerResults ✅ | `isEditMode`, `unsavedChartVersion` | `missingRequiredParameters`, `unpivotedQuery`, `unpivotedQueryResults` | - | Via hook |
| SavedChartsHeader | `isEditMode`, `unsavedChartVersion`, `hasUnsavedChanges`, `savedChart`, `isValidQuery` | - | - |
| SqlCard | `tableName` | `isSqlExpanded` | - |
| TreeSingleNodeActions ✅ | - | - | All modal actions migrated to Redux | - |
| TableTreeSections ✅ | - | - | Modal actions, `additionalMetrics`, `customDimensions` | - |

### Modal Components

| Component | Context Dependencies | Redux Dependencies | Status |
|-----------|---------------------|-------------------|--------|
| CustomMetricModal ✅ | - | All state + actions in Redux | **MIGRATED** |
| CustomDimensionModal ✅ | - | All state + actions in Redux | **MIGRATED** |
| CustomSqlDimensionModal ✅ | - | All state + actions in Redux | **MIGRATED** |
| CustomBinDimensionModal ✅ | - | All state + actions in Redux | **MIGRATED** |
| WriteBackModal ✅ | - | All state + actions in Redux | **MIGRATED** |
| FormatModal | `toggleFormatModal`, `updateMetricFormat` | - | **TODO** |
| TableCalculation Modals (4) | Table calculation CRUD | - | **TODO** |

## State Categories

### 1. UI State (Mostly in Redux)
- `expandedSections` (filters, results, visualization, sql, parameters)
- `isEditMode`
- `isVisualizationConfigOpen`
- `modals` (customDimension, additionalMetric, writeBack) ✅ **MIGRATED**

### 2. Query Configuration (Mixed)
- **Redux**: `filters`, `sorts`, `parameters`, `tableName`
- **Context**: `metricQuery` (dimensions, metrics, additionalMetrics, customDimensions, tableCalculations)

### 3. Computed State (Context Only)
- `activeFields` - Set of all selected field IDs
- `isValidQuery` - Whether query can be executed
- `hasUnsavedChanges` - Diff between saved and current
- `missingRequiredParameters` - Parameters without values
- `computedMetricQuery` - metricQuery + Redux filters

### 4. Query Execution State (Redux + TanStack via Hook) ✅ **MIGRATED**
- `validQueryArgs` - Prepared query arguments (Redux)
- `query` - TanStack Query state (via `useExplorerQuery` hook)
- `queryResults` - TanStack Query results (via `useExplorerQuery` hook)
- `unpivotedQuery/Results` - For results table when pivoted (via hook)
- `queryUuidHistory` - Query UUID tracking (Redux)
- `unpivotedQueryUuidHistory` - Unpivoted query UUID tracking (Redux)

### 5. Actions

#### Simple State Updates (Moving to Redux)
- Field toggling
- Sort management
- Filter updates
- Parameter updates

#### Complex Actions (Remaining in Context)
- `fetchResults` - Query execution with reset
- `getDownloadQueryUuid` - Conditional query for export
- `runQuery` - Query preparation (internal)
- Chart/Table config updates

## Synchronization Patterns

### Double Dispatch Pattern
Many components dispatch to both Context and Redux during migration:
```typescript
// Example from setParameter
dispatch({ type: ActionType.SET_PARAMETER, payload: { key, value } });
reduxDispatch(explorerActions.setParameter({ key, value }));
```

### Computed State Bridge
```typescript
// Context combines Redux filters with Context metricQuery
const computedMetricQuery = useMemo(() => ({
    ...unsavedChartVersion.metricQuery,
    filters: reduxFilters, // From Redux
}), [unsavedChartVersion.metricQuery, reduxFilters]);
```

### Query State Management
```typescript
// Context prepares args, TanStack reacts
const runQuery = () => {
    const args = buildQueryArgs(state);
    setValidQueryArgs(args); // Triggers TanStack
};
```

## Migration Impact Analysis

### High Impact Components (Most Context Dependencies)
1. **VisualizationCard** - 17 dependencies
2. **ExplorePanel** - 10 dependencies
3. **Explorer (main)** - Orchestrates everything
4. **ResultsCard** - Query results + export

### Low Impact Components (Few Dependencies)
1. **RefreshButton** - 7 dependencies, mostly query
2. **SqlCard** - 1 dependency
3. **SaveChartButton** - 4 dependencies

### Query-Only Dependencies (3 Components Remaining)
These only need query/queryResults. Most have been migrated:
- ✅ RefreshButton - MIGRATED to `useExplorerQuery` hook
- ✅ useColumns - MIGRATED to `useExplorerQuery` hook
- ✅ ResultsCard - MIGRATED to `useExplorerQuery` hook
- ✅ VisualizationCard - MIGRATED to `useExplorerQuery` hook
- ✅ ExplorerResults - MIGRATED to `useExplorerQuery` hook
- ❌ ExplorerHeader - Still using Context
- ✅ FiltersCard (for suggestions) - MIGRATED to `useExplorerQuery` hook
- ❌ useCompiledSql - Still using Context
- ❌ MinimalSavedExplorer - Still using Context
- ✅ CustomMetricModal/hooks - MIGRATED to `useExplorerQuery` hook

## Next Steps

1. ✅ ~~Extract query state to `useExplorerQuery` hook~~ **COMPLETE**
2. ✅ ~~Migrate query-dependent components to use new hook~~ **COMPLETE (7/10)**
3. ⚠️ Remove query state from Context - **IN PROGRESS** (query state removed from Context type, actions cleaned up)
4. Continue migrating remaining Context state to Redux
5. Eliminate remaining double dispatch patterns
6. Migrate remaining 3 query-dependent components (ExplorerHeader, useCompiledSql, MinimalSavedExplorer)