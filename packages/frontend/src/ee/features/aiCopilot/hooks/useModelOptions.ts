import type {
    AiModelOption,
    ApiAiAgentModelOptionsResponse,
    ApiError,
} from '@lightdash/common';
import { useQuery, type UseQueryOptions } from '@tanstack/react-query';
import { lightdashApi } from '../../../../api';

const MODEL_OPTIONS_KEY = 'modelOptions';

const getModelOptions = async (
    projectUuid: string,
    agentUuid: string,
): Promise<ApiAiAgentModelOptionsResponse['results']> =>
    lightdashApi<ApiAiAgentModelOptionsResponse['results']>({
        version: 'v1',
        url: `/projects/${projectUuid}/aiAgents/${agentUuid}/models`,
        method: 'GET',
        body: undefined,
    });

type UseModelOptionsProps = {
    projectUuid: string | undefined;
    agentUuid: string | undefined;
    options?: UseQueryOptions<AiModelOption[], ApiError>;
};

export const useModelOptions = ({
    projectUuid,
    agentUuid,
    options,
}: UseModelOptionsProps) => {
    return useQuery<AiModelOption[], ApiError>({
        queryKey: [MODEL_OPTIONS_KEY, projectUuid, agentUuid],
        queryFn: () => getModelOptions(projectUuid!, agentUuid!),
        ...options,
        enabled: !!projectUuid && !!agentUuid && options?.enabled !== false,
    });
};
