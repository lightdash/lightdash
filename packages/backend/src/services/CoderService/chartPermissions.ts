import {
    isCustomSqlDimension,
    isSqlTableCalculation,
    type AdditionalMetric,
    type ChartAsCode,
    type CustomDimension,
    type TableCalculation,
} from '@lightdash/common';
import { getCustomMetricSqlPermissionMessage } from '../ProjectService/customMetricSqlPermission';

export type ContentAsCodeSqlPermissionCheckResult = {
    check: 'customSqlDimension' | 'sqlTableCalculation' | 'customMetricSql';
    message: string;
};

export type CurrentChartSqlItems = {
    metricQuery: {
        customDimensions?: CustomDimension[];
        tableCalculations?: TableCalculation[];
    };
};

export const getChartContentAsCodePermissionChecks = (
    nextChart: ChartAsCode,
    currentChart: CurrentChartSqlItems | null,
    customMetricsNeedingPermission: AdditionalMetric[],
): ContentAsCodeSqlPermissionCheckResult[] => {
    const checks: ContentAsCodeSqlPermissionCheckResult[] = [];
    const currentMetricQuery = currentChart?.metricQuery;
    const currentSqlDimensionsById = new Map(
        (currentMetricQuery?.customDimensions ?? [])
            .filter(isCustomSqlDimension)
            .map((dimension) => [dimension.id, dimension]),
    );
    const changedDimensions = (nextChart.metricQuery.customDimensions ?? [])
        .filter(isCustomSqlDimension)
        .filter((dimension) => {
            const current = currentSqlDimensionsById.get(dimension.id);
            return !current || current.sql !== dimension.sql;
        })
        .map(({ id }) => id);
    if (changedDimensions.length > 0) {
        checks.push({
            check: 'customSqlDimension',
            message: `User cannot upload content with new or modified custom SQL dimensions: ${changedDimensions.join(
                ', ',
            )} (chart slug "${nextChart.slug}")`,
        });
    }

    const currentCalculationsByName = new Map(
        (currentMetricQuery?.tableCalculations ?? [])
            .filter(isSqlTableCalculation)
            .map((calculation) => [calculation.name, calculation]),
    );
    const changedCalculations = (nextChart.metricQuery.tableCalculations ?? [])
        .filter(isSqlTableCalculation)
        .filter((calculation) => {
            const current = currentCalculationsByName.get(calculation.name);
            return !current || current.sql !== calculation.sql;
        })
        .map(({ name }) => name);
    if (changedCalculations.length > 0) {
        checks.push({
            check: 'sqlTableCalculation',
            message: `User cannot upload content with new or modified SQL table calculations: ${changedCalculations.join(
                ', ',
            )} (chart slug "${nextChart.slug}")`,
        });
    }

    if (customMetricsNeedingPermission.length > 0) {
        checks.push({
            check: 'customMetricSql',
            message: `${getCustomMetricSqlPermissionMessage(customMetricsNeedingPermission)} (chart slug "${nextChart.slug}")`,
        });
    }
    return checks;
};
