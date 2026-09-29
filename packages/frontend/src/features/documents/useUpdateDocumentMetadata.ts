import {
    type ApiError,
    type Document,
    type UpdateDocumentMetadataRequest,
} from '@lightdash/common';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { lightdashApi } from '../../api';
import { invalidateContent } from '../../hooks/useContent';

export const useUpdateDocumentMetadata = (
    projectUuid: string,
    documentUuid: string,
) => {
    const queryClient = useQueryClient();
    return useMutation<Document, ApiError, UpdateDocumentMetadataRequest>({
        mutationFn: (body) =>
            lightdashApi<Document>({
                url: `/projects/${projectUuid}/documents/${documentUuid}`,
                method: 'PATCH',
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
    });
};
