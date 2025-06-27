import {
    filtersSchemaTransformed,
    generateQueryFiltersToolSchema,
    getTotalFilterRules,
} from '@lightdash/common';
import { tool } from 'ai';
import type {
    GetExploreFn,
    UpdatePromptFn,
} from '../types/aiAgentDependencies';
import { toolErrorHandler } from '../utils/toolErrorHandler';
import { validateFilterRules } from '../utils/validators';

type Dependencies = {
    promptUuid: string;
    updatePrompt: UpdatePromptFn;
    getExplore: GetExploreFn;
};

export const getGenerateQueryFilters = ({
    getExplore,
    promptUuid,
    updatePrompt,
}: Dependencies) => {
    const schema = generateQueryFiltersToolSchema;

    return tool({
        description: `Generate the filters necessary to fetch the correct data from the database.

Rules for generating filters:
- The filter's fieldIds must come from an explore. If you haven't used "findFieldsInExplore" tool, please do so before using this tool.
- DO NOT use a fieldId that does not exist in the selected explore. Do not try to make up fieldId's.
- Make sure you generate the right filters depending on the user's request.
- If the field you are filtering is a timestamp/date field, ensure the values are JavaScript Date-compatible strings.
`,
        parameters: schema,
        execute: async ({ exploreName, filters }) => {
            try {
                const explore = await getExplore({ exploreName });

                // Transform filters to the correct format for the query and keep the original format for the tool call args
                const transformedFilters =
                    filtersSchemaTransformed.parse(filters);
                const filterRules = getTotalFilterRules(transformedFilters);

                validateFilterRules(explore, filterRules);

                await updatePrompt({
                    promptUuid,
                    filtersOutput: transformedFilters,
                });

                return `Filters have been successfully generated.

Filters:
\`\`\`json
${JSON.stringify(transformedFilters, null, 4)}
\`\`\``;
            } catch (e) {
                return toolErrorHandler(e, `Error generating filters.`);
            }
        },
    });
};
