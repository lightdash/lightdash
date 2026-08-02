import type {
    AiAgentMemoryEditableStatus,
    ApiAiAgentMemoryResponse,
    ApiAiAgentUserMemoriesResponse,
    ApiError,
    ApiUpdateAiAgentMemoryStatusRequest,
} from '@lightdash/common';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { lightdashApi } from '../../../../api';
import useToaster from '../../../../hooks/toaster/useToaster';
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

const getMyAiAgentMemory = (projectUuid: string, slug: string) =>
    lightdashApi<ApiAiAgentMemoryResponse['results']>({
        version: 'v1',
        url: `/projects/${projectUuid}/aiAgentMemories/${slug}`,
        method: 'GET',
        body: undefined,
    });

/** Same resource and cache entry as `useAiAgentMemory`, fetched without an agent. */
export const useMyAiAgentMemory = ({
    projectUuid,
    slug,
}: {
    projectUuid: string | undefined;
    slug: string | undefined;
}) =>
    useQuery<ApiAiAgentMemoryResponse['results'], ApiError>({
        queryKey: ['aiAgentMemory', projectUuid, slug],
        queryFn: () => getMyAiAgentMemory(projectUuid!, slug!),
        enabled: Boolean(projectUuid && slug),
        retry: (failureCount, error) =>
            error.error?.statusCode !== 404 && failureCount < 2,
    });

const MY_AI_AGENT_MEMORIES_QUERY_KEY = 'my-ai-agent-memories';

// A user owns few memories per project, so one generous page is enough for v0
const MY_AI_AGENT_MEMORIES_PAGE_SIZE = 100;

const getMyAiAgentMemories = (projectUuid: string) =>
    lightdashApi<ApiAiAgentUserMemoriesResponse['results']>({
        version: 'v1',
        url: `/projects/${projectUuid}/aiAgentMemories?page=1&pageSize=${MY_AI_AGENT_MEMORIES_PAGE_SIZE}`,
        method: 'GET',
        body: undefined,
    });

export const useMyAiAgentMemories = ({
    projectUuid,
    enabled = true,
}: {
    projectUuid: string | undefined;
    enabled?: boolean;
}) =>
    useQuery<ApiAiAgentUserMemoriesResponse['results'], ApiError>({
        queryKey: [MY_AI_AGENT_MEMORIES_QUERY_KEY, projectUuid],
        queryFn: () => getMyAiAgentMemories(projectUuid!),
        enabled: enabled && Boolean(projectUuid),
        // Feature flags off / no project access are terminal, not transient
        retry: (failureCount, error) =>
            error.error?.statusCode !== 404 &&
            error.error?.statusCode !== 403 &&
            failureCount < 2,
    });

const updateAiAgentMemoryStatus = ({
    projectUuid,
    memoryUuid,
    status,
}: {
    projectUuid: string;
    memoryUuid: string;
    slug: string;
    status: AiAgentMemoryEditableStatus;
}) =>
    lightdashApi<undefined>({
        version: 'v1',
        url: `/projects/${projectUuid}/aiAgentMemories/${memoryUuid}/status`,
        method: 'PATCH',
        body: JSON.stringify({
            status,
        } satisfies ApiUpdateAiAgentMemoryStatusRequest),
    });

export const useUpdateAiAgentMemoryStatus = () => {
    const queryClient = useQueryClient();
    const { showToastSuccess, showToastApiError } = useToaster();

    return useMutation<
        undefined,
        ApiError,
        {
            projectUuid: string;
            memoryUuid: string;
            slug: string;
            status: AiAgentMemoryEditableStatus;
        }
    >({
        mutationFn: updateAiAgentMemoryStatus,
        onSuccess: (_data, { projectUuid, slug, status }) => {
            queryClient.setQueryData<ApiAiAgentMemoryResponse['results']>(
                ['aiAgentMemory', projectUuid, slug],
                (memory) => (memory ? { ...memory, status } : memory),
            );
            void queryClient.invalidateQueries({
                queryKey: ['ai-agent-admin-memories'],
            });
            void queryClient.invalidateQueries({
                queryKey: [MY_AI_AGENT_MEMORIES_QUERY_KEY],
            });
            showToastSuccess({
                title:
                    status === 'retired'
                        ? 'Memory retired'
                        : 'Memory reactivated',
            });
        },
        onError: ({ error }, { status }) => {
            showToastApiError({
                title:
                    status === 'retired'
                        ? 'Failed to retire memory'
                        : 'Failed to reactivate memory',
                apiError: error,
            });
        },
    });
};
