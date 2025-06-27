import { tool } from 'ai';
import { z } from 'zod';
import type { GetExploresFn } from '../types/aiAgentDependencies';
import { toolErrorHandler } from '../utils/toolErrorHandler';

type Dependencies = {
    getExplores: GetExploresFn;
};

export const getFindExplores = ({ getExplores }: Dependencies) => {
    // TODO: empty schema for now, but we should implement hybrid search for this tool
    // and LLM should fill in the schema with possible search queries
    const schema = z.object({});

    return tool({
        description: `Get an information about explores/models you have access to.`,
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
