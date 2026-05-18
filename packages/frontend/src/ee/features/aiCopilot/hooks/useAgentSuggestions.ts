import type { ApiAgentSuggestionsResponse, ApiError } from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';
import { lightdashApi } from '../../../../api';

const AGENT_SUGGESTIONS_KEY = 'agentSuggestions';

const getAgentSuggestions = (
    projectUuid: string,
    agentUuid: string,
    threadUuid?: string,
    afterMessageUuid?: string,
) => {
    const search = new URLSearchParams();
    if (threadUuid) search.set('threadUuid', threadUuid);
    if (afterMessageUuid) search.set('afterMessageUuid', afterMessageUuid);
    const qs = search.toString();
    return lightdashApi<ApiAgentSuggestionsResponse['results']>({
        version: 'v1',
        url: `/projects/${projectUuid}/aiAgents/${agentUuid}/suggestions${
            qs ? `?${qs}` : ''
        }`,
        method: 'GET',
        body: undefined,
    });
};

export const useAgentSuggestions = ({
    projectUuid,
    agentUuid,
    threadUuid,
    afterMessageUuid,
    enabled,
}: {
    projectUuid: string | undefined;
    agentUuid: string | undefined;
    threadUuid?: string;
    afterMessageUuid?: string;
    enabled: boolean;
}) =>
    useQuery<ApiAgentSuggestionsResponse['results'], ApiError>({
        queryKey: [
            AGENT_SUGGESTIONS_KEY,
            projectUuid,
            agentUuid,
            threadUuid ?? null,
            afterMessageUuid ?? null,
        ],
        queryFn: () =>
            getAgentSuggestions(
                projectUuid!,
                agentUuid!,
                threadUuid,
                afterMessageUuid,
            ),
        enabled: enabled && !!projectUuid && !!agentUuid,
        staleTime: Infinity,
        cacheTime: 1000 * 60 * 60,
        retry: 1,
    });
