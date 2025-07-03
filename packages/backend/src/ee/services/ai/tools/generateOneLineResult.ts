import {
    oneLineResultSchema,
    oneLineResultSchemaTransformed,
} from '@lightdash/common';
import { tool } from 'ai';
import { stringify } from 'csv-stringify/sync';
import { CsvService } from '../../../../services/CsvService/CsvService';
import type {
    GetPromptFn,
    RunMiniMetricQueryFn,
    UpdateProgressFn,
    UpdatePromptFn,
} from '../types/aiAgentDependencies';
import { serializeData } from '../utils/serializeData';
import { toolErrorHandler } from '../utils/toolErrorHandler';

type Dependencies = {
    runMiniMetricQuery: RunMiniMetricQueryFn;
    getPrompt: GetPromptFn;
    updatePrompt: UpdatePromptFn;
    updateProgress: UpdateProgressFn;
};

export const getGenerateOneLineResult = ({
    getPrompt,
    updateProgress,
    runMiniMetricQuery,
    updatePrompt,
}: Dependencies) => {
    const schema = oneLineResultSchema;

    return tool({
        description: `Get a single line result from the database. E.g. how many users signed up today?

This tool is meant to return a single value result.
If you need to fetch multiple results, use any of the other Visualization or CSV tools available.

Rules for fetching the result:
- The dimension and metric "fieldIds" must come from an explore. If you haven't used "findFieldsInExplore" tool, please do so before using this tool.
- If the data needs to be filtered, generate the filters using the "generateQueryFilters" tool before using this tool.
- Only apply sort if needed and make sure sort "fieldId"s are from the selected "Metric" and "Dimension" "fieldId"s.
`,
        parameters: schema,
        execute: async (vizConfig) => {
            try {
                await updateProgress('🧮 Calculating the result...');

                const prompt = await getPrompt();
                await updatePrompt({
                    promptUuid: prompt.promptUuid,
                    vizConfigOutput: vizConfig,
                });

                const transformedOneLineResult =
                    oneLineResultSchemaTransformed.parse(vizConfig);
                const results = await runMiniMetricQuery(
                    transformedOneLineResult.metricQuery,
                );
                if (results.rows.length > 1) {
                    throw new Error(
                        'Expected a single row result, got multiple rows. Use a different tool if the result is expected to have multiple rows.',
                    );
                }

                const fields = results.rows[0]
                    ? Object.keys(results.rows[0])
                    : [];
                const rows = results.rows.map((row) =>
                    CsvService.convertRowToCsv(
                        row,
                        results.fields,
                        true,
                        fields,
                    ),
                );
                const csv = stringify(rows, { header: true, columns: fields });
                await updateProgress('✅ Done.');

                return `Here's the result:
${serializeData(csv, 'csv')}`;
            } catch (e) {
                return toolErrorHandler(e, `Error getting one line result.`);
            }
        },
    });
};
