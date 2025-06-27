import {
    AiChartType,
    AiMetricQuery,
    csvFileVizConfigSchema,
    filtersSchema,
    filtersSchemaTransformed,
} from '@lightdash/common';
import { stringify } from 'csv-stringify/sync';
import { z } from 'zod';
import { CsvService } from '../../../../services/CsvService/CsvService';
import { ProjectService } from '../../../../services/ProjectService/ProjectService';
import { FollowUpTools, followUpToolsSchema } from '../types/followUpTools';
import { getValidAiQueryLimit } from '../utils/validators';

const vizConfigSchema = csvFileVizConfigSchema
    .extend({
        limit: z
            .number()
            .nullable()
            .describe('The maximum number of rows in the CSV.'),
        followUpTools: followUpToolsSchema.describe(
            `The actions the User can ask for after the AI has generated the CSV. NEVER include ${FollowUpTools.GENERATE_CSV} in this list.`,
        ),
    })
    .describe(
        'Configuration file for generating a CSV file from a query with metrics and dimensions',
    );

export const generateCsvToolSchema = z.object({
    vizConfig: vizConfigSchema,
    filters: filtersSchema
        .nullable()
        .describe(
            'Filters to apply to the query. Filtered fields must exist in the selected explore.',
        ),
});

export type CsvFileConfig = z.infer<typeof vizConfigSchema>;

export const isCsvFileConfig = (config: unknown): config is CsvFileConfig =>
    typeof config === 'object' &&
    config !== null &&
    !('yMetrics' in config) &&
    'metrics' in config;

export const metricQueryCsv = async (
    config: CsvFileConfig,
    maxLimit: number,
    filters: z.infer<typeof filtersSchemaTransformed> = {},
): Promise<AiMetricQuery> => ({
    exploreName: config.exploreName,
    metrics: config.metrics,
    dimensions: config.dimensions || [],
    sorts: config.sorts,
    limit: getValidAiQueryLimit(config.limit, maxLimit),
    filters,
});

type RenderCsvFileArgs = {
    runMetricQuery: (
        metricQuery: AiMetricQuery,
    ) => ReturnType<InstanceType<typeof ProjectService>['runMetricQuery']>;
    config: CsvFileConfig;
    filters: z.infer<typeof filtersSchemaTransformed> | undefined;
    maxLimit: number;
};

export const renderCsvFile = async ({
    runMetricQuery,
    config,
    filters,
    maxLimit,
}: RenderCsvFileArgs): Promise<{
    type: AiChartType.CSV;
    metricQuery: AiMetricQuery;
    results: Awaited<
        ReturnType<InstanceType<typeof ProjectService>['runMetricQuery']>
    >;
    csv: string;
}> => {
    const query = await metricQueryCsv(config, maxLimit, filters);
    const results = await runMetricQuery(query);
    const fields = results.rows[0] ? Object.keys(results.rows[0]) : [];
    const rows = results.rows.map((row) =>
        CsvService.convertRowToCsv(row, results.fields, true, fields),
    );

    const csv = stringify(rows, { header: true, columns: fields });

    return {
        type: AiChartType.CSV,
        metricQuery: query,
        results,
        csv,
    };
};
