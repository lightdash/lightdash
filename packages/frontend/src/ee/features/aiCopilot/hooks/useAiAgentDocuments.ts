import type {
    ApiAiAgentDocumentResponse,
    ApiAiAgentDocumentSummaryListResponse,
    ApiCreateAgentDocument,
    ApiError,
    ApiSuccessEmpty,
} from '@lightdash/common';
import {
    useMutation,
    useQuery,
    useQueryClient,
    type UseQueryOptions,
} from '@tanstack/react-query';
import { lightdashApi } from '../../../../api';
import useToaster from '../../../../hooks/toaster/useToaster';

const AI_AGENT_DOCUMENTS_KEY = 'aiAgentDocuments';

const documentsUrl = (projectUuid: string, agentUuid: string) =>
    `/projects/${projectUuid}/aiAgents/${agentUuid}/documents`;

const listDocuments = async (projectUuid: string, agentUuid: string) =>
    lightdashApi<ApiAiAgentDocumentSummaryListResponse['results']>({
        version: 'v1',
        url: documentsUrl(projectUuid, agentUuid),
        method: 'GET',
        body: undefined,
    });

const createDocument = async (
    projectUuid: string,
    agentUuid: string,
    body: ApiCreateAgentDocument,
) =>
    lightdashApi<ApiAiAgentDocumentResponse['results']>({
        version: 'v1',
        url: documentsUrl(projectUuid, agentUuid),
        method: 'POST',
        body: JSON.stringify(body),
    });

const deleteDocument = async (
    projectUuid: string,
    agentUuid: string,
    documentUuid: string,
) =>
    lightdashApi<ApiSuccessEmpty['results']>({
        version: 'v1',
        url: `${documentsUrl(projectUuid, agentUuid)}/${documentUuid}`,
        method: 'DELETE',
        body: undefined,
    });

export const useAiAgentDocuments = (
    projectUuid: string,
    agentUuid: string,
    options?: UseQueryOptions<
        ApiAiAgentDocumentSummaryListResponse['results'],
        ApiError
    >,
) =>
    useQuery<ApiAiAgentDocumentSummaryListResponse['results'], ApiError>({
        queryKey: [AI_AGENT_DOCUMENTS_KEY, projectUuid, agentUuid],
        queryFn: () => listDocuments(projectUuid, agentUuid),
        ...options,
    });

export const useCreateAiAgentDocument = (
    projectUuid: string,
    agentUuid: string,
) => {
    const queryClient = useQueryClient();
    const { showToastApiError } = useToaster();
    return useMutation<
        ApiAiAgentDocumentResponse['results'],
        ApiError,
        ApiCreateAgentDocument
    >({
        mutationFn: (body) => createDocument(projectUuid, agentUuid, body),
        onSuccess: async () => {
            // Org level documents appear under every agent, so invalidate them all
            await queryClient.invalidateQueries({
                queryKey: [AI_AGENT_DOCUMENTS_KEY],
            });
        },
        onError: ({ error }) => {
            showToastApiError({
                title: 'Failed to upload document',
                apiError: error,
            });
        },
    });
};

export const useDeleteAiAgentDocument = (
    projectUuid: string,
    agentUuid: string,
) => {
    const queryClient = useQueryClient();
    const { showToastApiError } = useToaster();
    return useMutation<ApiSuccessEmpty['results'], ApiError, string>({
        mutationFn: (documentUuid) =>
            deleteDocument(projectUuid, agentUuid, documentUuid),
        onSuccess: async () => {
            // Org level documents appear under every agent, so invalidate them all
            await queryClient.invalidateQueries({
                queryKey: [AI_AGENT_DOCUMENTS_KEY],
            });
        },
        onError: ({ error }) => {
            showToastApiError({
                title: 'Failed to delete document',
                apiError: error,
            });
        },
    });
};
