import {
    QueryExecutionContext,
    derivePivotConfigurationFromChart,
    type ChartConfig,
    type ItemsMap,
    type MergeQuery,
    type MetricQuery,
    type ParametersValuesMap,
} from '@lightdash/common';
import { type LightdashApi } from '../../../../api';
import { executeMergeQuery } from '../../../../features/mergeQuery/hooks/useMergeQuery';
import { executeQueryAndWaitForResults } from '../../../../hooks/useQueryResults';

type ExecuteAiChartDownloadQueryArgs = {
    projectUuid: string;
    metricQuery: MetricQuery;
    parameters: ParametersValuesMap | undefined;
    chartConfig: ChartConfig;
    pivotDimensions: string[] | undefined;
    fields: ItemsMap;
    mergeQuery: MergeQuery | null;
    limit: number | null;
    exportPivotedData: boolean;
};

export const executeAiChartDownloadQuery = async (
    lightdashApi: LightdashApi,
    {
        projectUuid,
        metricQuery,
        parameters,
        chartConfig,
        pivotDimensions,
        fields,
        mergeQuery,
        limit,
        exportPivotedData,
    }: ExecuteAiChartDownloadQueryArgs,
): Promise<string> => {
    const pivotConfig = pivotDimensions?.length
        ? { columns: pivotDimensions }
        : undefined;

    if (mergeQuery) {
        const result = await executeMergeQuery(
            lightdashApi,
            projectUuid,
            mergeQuery,
            parameters,
            exportPivotedData ? { chartConfig, pivotConfig } : undefined,
            limit,
        );

        if (result.outcome === 'refused') {
            throw new Error(
                result.errors.map((error) => error.message).join(' '),
            );
        }

        return result.query.queryUuid;
    }

    const result = await executeQueryAndWaitForResults(lightdashApi, {
        projectUuid,
        tableId: metricQuery.exploreName,
        query: metricQuery,
        csvLimit: limit,
        context: QueryExecutionContext.AI,
        parameters,
        pivotConfiguration: exportPivotedData
            ? derivePivotConfigurationFromChart(
                  { chartConfig, pivotConfig },
                  metricQuery,
                  fields,
              )
            : undefined,
    });

    return result.queryUuid;
};
