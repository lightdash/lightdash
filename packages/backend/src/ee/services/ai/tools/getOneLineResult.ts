import {
    lighterMetricQuerySchema,
    lighterMetricQuerySchemaTransformed,
} from '@lightdash/common';
import { tool } from 'ai';
import type {
    GetPromptFn,
    RunMiniMetricQueryFn,
    UpdateProgressFn,
    UpdatePromptFn,
} from '../types/aiAgentDependencies';
import { toolErrorHandler } from '../utils/toolErrorHandler';

type Dependencies = {
    runMiniMetricQuery: RunMiniMetricQueryFn;
    getPrompt: GetPromptFn;
    updatePrompt: UpdatePromptFn;
    updateProgress: UpdateProgressFn;
};

export const getGetOneLineResult = ({
    getPrompt,
    updateProgress,
    runMiniMetricQuery,
    updatePrompt,
}: Dependencies) => {
    const schema = lighterMetricQuerySchema;

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
        execute: async (metricQuery) => {
            try {
                const transformedMetricQuery =
                    lighterMetricQuerySchemaTransformed.parse(metricQuery);
                const prompt = await getPrompt();

                await updatePrompt({
                    promptUuid: prompt.promptUuid,
                    metricQuery: transformedMetricQuery,
                });

                await updateProgress('🔍 Fetching the results...');
                const result = await runMiniMetricQuery(transformedMetricQuery);

                if (result.rows.length > 1) {
                    throw new Error(
                        'Expected a single row result, got multiple rows. Use a different tool if the result is expected to have multiple rows.',
                    );
                }

                await updateProgress('🙌 Got the answer!!!');

                return `Successfully generated the result:

\`\`\`json
${JSON.stringify(result.rows, null, 4)}
\`\`\``;
            } catch (e) {
                return toolErrorHandler(e, `Error getting one line result.`);
            }
        },
    });
};
