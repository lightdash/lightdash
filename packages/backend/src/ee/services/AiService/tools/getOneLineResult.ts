import { DynamicStructuredTool } from '@langchain/core/tools';
import {
    AiWebAppPrompt,
    getErrorMessage,
    lighterMetricQuerySchema,
    SlackPrompt,
    UpdateSlackResponse,
} from '@lightdash/common';
import * as Sentry from '@sentry/node';
import { z } from 'zod';
import Logger from '../../../../logging/logger';
import { RunMiniMetricQuery } from '../runMiniMetricQuery/runMiniMetricQuery';

export const aiGetOneLineResultToolSchema = z.object({
    metricQuery: lighterMetricQuerySchema.describe(
        'Metric query to run to get the result',
    ), // ! DO NOT USE MINIMETRICQUERY HERE, ZOD CANNOT GET THE TYPE CORRECTLY
});

type AiGetOneLineResultToolArgs = {
    runMiniMetricQuery: RunMiniMetricQuery;
    getPrompt: () => Promise<SlackPrompt | AiWebAppPrompt>;
    updatePrompt: (prompt: UpdateSlackResponse) => Promise<void>;
    updateProgress: (progress: string) => Promise<void>;
};

export const getGetOneLineResultTool = ({
    getPrompt,
    updateProgress,
    runMiniMetricQuery,
    updatePrompt,
}: AiGetOneLineResultToolArgs) => {
    const schema = aiGetOneLineResultToolSchema;

    return new DynamicStructuredTool({
        name: 'getOneLineResult',
        description: `Get a single line result from the database. E.g. how many users signed up today?

This tool is meant to return a single value result.
If you need to fetch multiple results, use any of the other Visualization or CSV tools available.

Rules for fetching the result:
- The dimension and metric "fieldIds" must come from an explore. If you haven't used "findFieldsInExplore" tool, please do so before using this tool.
- If the data needs to be filtered, generate the filters using the "generateQueryFilters" tool before using this tool.
- Only apply sort if needed and make sure sort "fieldId"s are from the selected "Metric" and "Dimension" "fieldId"s.
`,
        schema,
        func: async ({ metricQuery }: z.infer<typeof schema>) => {
            try {
                const prompt = await getPrompt();

                await updatePrompt({
                    promptUuid: prompt.promptUuid,
                    metricQuery,
                });

                await updateProgress('🔍 Fetching the results...');
                const result = await runMiniMetricQuery(metricQuery);

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
                Logger.debug('Error fetching the results', e);
                Sentry.captureException(e);
                return `There was an error fetching the result.

Here's the original error message:
\`\`\`
${getErrorMessage(e)}
\`\`\`

Please try again.`;
            }
        },
    });
};
