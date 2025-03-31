import { FilterSchema, SortFieldSchema } from '@lightdash/common';
import { stringify } from 'csv-stringify/sync';
import { z } from 'zod';
import { CsvService } from '../../../../services/CsvService/CsvService';
import { ProjectService } from '../../../../services/ProjectService/ProjectService';
import { MiniMetricQuery } from '../runMiniMetricQuery/runMiniMetricQuery';
import {
    FollowUpTools,
    followUpToolsSchema,
} from '../utils/aiCopilot/followUpTools';
import { getValidAiQueryLimit } from '../utils/aiCopilot/validators';

export const csvFileConfigSchema = z
    .object({
        exploreName: z
            .string()
            .describe(
                'The name of the explore containing the metrics and dimensions used for csv query',
            ),
        metrics: z
            .array(z.string())
            .min(1)
            .describe(
                'At least one metric is required. The field ids of the metrics to be calculated for the CSV. They will be grouped by the dimensions.',
            ),
        dimensions: z
            .array(z.string())
            .optional()
            .describe(
                '(optional) The field id for the dimensions to group the metrics by',
            ),
        sorts: z
            .array(SortFieldSchema)
            .describe(
                'Sort configuration for the query, it can use a combination of metrics and dimensions.',
            ),
        limit: z
            .number()
            .optional()
            .describe('(optional) The maximum number of rows in the CSV.'),
        followUpTools: followUpToolsSchema.describe(
            `The actions the User can ask for after the AI has generated the CSV. NEVER include ${FollowUpTools.GENERATE_CSV} in this list.`,
        ),
    })
    .describe(
        'Configuration file for generating a CSV file from a query with metrics and dimensions',
    );

export const generateCsvToolSchema = z.object({
    vizConfig: csvFileConfigSchema,
    filters: FilterSchema.optional().describe(
        'Filters to apply to the query. Filtered fields must exist in the selected explore.',
    ),
});

type CsvFileConfig = z.infer<typeof csvFileConfigSchema>;

const metricQueryCsv = async (
    config: CsvFileConfig,
    maxLimit: number,
    filters: z.infer<typeof FilterSchema> = {},
): Promise<MiniMetricQuery> => ({
    exploreName: config.exploreName,
    metrics: config.metrics,
    dimensions: config.dimensions || [],
    sorts: config.sorts,
    limit: getValidAiQueryLimit(config.limit, maxLimit),
    filters,
});

type RenderCsvFileArgs = {
    runMetricQuery: (
        metricQuery: MiniMetricQuery,
    ) => ReturnType<InstanceType<typeof ProjectService>['runMetricQuery']>;
    config: CsvFileConfig;
    filters?: z.infer<typeof FilterSchema>;
    maxLimit: number;
};

export const renderCsvFile = async ({
    runMetricQuery,
    config,
    filters,
    maxLimit,
}: RenderCsvFileArgs): Promise<{
    file: Buffer;
    metricQuery: MiniMetricQuery;
}> => {
    const query = await metricQueryCsv(config, maxLimit, filters);
    const results = await runMetricQuery(query);
    const fields = results.rows[0] ? Object.keys(results.rows[0]) : [];
    const rows = results.rows.map((row) =>
        CsvService.convertRowToCsv(row, results.fields, true, fields),
    );
    const csv = stringify(rows, { header: true, columns: fields });
    return {
        file: Buffer.from(csv, 'utf8'),
        metricQuery: query,
    };
};
