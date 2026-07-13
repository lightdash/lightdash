import type {
    ApiAiAgentDocumentContentResponse,
    ApiAiAgentDocumentResponse,
    ApiAiAgentDocumentSummaryListResponse,
    ApiCreateAgentDocument,
    ApiError,
    ApiSuccessEmpty,
    ApiUpdateAgentDocument,
    ApiUpdateAgentDocumentContent,
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

const getDocumentContent = async (
    projectUuid: string,
    agentUuid: string,
    documentUuid: string,
) =>
    lightdashApi<ApiAiAgentDocumentContentResponse['results']>({
        version: 'v1',
        url: `${documentsUrl(projectUuid, agentUuid)}/${documentUuid}/content`,
        method: 'GET',
        body: undefined,
    });

const updateDocumentContent = async (
    projectUuid: string,
    agentUuid: string,
    documentUuid: string,
    body: ApiUpdateAgentDocumentContent,
) =>
    lightdashApi<ApiAiAgentDocumentResponse['results']>({
        version: 'v1',
        url: `${documentsUrl(projectUuid, agentUuid)}/${documentUuid}/content`,
        method: 'PATCH',
        body: JSON.stringify(body),
    });

const updateDocument = async (
    projectUuid: string,
    agentUuid: string,
    documentUuid: string,
    body: ApiUpdateAgentDocument,
) =>
    lightdashApi<ApiSuccessEmpty['results']>({
        version: 'v1',
        url: `${documentsUrl(projectUuid, agentUuid)}/${documentUuid}`,
        method: 'PATCH',
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

export const useAiAgentDocumentContent = (
    projectUuid: string,
    agentUuid: string,
    documentUuid: string | null,
    options?: UseQueryOptions<
        ApiAiAgentDocumentContentResponse['results'],
        ApiError
    >,
) =>
    useQuery<ApiAiAgentDocumentContentResponse['results'], ApiError>({
        ...options,
        queryKey: [
            AI_AGENT_DOCUMENTS_KEY,
            projectUuid,
            agentUuid,
            'content',
            documentUuid,
        ],
        queryFn: () => {
            if (!documentUuid) {
                throw new Error('Document uuid is required');
            }
            return getDocumentContent(projectUuid, agentUuid, documentUuid);
        },
        enabled: documentUuid !== null && (options?.enabled ?? true),
    });

export const useUpdateAiAgentDocumentContent = (
    projectUuid: string,
    agentUuid: string,
) => {
    const queryClient = useQueryClient();
    const { showToastApiError } = useToaster();
    return useMutation<
        ApiAiAgentDocumentResponse['results'],
        ApiError,
        { documentUuid: string; body: ApiUpdateAgentDocumentContent }
    >({
        mutationFn: ({ documentUuid, body }) =>
            updateDocumentContent(projectUuid, agentUuid, documentUuid, body),
        onSuccess: async (document) => {
            await Promise.all([
                queryClient.invalidateQueries({
                    queryKey: [AI_AGENT_DOCUMENTS_KEY],
                }),
                queryClient.invalidateQueries({
                    queryKey: [
                        AI_AGENT_DOCUMENTS_KEY,
                        projectUuid,
                        agentUuid,
                        'content',
                        document.uuid,
                    ],
                }),
            ]);
        },
        onError: ({ error }) => {
            showToastApiError({
                title: 'Failed to update document content',
                apiError: error,
            });
        },
    });
};

export const useUpdateAiAgentDocument = (
    projectUuid: string,
    agentUuid: string,
) => {
    const queryClient = useQueryClient();
    const { showToastApiError } = useToaster();
    return useMutation<
        ApiSuccessEmpty['results'],
        ApiError,
        { documentUuid: string; body: ApiUpdateAgentDocument }
    >({
        mutationFn: ({ documentUuid, body }) =>
            updateDocument(projectUuid, agentUuid, documentUuid, body),
        onSuccess: async () => {
            await queryClient.invalidateQueries({
                queryKey: [AI_AGENT_DOCUMENTS_KEY],
            });
        },
        onError: ({ error }) => {
            showToastApiError({
                title: 'Failed to update document',
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
