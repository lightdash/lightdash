import type {
    ApiAiAgentDocumentResponse,
    ApiAiAgentDocumentSummaryListResponse,
    ApiCreateAiAgentDocument,
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

const listDocuments = async () =>
    lightdashApi<ApiAiAgentDocumentSummaryListResponse['results']>({
        version: 'v1',
        url: `/aiAgents/documents`,
        method: 'GET',
        body: undefined,
    });

const createDocument = async (body: ApiCreateAiAgentDocument) =>
    lightdashApi<ApiAiAgentDocumentResponse['results']>({
        version: 'v1',
        url: `/aiAgents/documents`,
        method: 'POST',
        body: JSON.stringify(body),
    });

const deleteDocument = async (documentUuid: string) =>
    lightdashApi<ApiSuccessEmpty['results']>({
        version: 'v1',
        url: `/aiAgents/documents/${documentUuid}`,
        method: 'DELETE',
        body: undefined,
    });

export const useAiAgentDocuments = (
    options?: UseQueryOptions<
        ApiAiAgentDocumentSummaryListResponse['results'],
        ApiError
    >,
) =>
    useQuery<ApiAiAgentDocumentSummaryListResponse['results'], ApiError>({
        queryKey: [AI_AGENT_DOCUMENTS_KEY],
        queryFn: listDocuments,
        ...options,
    });

export const useCreateAiAgentDocument = () => {
    const queryClient = useQueryClient();
    const { showToastApiError } = useToaster();
    return useMutation<
        ApiAiAgentDocumentResponse['results'],
        ApiError,
        ApiCreateAiAgentDocument
    >({
        mutationFn: createDocument,
        onSuccess: async () => {
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

export const useDeleteAiAgentDocument = () => {
    const queryClient = useQueryClient();
    const { showToastApiError } = useToaster();
    return useMutation<ApiSuccessEmpty['results'], ApiError, string>({
        mutationFn: deleteDocument,
        onSuccess: async () => {
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
