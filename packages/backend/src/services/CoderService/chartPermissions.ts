import {
    type ChartAsCode,
    type CustomDimension,
    type SavedMergeDefinition,
    type TableCalculation,
} from '@lightdash/common';
import {
    getChangedCustomSqlDimensionIds,
    getChangedSqlTableCalculationNames,
    getMergeSourcePairs,
    getMergeSqlTableCalculations,
} from '../SavedChartsService/chartSqlChanges';

export type ContentAsCodeSqlPermissionCheckResult = {
    check: 'customSqlDimension' | 'sqlTableCalculation';
    message: string;
};

export type CurrentChartSqlItems = {
    metricQuery: {
        customDimensions?: CustomDimension[];
        tableCalculations?: TableCalculation[];
    };
    merge?: SavedMergeDefinition | null;
};

/** A chart upload whose merge, if any, is already normalized. */
export type ChartAsCodeSqlItems = Pick<ChartAsCode, 'slug' | 'metricQuery'> & {
    merge?: SavedMergeDefinition | null;
};

export const getChartContentAsCodePermissionChecks = (
    nextChart: ChartAsCodeSqlItems,
    currentChart?: CurrentChartSqlItems,
): ContentAsCodeSqlPermissionCheckResult[] => {
    const checks: ContentAsCodeSqlPermissionCheckResult[] = [];
    const currentMetricQuery = currentChart?.metricQuery;
    const nextMerge = nextChart.merge ?? null;
    // Each merge source is held to the chart's own rules; its items are named `source.item`
    const mergeSources = nextMerge
        ? getMergeSourcePairs(nextMerge, currentChart?.merge ?? null)
        : [];

    const changedDimensions = [
        ...getChangedCustomSqlDimensionIds(
            nextChart.metricQuery.customDimensions,
            currentMetricQuery?.customDimensions,
        ),
        ...mergeSources.flatMap((source) =>
            getChangedCustomSqlDimensionIds(
                source.next.customDimensions,
                source.saved?.customDimensions,
            ).map((id) => `${source.name}.${id}`),
        ),
    ];
    if (changedDimensions.length > 0) {
        checks.push({
            check: 'customSqlDimension',
            message: `User cannot upload content with new or modified custom SQL dimensions: ${changedDimensions.join(
                ', ',
            )} (chart slug "${nextChart.slug}")`,
        });
    }

    const changedCalculations = [
        ...getChangedSqlTableCalculationNames(
            nextChart.metricQuery.tableCalculations,
            currentMetricQuery?.tableCalculations,
        ),
        ...mergeSources.flatMap((source) =>
            getChangedSqlTableCalculationNames(
                source.next.tableCalculations,
                source.saved?.tableCalculations,
            ).map((name) => `${source.name}.${name}`),
        ),
        ...getChangedSqlTableCalculationNames(
            getMergeSqlTableCalculations(nextMerge),
            getMergeSqlTableCalculations(currentChart?.merge ?? null),
        ),
    ];
    if (changedCalculations.length > 0) {
        checks.push({
            check: 'sqlTableCalculation',
            message: `User cannot upload content with new or modified SQL table calculations: ${changedCalculations.join(
                ', ',
            )} (chart slug "${nextChart.slug}")`,
        });
    }
    return checks;
};
