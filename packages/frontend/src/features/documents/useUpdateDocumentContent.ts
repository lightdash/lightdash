import {
    type ApiError,
    type Document,
    type UpdateDocumentContentRequest,
} from '@lightdash/common';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { invalidateContent } from '../../hooks/useContent';
import { useLightdashApi } from '../../providers/LightdashApi/useLightdashApi';

export const useUpdateDocumentContent = (
    projectUuid: string,
    documentUuid: string,
) => {
    const lightdashApi = useLightdashApi();
    const queryClient = useQueryClient();
    return useMutation<Document, ApiError, UpdateDocumentContentRequest>({
        mutationFn: (body) =>
            lightdashApi<Document>({
                url: `/projects/${projectUuid}/documents/${documentUuid}/versions`,
                method: 'POST',
                body: JSON.stringify(body),
            }),
        onSuccess: async (document) => {
            queryClient.setQueryData(
                ['document', projectUuid, documentUuid],
                document,
            );
            queryClient.setQueryData(
                ['document', projectUuid, document.slug],
                document,
            );
            await queryClient.invalidateQueries({
                queryKey: ['document', projectUuid],
            });
            await invalidateContent(queryClient, projectUuid);
        },
        onError: async (error) => {
            if (error.error.statusCode === 409) {
                await queryClient.invalidateQueries({
                    queryKey: ['document', projectUuid],
                });
            }
        },
    });
};
