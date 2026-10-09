import type {
    AiModelOption,
    ApiAiAgentModelOptionsResponse,
    ApiError,
} from '@lightdash/common';
import { useQuery, type UseQueryOptions } from '@tanstack/react-query';
import { type LightdashApi } from '../../../../api';
import { useLightdashApi } from '../../../../providers/LightdashApi/useLightdashApi';
import { getAiAgentApiBase } from './aiAgentRouting';

const MODEL_OPTIONS_KEY = 'modelOptions';

const getModelOptions = async (
    lightdashApi: LightdashApi,
    projectUuid: string,
    agentUuid: string,
): Promise<ApiAiAgentModelOptionsResponse['results']> =>
    lightdashApi<ApiAiAgentModelOptionsResponse['results']>({
        version: 'v1',
        url: `${getAiAgentApiBase(projectUuid)}/${agentUuid}/models`,
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
    const lightdashApi = useLightdashApi();
    return useQuery<AiModelOption[], ApiError>({
        queryKey: [MODEL_OPTIONS_KEY, projectUuid, agentUuid],
        queryFn: () => getModelOptions(lightdashApi, projectUuid!, agentUuid!),
        ...options,
        enabled: !!projectUuid && !!agentUuid && options?.enabled !== false,
    });
};
