import {
    type ApiAiAgentMessageQueryPipelinesResponse,
    type ApiError,
} from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';
import { useLightdashApi } from '../../../../providers/LightdashApi/useLightdashApi';
import { getAiAgentApiBase } from './aiAgentRouting';

type Args = {
    projectUuid: string;
    agentUuid: string;
    threadUuid: string;
    messageUuid: string;
    enabled: boolean;
};

export const useAiAgentMessageQueryPipelines = ({
    projectUuid,
    agentUuid,
    threadUuid,
    messageUuid,
    enabled,
}: Args) => {
    const lightdashApi = useLightdashApi();
    return useQuery<
        ApiAiAgentMessageQueryPipelinesResponse['results'],
        ApiError
    >({
        queryKey: [
            'aiAgentMessageQueryPipelines',
            projectUuid,
            agentUuid,
            threadUuid,
            messageUuid,
        ],
        queryFn: () =>
            lightdashApi<ApiAiAgentMessageQueryPipelinesResponse['results']>({
                url: `${getAiAgentApiBase(projectUuid)}/${agentUuid}/threads/${threadUuid}/messages/${messageUuid}/queries`,
                method: 'GET',
                body: undefined,
            }),
        enabled,
        // A finished turn's pipelines never change
        staleTime: Infinity,
    });
};
