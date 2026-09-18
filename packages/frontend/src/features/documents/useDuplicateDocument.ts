import {
    type ApiError,
    type Document,
    type DuplicateDocumentRequest,
} from '@lightdash/common';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { lightdashApi } from '../../api';
import { invalidateContent } from '../../hooks/useContent';

export const useDuplicateDocument = (
    projectUuid: string,
    documentUuid: string,
) => {
    const queryClient = useQueryClient();
    return useMutation<Document, ApiError, DuplicateDocumentRequest>({
        mutationFn: (body) =>
            lightdashApi<Document>({
                url: `/projects/${projectUuid}/documents/${documentUuid}/duplicate`,
                method: 'POST',
                body: JSON.stringify(body),
            }),
        onSuccess: () => invalidateContent(queryClient, projectUuid),
    });
};
