import type {
    ApiAiAgentDocumentResponse,
    ApiAiAgentDocumentSummaryListResponse,
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

const uploadDocument = async (args: {
    file: File;
    name: string;
    projectUuid: string;
    agentAccess: string[];
}) => {
    const search = new URLSearchParams({
        filename: args.file.name,
        name: args.name,
        projectUuid: args.projectUuid,
    });
    if (args.agentAccess.length > 0) {
        search.set('agentAccess', args.agentAccess.join(','));
    }

    return lightdashApi<ApiAiAgentDocumentResponse['results']>({
        version: 'v1',
        url: `/aiAgents/documents/upload?${search.toString()}`,
        method: 'POST',
        body: args.file,
        headers: {
            'Content-Type': args.file.type || 'application/octet-stream',
        },
    });
};

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

export const useUploadAiAgentDocument = () => {
    const queryClient = useQueryClient();
    const { showToastApiError } = useToaster();
    return useMutation<
        ApiAiAgentDocumentResponse['results'],
        ApiError,
        {
            file: File;
            name: string;
            projectUuid: string;
            agentAccess: string[];
        }
    >({
        mutationFn: uploadDocument,
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
