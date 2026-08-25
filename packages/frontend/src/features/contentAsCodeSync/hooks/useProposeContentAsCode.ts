import { isApiError, type ApiError } from '@lightdash/common'; // pragma: allowlist secret
import { useMutation, useQueryClient } from '@tanstack/react-query';
import useToaster from '../../../hooks/toaster/useToaster';
import { proposeContentAsCode } from '../api/proposeContentAsCode';
import {
    CONTENT_AS_CODE_WRITE_BACK_STATUS_QUERY_KEY,
    type ContentAsCodeProposeResult,
    type ContentAsCodeSyncContentType,
} from '../types';

type ProposeVariables = {
    contentType: ContentAsCodeSyncContentType;
    slug: string;
};

export const useProposeContentAsCode = (projectUuid: string) => {
    const queryClient = useQueryClient();
    const { showToastSuccess, showToastApiError } = useToaster();

    return useMutation<ContentAsCodeProposeResult, ApiError, ProposeVariables>({
        mutationFn: ({ contentType, slug }) =>
            proposeContentAsCode(projectUuid, contentType, slug),
        onSuccess: (result, { contentType, slug }) => {
            void queryClient.invalidateQueries({
                queryKey: [
                    CONTENT_AS_CODE_WRITE_BACK_STATUS_QUERY_KEY,
                    projectUuid,
                    contentType,
                    slug,
                ],
            });
            showToastSuccess({
                title:
                    result.notedChartSlugs.length > 0
                        ? 'Opened a pull request'
                        : 'Proposed changes to git',
                action: {
                    children: 'View pull request',
                    onClick: () =>
                        window.open(
                            result.prUrl,
                            '_blank',
                            'noopener,noreferrer',
                        ),
                },
            });
        },
        onError: (error) => {
            if (isApiError(error)) {
                showToastApiError({
                    title: 'Failed to propose to git',
                    apiError: error.error,
                });
            }
        },
    });
};
