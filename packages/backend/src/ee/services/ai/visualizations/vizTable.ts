import {
    AiMetricQueryWithFilters,
    AiResultType,
    metricQueryTableViz,
    ToolTableVizArgsTransformed,
} from '@lightdash/common';
import { stringify } from 'csv-stringify/sync';
import { CsvService } from '../../../../services/CsvService/CsvService';
import { ProjectService } from '../../../../services/ProjectService/ProjectService';

export const renderTableViz = async ({
    runMetricQuery,
    vizTool,
    maxLimit,
}: {
    runMetricQuery: (
        metricQuery: AiMetricQueryWithFilters,
    ) => ReturnType<InstanceType<typeof ProjectService>['runMetricQuery']>;
    vizTool: ToolTableVizArgsTransformed;
    maxLimit: number;
}): Promise<{
    type: AiResultType.TABLE_RESULT;
    metricQuery: AiMetricQueryWithFilters;
    results: Awaited<
        ReturnType<InstanceType<typeof ProjectService>['runMetricQuery']>
    >;
    csv: string;
}> => {
    const query = metricQueryTableViz(
        vizTool.vizConfig,
        vizTool.filters,
        maxLimit,
    );
    const results = await runMetricQuery(query);

    const fields = results.rows[0] ? Object.keys(results.rows[0]) : [];
    const rows = results.rows.map((row) =>
        CsvService.convertRowToCsv(row, results.fields, true, fields),
    );

    return {
        type: AiResultType.TABLE_RESULT,
        metricQuery: query,
        results,
        csv: stringify(rows, { header: true, columns: fields }),
    };
};
