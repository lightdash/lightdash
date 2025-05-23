import { DynamicStructuredTool } from '@langchain/core/tools';
import {
    Explore,
    GenerateQueryFiltersToolSchema,
    getErrorMessage,
    getFields,
    getFiltersFromGroup,
    getTotalFilterRules,
    UpdateSlackResponse,
} from '@lightdash/common';
import * as Sentry from '@sentry/node';
import { z } from 'zod';
import Logger from '../../../../logging/logger';
import { validateFilterRules } from '../utils/aiCopilot/validators';

type GetGenerateQueryFiltersToolArgs = {
    promptUuid: string;
    updatePrompt: (prompt: UpdateSlackResponse) => Promise<void>;
    getExplore: (args: { exploreName: string }) => Promise<Explore>;
};

export const getGenerateQueryFiltersTool = ({
    getExplore,
    promptUuid,
    updatePrompt,
}: GetGenerateQueryFiltersToolArgs) => {
    const schema = GenerateQueryFiltersToolSchema;

    return new DynamicStructuredTool({
        name: 'generateQueryFilters',
        description: `Generate the filters necessary to fetch the correct data from the database.

Rules for generating filters:
- The filter's fieldIds must come from an explore. If you haven't used "findFieldsInExplore" tool, please do so before using this tool.
- DO NOT use a fieldId that does not exist in the selected explore. Do not try to make up fieldId's.
- Make sure you generate the right filters depending on the user's request.
- If the field you are filtering is a timestamp/date field, ensure the values are JavaScript Date-compatible strings.
`,
        schema,
        func: async ({ exploreName, filterGroup }: z.infer<typeof schema>) => {
            try {
                const explore = await getExplore({ exploreName });

                const exploreFields = getFields(explore);

                const filters = getFiltersFromGroup(filterGroup, exploreFields);
                const filterRules = getTotalFilterRules(filters);

                validateFilterRules(explore, filterRules);

                await updatePrompt({
                    promptUuid,
                    filtersOutput: filters,
                });

                return `Filters have been successfully generated.

Filters:
\`\`\`json
${JSON.stringify(filters, null, 4)}
\`\`\``;
            } catch (e) {
                Sentry.captureException(e);
                Logger.debug('Error generating filters', e);

                return `There was an error generating the filters.

Here's the original error message:
\`\`\`
${getErrorMessage(e)}
\`\`\`

Please try again.`;
            }
        },
    });
};
