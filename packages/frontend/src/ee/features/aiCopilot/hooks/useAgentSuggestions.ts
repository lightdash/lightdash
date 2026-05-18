import type { ApiAgentSuggestionsResponse, ApiError } from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';
import { lightdashApi } from '../../../../api';

const AGENT_SUGGESTIONS_KEY = 'agentSuggestions';

const getAgentSuggestions = (projectUuid: string, agentUuid: string) =>
    lightdashApi<ApiAgentSuggestionsResponse['results']>({
        version: 'v1',
        url: `/projects/${projectUuid}/aiAgents/${agentUuid}/suggestions`,
        method: 'GET',
        body: undefined,
    });

export const useAgentSuggestions = ({
    projectUuid,
    agentUuid,
    enabled,
}: {
    projectUuid: string | undefined;
    agentUuid: string | undefined;
    enabled: boolean;
}) =>
    useQuery<ApiAgentSuggestionsResponse['results'], ApiError>({
        queryKey: [AGENT_SUGGESTIONS_KEY, projectUuid, agentUuid],
        queryFn: () => getAgentSuggestions(projectUuid!, agentUuid!),
        enabled: enabled && !!projectUuid && !!agentUuid,
        staleTime: Infinity,
        cacheTime: 1000 * 60 * 60,
        retry: 1,
    });
