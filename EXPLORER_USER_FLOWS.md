# Explorer User Flows Documentation

This document describes the critical user interactions and data flows in the Explorer, documenting how state changes propagate through the system.

## ✅ Flow Verification (Last verified: Query Execution Migration PR)

**Status**: All 7 critical flows verified and working after migrating query execution from Context to Redux + hooks.

**Verification Date**: Current PR
**Changes**: Query state migrated from Context to `useExplorerQuery` hook with split-hook pattern
**Result**: ✅ All flows preserved, no breaking changes

| Flow | Status | Implementation |
|------|--------|----------------|
| 1. Parameter Change with Auto-sync | ✅ Working | `useExplorerQueryManager.ts:272-290` |
| 2. Dimension Selection | ✅ Working | `useExplorerQueryManager.ts:108-114, 266-269` |
| 3. Core Query Execution | ✅ Working | `useExplorerQueryManager.ts:184-243` |
| 4. Pivot Detection & Dual Queries | ✅ Working | `useExplorerQueryManager.ts:130-144, 246-263` |
| 5. Filter Changes | ✅ Working | `useExplorerQueryManager.ts:99-105` |
| 6. Manual Refresh | ✅ Working | `useExplorerQuery.ts:239-251` |
| 7. Download/Export | ✅ Working | `useExplorerQuery.ts:254-284` |

## 1. Parameter Change with Auto-sync Enabled

### User Action: Changes a parameter value

```mermaid
graph TD
    A[User types in ParametersCard] --> B[setParameter action]
    B --> C[Context dispatch SET_PARAMETER]
    B --> D[Redux dispatch setParameter]
    C --> E[Update unsavedChartVersion.parameters]
    E --> F[parametersChanged computed]
    F --> G{Auto-fetch enabled?}
    G -->|Yes| H[useEffect triggers runQuery]
    H --> I[Build validQueryArgs with new params]
    I --> J[setValidQueryArgs]
    J --> K[TanStack Query reacts]
    K --> L[New query executed]
    L --> M[Results update in components]
```

### Key Code Locations:
- `ParametersCard.tsx:72-75` - Parameter change handler
- `ExplorerProvider.tsx:1094-1110` - setParameter action
- `ExplorerProvider.tsx:1720-1724` - Auto-fetch effect
- `ExplorerProvider.tsx:1606-1674` - runQuery implementation

## 2. Dimension Selection Flow

### User Action: Toggles a dimension in ExplorePanel

```mermaid
graph TD
    A[User clicks dimension] --> B[toggleActiveField]
    B --> C[Context dispatch TOGGLE_DIMENSION]
    C --> D[Update dimensions array]
    D --> E[Remove sorts for toggled field]
    D --> F[Recalculate column order]
    F --> G[activeFields recomputed]
    G --> H[isValidQuery recomputed]
    H --> I{Valid & Auto-fetch?}
    I -->|Yes| J[runQuery triggered]
    J --> K[Query executes]
    K --> L[Results table updates]
    L --> M[New column appears/disappears]
```

### Key Code Locations:
- `ExplorePanel/index.tsx:96-98` - toggleActiveField usage
- `ExplorerProvider.tsx:217-243` - TOGGLE_DIMENSION reducer
- `ExplorerProvider.tsx:953-964` - activeFields computation
- `ExplorerProvider.tsx:82-107` - calcColumnOrder function

## 3. Configure Button Display Logic

### Condition: Show/hide visualization configuration button

```mermaid
graph TD
    A[Page loads] --> B{isEditMode?}
    B -->|true| C[Show Configure button]
    B -->|false| D[Hide Configure button]
    C --> E[User clicks Configure]
    E --> F[openVisualizationConfig]
    F --> G[Redux: isVisualizationConfigOpen = true]
    G --> H[Config panel slides in]
    H --> I[ExplorePanel hidden]
    I --> J[VisualizationCard shows config]
```

