import { FeatureFlags } from '@lightdash/common';
import {
    selectChartConfig,
    selectPivotConfig,
    useExplorerSelector,
} from '../../../features/explorer/store';
import { useExplorerQuery } from '../../../hooks/useExplorerQuery';
import { useServerFeatureFlag } from '../../../hooks/useServerOrClientFeatureFlag';
import useApp from '../../../providers/App/useApp';

/**
 * Hook to determine if grouped results view is available and enabled.
 * Centralizes the logic for checking:
 * - Backend SQL pivot feature flag
 * - Whether pivot columns are configured
 * - Whether the visualization type supports grouping (not table viz)
 * - Whether the pivot column limit has been exceeded
 */
export function useGroupedResultsAvailability() {
    const { health } = useApp();
    const { data: useSqlPivotResults } = useServerFeatureFlag(
        FeatureFlags.UseSqlPivotResults,
    );
    const pivotConfig = useExplorerSelector(selectPivotConfig);
    const chartConfig = useExplorerSelector(selectChartConfig);
    const { queryResults } = useExplorerQuery();

    const isSqlPivotEnabled = !!useSqlPivotResults?.enabled;
    const hasPivotColumns = !!pivotConfig?.columns?.length;
    const isTableViz = chartConfig.type === 'table';
    const hasNoResults = queryResults.rows.length === 0;

    // Check if pivot column limit is exceeded
    const maxColumnLimit = health.data?.pivotTable?.maxColumnLimit;
    const totalColumnCount = queryResults.pivotDetails?.totalColumnCount;
    const exceedsColumnLimit =
        maxColumnLimit !== undefined &&
        totalColumnCount !== undefined &&
        totalColumnCount !== null &&
        totalColumnCount > maxColumnLimit;

    // Grouped view is disabled when there's no pivot config, when viewing as table,
    // when the column limit is exceeded, or when there are no results
    const isGroupedDisabled =
        !hasPivotColumns || isTableViz || exceedsColumnLimit || hasNoResults;

    // Can show grouped results when SQL pivot is enabled AND we have pivot columns
    const canShowGroupedResults = isSqlPivotEnabled && hasPivotColumns;

    return {
        /** Whether the SQL pivot feature flag is enabled */
        isSqlPivotEnabled,
        /** Whether there are pivot columns configured */
        hasPivotColumns,
        /** Whether the query returned no results */
        hasNoResults,
        /** Whether the current visualization is a table (which doesn't support grouped view) */
        isTableViz,
        /** Whether the pivot column limit has been exceeded */
        exceedsColumnLimit,
        /** Maximum number of pivot columns allowed */
        maxColumnLimit,
        /** Whether the grouped option should be disabled in the UI */
        isGroupedDisabled,
        /** Whether grouped results can be shown (feature enabled + has pivot config) */
        canShowGroupedResults,
        /** The current pivot configuration */
        pivotConfig,
    };
}
