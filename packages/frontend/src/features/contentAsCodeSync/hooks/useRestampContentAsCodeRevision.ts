import { isApiError, type ApiError } from '@lightdash/common'; // pragma: allowlist secret
import { useMutation, useQueryClient } from '@tanstack/react-query';
import useToaster from '../../../hooks/toaster/useToaster';
import { restampContentAsCodeRevision } from '../api/restampContentAsCodeRevision';
import {
    CONTENT_AS_CODE_SYNC_STATUS_QUERY_KEY,
    type ContentAsCodeSyncContentType,
    type ContentAsCodeSyncStatus,
} from '../types';

type RestampVariables = {
    contentType: ContentAsCodeSyncContentType;
    slug: string;
};

export const useRestampContentAsCodeRevision = (projectUuid: string) => {
    const queryClient = useQueryClient();
    const { showToastSuccess, showToastApiError } = useToaster();

    return useMutation<ContentAsCodeSyncStatus, ApiError, RestampVariables>({
        mutationFn: ({ contentType, slug }) =>
            restampContentAsCodeRevision({
                projectUuid,
                contentType,
                slug,
            }),
        onSuccess: (status) => {
            queryClient.setQueryData(
                [CONTENT_AS_CODE_SYNC_STATUS_QUERY_KEY, projectUuid],
                { kind: 'ok', status },
            );
            showToastSuccess({
                title: 'Marker restamped',
                subtitle:
                    'The next upload will apply the incoming version for this slug.',
            });
        },
        onError: (error) => {
            if (isApiError(error)) {
                showToastApiError({
                    title: 'Could not restamp this slug',
                    apiError: error.error,
                });
                return;
            }
        },
    });
};
