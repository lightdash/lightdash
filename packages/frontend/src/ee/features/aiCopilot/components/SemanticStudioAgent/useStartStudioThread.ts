import { type ApiAiAgentThreadCreateResponse } from '@lightdash/common';
import { type StartStudioThread } from '../../../../../features/semanticStudio/studioChange';
import { useLightdashApi } from '../../../../../providers/LightdashApi/useLightdashApi';
import { getStudioChatThreadsUrl } from '../../hooks/chatEndpoints';

/** Starts a Studio conversation without a first message, for a change that begins outside the chat. */
export const useStartStudioThread = (
    projectUuid: string,
): StartStudioThread => {
    const lightdashApi = useLightdashApi();
    return async (_agentUuid, threadContext) => {
        const created = await lightdashApi<
            ApiAiAgentThreadCreateResponse['results']
        >({
            url: getStudioChatThreadsUrl(projectUuid),
            method: 'POST',
            body: JSON.stringify({
                createdFrom: 'semantic_studio',
                threadContext,
            }),
        });
        // The server picks the agent the conversation runs on.
        return { threadUuid: created.uuid, agentUuid: created.agentUuid };
    };
};
