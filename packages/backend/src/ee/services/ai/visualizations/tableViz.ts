import {
    AiChartType,
    AiMetricQuery,
    filtersSchema,
    filtersSchemaTransformed,
    tableVizConfigSchema,
} from '@lightdash/common';
import { stringify } from 'csv-stringify/sync';
import { z } from 'zod';
import { CsvService } from '../../../../services/CsvService/CsvService';
import { ProjectService } from '../../../../services/ProjectService/ProjectService';
import { FollowUpTools, followUpToolsSchema } from '../types/followUpTools';
import { getValidAiQueryLimit } from '../utils/validators';

const vizConfigSchema = tableVizConfigSchema
    .extend({
        limit: z
            .number()
            .nullable()
            .describe('The maximum number of rows in the table.'),
        followUpTools: followUpToolsSchema.describe(
            `The actions the User can ask for after the AI has generated the table. NEVER include ${FollowUpTools.GENERATE_TABLE} in this list.`,
        ),
    })
    .describe(
        'Configuration file for generating a CSV file from a query with metrics and dimensions',
    );

export const generateTableVizConfigToolSchema = z.object({
    type: z.literal(AiChartType.TABLE),
    vizConfig: vizConfigSchema,
    filters: filtersSchema
        .nullable()
        .describe(
            'Filters to apply to the query. Filtered fields must exist in the selected explore.',
        ),
});

export type TableVizConfig = z.infer<typeof generateTableVizConfigToolSchema>;

export const isTableVizConfig = (config: unknown): config is TableVizConfig =>
    generateTableVizConfigToolSchema.safeParse(config).success;

export const metricQueryTableViz = (
    config: TableVizConfig,
    maxLimit: number,
): AiMetricQuery => ({
    exploreName: config.vizConfig.exploreName,
    metrics: config.vizConfig.metrics,
    dimensions: config.vizConfig.dimensions || [],
    sorts: config.vizConfig.sorts,
    limit: getValidAiQueryLimit(config.vizConfig.limit, maxLimit),
    filters: filtersSchemaTransformed.parse(config.filters),
});

type RenderTableVizArgs = {
    runMetricQuery: (
        metricQuery: AiMetricQuery,
    ) => ReturnType<InstanceType<typeof ProjectService>['runMetricQuery']>;
    config: TableVizConfig;
    maxLimit: number;
};

export const renderTableViz = async ({
    runMetricQuery,
    config,
    maxLimit,
}: RenderTableVizArgs): Promise<{
    type: AiChartType.TABLE;
    metricQuery: AiMetricQuery;
    results: Awaited<
        ReturnType<InstanceType<typeof ProjectService>['runMetricQuery']>
    >;
    csv: string;
}> => {
    const query = metricQueryTableViz(config, maxLimit);
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
