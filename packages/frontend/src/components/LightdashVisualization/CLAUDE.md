# Visualization System

This directory contains the core visualization framework for Lightdash charts. All chart types follow a consistent architecture pattern.

## Architecture: Adding a New Chart Type

Each chart type requires changes across these layers:

### 1. Common Package Types (`packages/common/src/types/savedCharts.ts`)

-   Add value to `ChartKind` enum (UI display) and `ChartType` enum (storage/API)
-   Define a config type (e.g., `SankeyChart`) and a config wrapper (e.g., `SankeyChartConfig`)
-   Add to the `ChartConfig` union type
-   Update `getChartType()` and `getChartKind()` switch statements

### 2. Database Migration (`packages/backend/src/database/migrations/`)

-   Create a migration to insert the new chart type into the `chart_types` table
-   Pattern: `await knex('chart_types').insert({ chart_type: 'sankey' });`
-   The `saved_queries_versions` table has a foreign key constraint on `chart_type`

### 3. Frontend Visualization Config Type (`types.ts` in this directory)

-   Define `VisualizationConfigXxxType` with `chartType`, `chartConfig`, and field maps
-   Create `isXxxVisualizationConfig()` type guard
-   Add to the `VisualizationConfig` union

### 4. Frontend Config Hook (`packages/frontend/src/hooks/useXxxChartConfig.ts`)

-   Manages chart state (field selections, display options)
-   Auto-selects fields when data first loads
-   Transforms result rows into chart-specific data format
-   Returns `validConfig`, field change handlers, and transformed data

### 5. Frontend ECharts Hook (`packages/frontend/src/hooks/echarts/useEchartsXxxConfig.ts`)

-   Reads from visualization context via `useVisualizationContext()`
-   Transforms chart config into `EChartsOption`
-   Configures tooltip, labels, colors, styling

### 6. Frontend Visualization Component (`packages/frontend/src/components/SimpleXxx/index.tsx`)

-   Renders `EChartsReact` with the ECharts option from the hook
-   Handles loading state, empty state, resize events
-   Signals screenshot readiness for exports
-   Uses `$shouldExpand` prop for dashboard vs explore sizing

### 7. Frontend Config Panel (`packages/frontend/src/components/VisualizationConfigs/XxxConfig/`)

-   Config panel UI with tabs (General, Display)
-   Uses `FieldSelect` for dimension/metric pickers
-   Uses `SegmentedControl` for display options

### 8. Frontend Config Provider (`VisualizationConfigXxx.tsx` in this directory)

-   Extracts dimensions and numeric fields from `itemsMap`
-   Calls the config hook and propagates changes via `onChartConfigChange`

### 9. Wiring (switch statements that need new cases)

Files with `assertUnreachable` on `ChartType` or `ChartKind` that **must** be updated:

-   `VisualizationProvider.tsx` - Config provider switch
-   `index.tsx` (this directory) - Rendering switch
-   `Explorer/VisualizationCardOptions/index.tsx` - Chart type menu
-   `Explorer/VisualizationCard/VisualizationConfig.tsx` - Config tabs
-   `common/ResourceIcon/utils.ts` - Chart icon
-   `common/ResourceView/resourceUtils.ts` - Chart display name
-   `packages/common/src/types/savedCharts.ts` - `getChartType()` / `getChartKind()`
-   `packages/common/src/pivot/derivePivotConfigFromChart.ts` - Pivot config
-   `packages/frontend/src/providers/Explorer/types.ts` - `ConfigCacheMap`
-   `packages/frontend/src/providers/Explorer/utils.ts` - `DEFAULTS` map
-   `packages/backend/src/services/RenameService/rename.ts` - Field rename

## Sankey Chart Type

The Sankey chart (`ChartType.SANKEY`) visualizes flows between nodes using a source/target/weight data model.

### Data Model

Users select three fields in the config panel:

-   **Source** (dimension): The origin node of each flow
-   **Target** (dimension): The destination node of each flow
-   **Value** (metric): The weight/size of the flow

No special dbt configuration or column naming is required. Any two dimensions and one numeric metric work. Multi-level flows happen naturally when a node value appears in both the source and target columns (e.g., "Engagement" is a target of "Start" and a source of "Conversion").

### BFS Depth Assignment (Cyclical Flow Support)

ECharts doesn't natively support cyclical Sankey data. The `useSankeyChartConfig` hook implements a BFS-based algorithm to handle cycles:

1. **Aggregate** raw rows into source-target links with summed values
2. **Build adjacency list** from aggregated links
3. **Find root nodes** (sources that never appear as targets)
4. **BFS traversal** from roots, assigning depth levels to each node
    - Each original edge is placed **only once** (`placedOriginalEdges` set) to prevent infinite cycle expansion
    - Nodes appearing at multiple depths get step suffixes (e.g., "Conversion - Step 3")
5. **Build final nodes/links** with depth-specific node instances

The `maxDepth` value is returned alongside nodes/links for per-depth-level coloring.

### ECharts Configuration

-   **Levels**: Each depth gets a color from the palette via the `levels` array
-   **Labels**: Step suffixes (` - Step N`) are stripped for display using `stripStepSuffix()`
-   **Orientation-aware layout**: Padding and label positions adapt to horizontal/vertical
    -   Horizontal: labels on `right`, right padding `14%`
    -   Vertical: labels on `bottom`, bottom padding `14%`
-   **Node alignment labels**: Display "Left/Right/Justify" in horizontal, "Top/Bottom/Justify" in vertical

### Key Files

| File                                                        | Purpose                            |
| ----------------------------------------------------------- | ---------------------------------- |
| `packages/common/src/types/savedCharts.ts`                  | `SankeyChart` type, enum values    |
| `packages/frontend/src/hooks/useSankeyChartConfig.ts`       | Config state + BFS data transform  |
| `packages/frontend/src/hooks/echarts/useEchartsSankeyConfig.ts` | ECharts option builder         |
| `packages/frontend/src/components/SimpleSankey/index.tsx`   | Visualization component            |
| `packages/frontend/src/components/VisualizationConfigs/SankeyConfig/SankeyConfigTabs.tsx` | Config panel UI |
| `packages/frontend/src/components/LightdashVisualization/VisualizationConfigSankey.tsx` | Config provider |

### Test Data

The `sankey_demo` model in `examples/full-jaffle-shop-demo/dbt/` provides a marketing funnel dataset with cyclical paths (Retargeting feeds back into Conversion and Engagement). Use this to test multi-level and cyclical Sankey rendering.
