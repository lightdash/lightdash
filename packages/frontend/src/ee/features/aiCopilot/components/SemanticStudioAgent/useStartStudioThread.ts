import { type ApiAiAgentThreadCreateResponse } from '@lightdash/common';
import { type StartStudioThread } from '../../../../../features/semanticStudio/studioChange';
import { useLightdashApi } from '../../../../../providers/LightdashApi/useLightdashApi';
import { getStudioChatThreadsUrl } from '../../hooks/chatEndpoints';

/** Starts a Studio conversation without a first message, for a change that begins outside the chat. */
export const useStartStudioThread = (
    projectUuid: string,
): StartStudioThread => {
    const lightdashApi = useLightdashApi();
    return async (agentUuid, threadContext) => {
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
        return { threadUuid: created.uuid, agentUuid };
    };
};