### State Dependencies:
- `isEditMode` (Redux) - Determines button visibility
- `isVisualizationConfigOpen` (Redux) - Controls panel state
- Components affected: VisualizationCard, ExplorePanel

### Key Code Locations:
- `VisualizationCard.tsx:96-100` - Selectors for edit mode and config state
- `explorerSlice.ts:103-108` - Config open/close actions

## 4. Query Execution Flow (Core)

### Trigger: Any state change that requires new results

```mermaid
graph TD
    A[State Change] --> B[runQuery called]
    B --> C{Has table & fields?}
    C -->|No| D[Console warning]
    C -->|Yes| E[Build metricQuery]
    E --> F[Add Redux filters]
    F --> G[Check pivot config]
    G --> H[Create validQueryArgs]
    H --> I[setValidQueryArgs]
    I --> J[useQueryManager hook reacts]
    J --> K[TanStack: cancel old query]
    K --> L[TanStack: start new query]
    L --> M[Loading states update]
    M --> N[Query completes]
    N --> O[queryResults available]
    O --> P[Components re-render]
```

### Detailed Flow:
1. **State aggregation** (1606-1614): Gather all query inputs
2. **Pivot calculation** (1621-1630): Determine if pivoting needed
3. **Args preparation** (1633-1643): Build QueryResultsProps
4. **State update** (1646): Set validQueryArgs
5. **TanStack reaction**: useQueryManager watches validQueryArgs
6. **Results propagation**: Components access via context

### Key Code Locations:
- `ExplorerProvider.tsx:1606-1674` - runQuery implementation
- `useExplorerQueryManager.ts:8-31` - Query manager hook
- `ExplorerProvider.tsx:1495-1500` - Main query manager setup

## 5. Results Display with Pivot Detection

### Scenario: Chart is pivoted, results table needs unpivoted data

```mermaid
graph TD
    A[Query executes] --> B{useSqlPivotResults enabled?}
    B -->|No| C[Single query for all]
    B -->|Yes| D[Check needsUnpivotedData]
    D --> E{Chart pivoted?}
    E -->|No| F[Single query]
    E -->|Yes| G[Set unpivotedQueryArgs]
    G --> H[Two parallel queries]
    H --> I[Pivoted for chart]
    H --> J[Unpivoted for table]
    I --> K[VisualizationCard renders]
    J --> L[ResultsCard renders]
```

### Key Code Locations:
- `ExplorerProvider.tsx:1783-1804` - needsUnpivotedData computation
- `ExplorerProvider.tsx:1876-1894` - Unpivoted args effect
- `ExplorerProvider.tsx:1702-1710` - Unpivoted query manager

## 6. Filter Changes Flow

### User Action: Adds/modifies a filter

```mermaid
graph TD
    A[User adds filter] --> B[FiltersCard]
    B --> C[setFilters action]
    C --> D[Redux dispatch]
    C --> E[Context dispatch]
    D --> F[Redux filters update]
    E --> G[Context sync]
    F --> H[computedMetricQuery recalc]
    H --> I[Includes Redux filters]
    I --> J[runQuery triggered]
    J --> K[New results]
```

### Synchronization Pattern:
- Double dispatch ensures compatibility during migration
- Redux filters merged into Context metricQuery
- Single source of truth (Redux) with Context bridge

### Key Code Locations:
- `FiltersCard.tsx:239-241` - setFilters call
- `ExplorerProvider.tsx:945-951` - computedMetricQuery
- `ExplorerProvider.tsx:1085-1091` - setFilters action

## 7. Manual Refresh Flow

### User Action: Clicks refresh button

```mermaid
graph TD
    A[User clicks Refresh] --> B[fetchResults action]
    B --> C[resetQueryResults]
    C --> D[Clear validQueryArgs]
    C --> E[Clear query history]
    C --> F[Cancel pending queries]
    D --> G[runQuery]
    G --> H[Build fresh args]
    H --> I[Force cache invalidation]
    I --> J[New query starts]
    J --> K[Loading spinner]
    K --> L[Results update]
```

