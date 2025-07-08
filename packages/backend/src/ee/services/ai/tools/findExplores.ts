import { toolFindExploresArgsSchema } from '@lightdash/common';
import { tool } from 'ai';
import type { GetExploresFn } from '../types/aiAgentDependencies';
import { toolErrorHandler } from '../utils/toolErrorHandler';

type Dependencies = {
    getExplores: GetExploresFn;
};

export const getFindExplores = ({ getExplores }: Dependencies) => {
    // TODO: we should implement hybrid search for this tool
    // and LLM should fill in the schema with possible search queries
    const schema = toolFindExploresArgsSchema;

    return tool({
        description: `Use this tool to get information about Explores (models) available to you.`,
        parameters: schema,
        execute: async () => {
            try {
                const explores = await getExplores();

                return `Here is the information about the explores/models you have access to:
${explores
    .map(
        (explore) => `Explore/Model id: ${explore.name}
Name/Label: ${explore.label}
Description: ${explore.description ?? 'No description'}
${
    explore.joinedTables.length > 0
        ? `Base Table: ${explore.baseTable}
Joined tables: ${explore.joinedTables.join(', ')}`
        : ''
}
`,
    )
    .join('\n\n--------------------------------\n\n')}`;
            } catch (error) {
                return toolErrorHandler(error, `Error finding explores.`);
            }
        },
    });
};
