import {
    AiChartType,
    AiMetricQuery,
    filtersSchema,
    filtersSchemaTransformed,
    FollowUpTools,
    tableVizConfigSchema,
} from '@lightdash/common';
import { stringify } from 'csv-stringify/sync';
import { z } from 'zod';
import { CsvService } from '../../../../services/CsvService/CsvService';
import { ProjectService } from '../../../../services/ProjectService/ProjectService';
import { getValidAiQueryLimit } from '../utils/validators';

export const tableVizToolSchema = z.object({
    type: z.literal(AiChartType.TABLE),
    vizConfig: tableVizConfigSchema,
    filters: filtersSchema
        .nullable()
        .describe(
            'Filters to apply to the query. Filtered fields must exist in the selected explore.',
        ),
    followUpTools: z
        .array(
            z.union([
                z.literal(FollowUpTools.GENERATE_BAR_VIZ),
                z.literal(FollowUpTools.GENERATE_TIME_SERIES_VIZ),
            ]),
        )
        .describe(
            'The actions the User can ask for after the AI has generated the table.',
        ),
});

export type TableVizTool = z.infer<typeof tableVizToolSchema>;

export const isTableVizConfigTool = (config: unknown): config is TableVizTool =>
    tableVizToolSchema
        .omit({ type: true, followUpTools: true })
        .safeParse(config).success;

export const metricQueryTableViz = (
    vizTool: Pick<TableVizTool, 'vizConfig' | 'filters'>,
    maxLimit: number,
): AiMetricQuery => ({
    exploreName: vizTool.vizConfig.exploreName,
    metrics: vizTool.vizConfig.metrics,
    dimensions: vizTool.vizConfig.dimensions || [],
    sorts: vizTool.vizConfig.sorts,
    limit: getValidAiQueryLimit(vizTool.vizConfig.limit, maxLimit),
    filters: filtersSchemaTransformed.parse(vizTool.filters),
});

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
