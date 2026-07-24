import type { ApiAiAgentMemoryResponse, ApiError } from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';
import { lightdashApi } from '../../../../api';
import { getAiAgentApiBase } from './aiAgentRouting';

const getAiAgentMemory = (
    projectUuid: string,
    agentUuid: string,
    slug: string,
) =>
    lightdashApi<ApiAiAgentMemoryResponse['results']>({
        version: 'v1',
        url: `${getAiAgentApiBase(projectUuid)}/${agentUuid}/memories/${slug}`,
        method: 'GET',
        body: undefined,
    });

export const useAiAgentMemory = ({
    projectUuid,
    agentUuid,
    slug,
    enabled = true,
}: {
    projectUuid?: string;
    agentUuid?: string;
    slug?: string;
    enabled?: boolean;
}) =>
    useQuery<ApiAiAgentMemoryResponse['results'], ApiError>({
        queryKey: ['aiAgentMemory', projectUuid, slug],
        queryFn: () => getAiAgentMemory(projectUuid!, agentUuid!, slug!),
        enabled: enabled && Boolean(projectUuid && agentUuid && slug),
        retry: (failureCount, error) =>
            error.error?.statusCode !== 404 && failureCount < 2,
    });
