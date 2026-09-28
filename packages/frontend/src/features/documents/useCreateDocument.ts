import {
    type ApiError,
    type CreateDocumentRequest,
    type Document,
} from '@lightdash/common';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { lightdashApi } from '../../api';
import { invalidateContent } from '../../hooks/useContent';

export const useCreateDocument = (projectUuid: string) => {
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
