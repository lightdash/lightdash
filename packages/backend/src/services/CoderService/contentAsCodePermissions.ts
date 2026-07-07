import {
    isCustomSqlDimension,
    isSqlTableCalculation,
    type ChartAsCode,
    type CustomDimension,
    type TableCalculation,
} from '@lightdash/common';

export type ContentAsCodeSqlPermissionCheck =
    | 'customSqlDimension'
    | 'sqlTableCalculation';

export type ContentAsCodeSqlPermissionCheckResult = {
    check: ContentAsCodeSqlPermissionCheck;
    message: string;
};

type CurrentChartSqlItems = {
    metricQuery: {
        customDimensions?: CustomDimension[];
        tableCalculations?: TableCalculation[];
    };
};

export const getChartContentAsCodePermissionChecks = (
    nextChart: ChartAsCode,
    currentChart?: CurrentChartSqlItems,
): ContentAsCodeSqlPermissionCheckResult[] => {
    const checks: ContentAsCodeSqlPermissionCheckResult[] = [];
    const currentMetricQuery = currentChart?.metricQuery;

    const currentSqlDimensionsById = new Map(
        (currentMetricQuery?.customDimensions ?? [])
            .filter(isCustomSqlDimension)
            .map((dimension) => [dimension.id, dimension]),
    );
    const hasNewOrChangedSqlDimension = (
        nextChart.metricQuery.customDimensions ?? []
    )
        .filter(isCustomSqlDimension)
        .some((dimension) => {
            const current = currentSqlDimensionsById.get(dimension.id);
            return !current || current.sql !== dimension.sql;
        });

    if (hasNewOrChangedSqlDimension) {
        checks.push({
            check: 'customSqlDimension',
            message:
                'User cannot upload content with new or modified custom SQL dimensions',
        });
    }

    const currentSqlTableCalculationsByName = new Map(
        (currentMetricQuery?.tableCalculations ?? [])
            .filter(isSqlTableCalculation)
            .map((calculation) => [calculation.name, calculation]),
    );
    const hasNewOrChangedSqlTableCalculation = (
        nextChart.metricQuery.tableCalculations ?? []
    )
        .filter(isSqlTableCalculation)
        .some((calculation) => {
            const current = currentSqlTableCalculationsByName.get(
                calculation.name,
            );
            return !current || current.sql !== calculation.sql;
        });

    if (hasNewOrChangedSqlTableCalculation) {
        checks.push({
            check: 'sqlTableCalculation',
            message:
                'User cannot upload content with new or modified SQL table calculations',
        });
    }

    return checks;
};
