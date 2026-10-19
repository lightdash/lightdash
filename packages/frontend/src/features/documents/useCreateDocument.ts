import {
    type ApiError,
    type CreateDocumentRequest,
    type Document,
} from '@lightdash/common';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { invalidateContent } from '../../hooks/useContent';
import { useLightdashApi } from '../../providers/LightdashApi/useLightdashApi';

export const useCreateDocument = (projectUuid: string) => {
    const lightdashApi = useLightdashApi();
    const queryClient = useQueryClient();
    return useMutation<Document, ApiError, CreateDocumentRequest>({
        mutationFn: (body) =>
            lightdashApi<Document>({
                url: `/projects/${projectUuid}/documents`,
                method: 'POST',
                body: JSON.stringify(body),
            }),
        onSuccess: () => invalidateContent(queryClient, projectUuid),
    });
};
