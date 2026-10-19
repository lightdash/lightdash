import {
    type ApiError,
    type Document,
    type DuplicateDocumentRequest,
} from '@lightdash/common';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { invalidateContent } from '../../hooks/useContent';
import { useLightdashApi } from '../../providers/LightdashApi/useLightdashApi';

export const useDuplicateDocument = (
    projectUuid: string,
    documentUuid: string,
) => {
    const lightdashApi = useLightdashApi();
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