### Key Code Locations:
- `RefreshButton.tsx` - Trigger point
- `ExplorerProvider.tsx:1778-1782` - fetchResults implementation
- `ExplorerProvider.tsx:1752-1761` - resetQueryResults

## 8. Download/Export Flow

### User Action: Exports results to CSV/Sheets

```mermaid
graph TD
    A[User clicks Download] --> B[getDownloadQueryUuid]
    B --> C{Limit specified?}
    C -->|Current limit OK| D[Use existing queryUuid]
    C -->|Need different limit| E[Create new query]
    E --> F[Build args with csvLimit]
    F --> G[executeQueryAndWaitForResults]
    G --> H[Wait for completion]
    H --> I[Return queryUuid]
    I --> J[Download endpoint called]
    J --> K[File downloaded]
```

### Key Code Locations:
- `ResultsCard.tsx` - Download menu
- `ExplorerProvider.tsx:1715-1749` - getDownloadQueryUuid
- `VisualizationCard.tsx` - Chart download menu

## 9. Column Ordering Logic

### Trigger: Fields added/removed

```mermaid
graph TD
    A[Field toggled] --> B[calcColumnOrder]
    B --> C[Filter valid columns]
    C --> D[Find missing columns]
    D --> E{Dimension change?}
    E -->|Yes| F[Insert after last dimension]
    E -->|No| G[Append to end]
    F --> H[Update columnOrder]
    G --> H
    H --> I[ResultsCard re-renders]
    I --> J[Columns reordered]
```

### Key Code Locations:
- `ExplorerProvider.tsx:82-107` - calcColumnOrder function
- Used in: TOGGLE_DIMENSION, TOGGLE_METRIC, ADD_TABLE_CALCULATION

## 10. Auto-fetch Control Flow

### Setting: Auto-fetch enabled/disabled

```mermaid
graph TD
    A[Component mounts] --> B[Check localStorage]
    B --> C{Auto-fetch enabled?}
    C -->|Yes| D[Set up auto-effects]
    C -->|No| E[Wait for manual trigger]
    D --> F[Watch state changes]
    F --> G[Automatic runQuery]
    E --> H[User clicks refresh]
    H --> I[Manual runQuery]
```

### Key Code Locations:
- `ExplorerProvider.tsx:881-885` - Auto-fetch localStorage
- `ExplorerProvider.tsx:1896-1900` - Auto-fetch effect
- `RunQuerySettings/defaults.ts` - Default settings

## State Change Triggers

### Actions that trigger query re-execution:
1. **Dimension/Metric toggle** - Changes query fields
2. **Filter modification** - Changes query filters
3. **Parameter change** - Changes query parameters
4. **Sort change** - Changes result ordering
5. **Limit change** - Changes row count
6. **Table change** - Changes data source
7. **Manual refresh** - Forces re-execution

### Actions that DON'T trigger queries:
1. **Column reorder** - Visual only
2. **Chart type change** - Visualization only
3. **Expand/collapse sections** - UI only
4. **Open/close config** - UI only
5. **Format changes** - Display only

## Critical State Dependencies

### Query Execution Requirements:
```typescript
// Must have ALL of:
- validTableName
- hasFields (dimensions || metrics || tableCalculations)
- projectUuid
- No missing required parameters
```

### Computed State Chain:
```
Redux filters -> computedMetricQuery -> validQueryArgs -> TanStack Query -> Results
                     ^                        ^
                     |                        |
            Context metricQuery        Parameters/Config
```

## Migration Considerations

When migrating query state, these flows must continue working:
1. ✅ Auto-fetch on state changes
2. ✅ Parameter validation before execution
3. ✅ Proper loading/error states
4. ✅ Query cancellation
5. ✅ Dual query for pivot scenarios
6. ✅ Export with custom limits
7. ✅ Column order preservation
8. ✅ Filter/sort integration