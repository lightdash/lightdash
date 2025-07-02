import {
    AiChartType,
    AiMetricQuery,
    metricQueryTableViz,
    TableVizTool,
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
        metricQuery: AiMetricQuery,
    ) => ReturnType<InstanceType<typeof ProjectService>['runMetricQuery']>;
    vizTool: Pick<TableVizTool, 'vizConfig' | 'filters'>;
    maxLimit: number;
}): Promise<{
    type: AiChartType.TABLE;
    metricQuery: AiMetricQuery;
    results: Awaited<
        ReturnType<InstanceType<typeof ProjectService>['runMetricQuery']>
    >;
    csv: string;
}> => {
    const query = metricQueryTableViz(vizTool, maxLimit);
    const results = await runMetricQuery(query);

    const fields = results.rows[0] ? Object.keys(results.rows[0]) : [];
    const rows = results.rows.map((row) =>
        CsvService.convertRowToCsv(row, results.fields, true, fields),
    );

    return {
        type: AiChartType.TABLE,
        metricQuery: query,
        results,
        csv: stringify(rows, { header: true, columns: fields }),
    };
};
