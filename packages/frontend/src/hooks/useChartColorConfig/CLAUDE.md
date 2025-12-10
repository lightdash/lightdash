<summary>
Provides consistent color assignment for chart series across dashboards.

When multiple charts display the same data series (e.g., "pending" orders), this module ensures they share the same color. Colors are assigned deterministically using a hash of the series identifier, persisting across page reloads.

</summary>

<howToUse>
Use `useChartColorConfig` hook to get color assignment functions:

-   `calculateSeriesColorAssignment(series)` - Get color for a single series
-   `registerSeriesForColorAssignment(series[])` - Pre-register multiple series (populates cache)
-   `calculateKeyColorAssignment(group, identifier)` - Low-level color lookup

The `ChartColorMappingContextProvider` must wrap your app (already done in App.tsx).
</howToUse>

<codeExample>

```tsx
import { useChartColorConfig } from './useChartColorConfig';

const MyChart = ({ series, colorPalette }) => {
    const { calculateSeriesColorAssignment, registerSeriesForColorAssignment } =
        useChartColorConfig({ colorPalette });

    // Pre-register all series (populates cache for performance)
    useEffect(() => {
        registerSeriesForColorAssignment(series);
    }, [series, registerSeriesForColorAssignment]);

    // Get color for each series
    const colors = series.map((s) => calculateSeriesColorAssignment(s));
};
```

</codeExample>

<importantToKnow>
**Color Priority** (in VisualizationProvider):

1. Explicit `series.color` (user-set)
2. Metadata colors (saved in chart config)
3. Dimension colors (from dbt model)
4. Calculated colors (this module, when feature flag ON)
5. Fallback colors (position-based, when flag OFF)

**Feature Flag**: `CalculateSeriesColor` controls whether calculated colors are used. When OFF, falls back to position-based `fallbackColors`.

**Hash-Based Assignment**: Colors are assigned using djb2 hash of the identifier, ensuring the same identifier always maps to the same color index. This provides determinism across page reloads and regardless of what other series exist.

**Per-Chart Collision Handling**: When two series in the same chart hash to the same color index, linear probing finds the next available color. This ensures no two series within a chart share the same color.

**Collision Resolution Trade-off**:
-   Non-colliding series: Always get the same color (hash-based, deterministic)
-   Colliding series: May get different colors on reload (depends on registration order)
-   Cross-chart consistency: Same identifier always gets the same color once registered in the Map

**Map Structure**: `Map<group, Map<identifier, colorIndex>>` used as a cache. The color index is computed via hash (with collision handling), stored in Map for cross-chart consistency.

**Series Identifier Structure**: `calculateSeriesLikeIdentifier(series)` returns `[groupKey, identifier]`:

-   Ungrouped series: `["$ungrouped", "orders_count"]` - all ungrouped metrics share one group
-   Grouped series: `["orders_status", "pending"]` (field + pivot value)
-   Used as `groupKey|identifier` for fallback lookup, or passed to Map for calculated colors

**Flipped Axis Edge Case**: When axis is flipped, ECharts includes pivot value in the field identifier (e.g., `orders_status.pending`). The code strips this to maintain consistent `basefield→pivot_value` mapping.

**Multi-Pivot Grouping**: When multiple pivot values exist, a suffix `_n{count}` is added to the group key. This creates separate color scopes for different pivot configurations.
</importantToKnow>

<links>
- @packages/frontend/src/components/LightdashVisualization/VisualizationProvider.tsx - Main consumer
- @packages/frontend/src/hooks/useChartColorConfig/utils.ts - Series identifier calculation
- https://github.com/lightdash/lightdash/issues/13831 - Original color consistency issue
- https://github.com/lightdash/lightdash/issues/14468 - Cross-chart color matching
</links>
