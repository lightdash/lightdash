import { CoreMessage } from 'ai';
import { AiAgentExploreSummary } from '../types/aiAgentExploreSummary';

export const getExploreInformationPrompt = ({
    exploreInformation,
}: {
    exploreInformation: AiAgentExploreSummary[];
}): CoreMessage => ({
    role: 'user',
    content: `Here is the information about the explores/models you have access to:
${exploreInformation
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
    .join('\n\n--------------------------------\n\n')}
    `,
});
