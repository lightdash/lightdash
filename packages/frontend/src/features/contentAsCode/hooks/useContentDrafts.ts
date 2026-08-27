import {
    type ApiContentDraftReviewResponse,
    type ApiContentDraftsResponse,
    type ApiError,
    type ContentDraftSummary,
} from '@lightdash/common';
import { IconArrowRight } from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { lightdashApi } from '../../../api';
import useToaster from '../../../hooks/toaster/useToaster';

export const useContentDrafts = (projectUuid: string | undefined) =>
    useQuery<ApiContentDraftsResponse['results'], ApiError>({
        queryKey: ['content-drafts', projectUuid],
        queryFn: () =>
            lightdashApi<ApiContentDraftsResponse['results']>({
                url: `/projects/${projectUuid}/code/drafts`,
                method: 'GET',
                body: undefined,
            }),
        enabled: projectUuid !== undefined,
        refetchInterval: 15000,
    });

export const useContentDraftReview = (
    projectUuid: string | undefined,
    draftUuid: string | undefined,
) =>
    useQuery<ApiContentDraftReviewResponse['results'], ApiError>({
        queryKey: ['content-draft-review', projectUuid, draftUuid],
        queryFn: () =>
            lightdashApi<ApiContentDraftReviewResponse['results']>({
                url: `/projects/${projectUuid}/code/drafts/${draftUuid}/review`,
                method: 'GET',
                body: undefined,
            }),
        enabled: projectUuid !== undefined && draftUuid !== undefined,
    });

export const useWriteBackDraftMutation = (projectUuid: string | undefined) => {
    const { showToastSuccess, showToastError } = useToaster();
    const queryClient = useQueryClient();
    return useMutation<ContentDraftSummary, ApiError, string>(
        (draftUuid) =>
            lightdashApi<ContentDraftSummary>({
                url: `/projects/${projectUuid}/code/drafts/${draftUuid}/write-back`,
                method: 'POST',
                body: undefined,
            }),
        {
            onSuccess: (draft) => {
                void queryClient.invalidateQueries([
                    'content-drafts',
                    projectUuid,
                ]);
                showToastSuccess({
                    title: 'Draft written back to the repo',
                    action: draft.prUrl
                        ? {
                              children: 'Open pull request',
                              icon: IconArrowRight,
                              onClick: () => {
                                  window.open(draft.prUrl!, '_blank');
                              },
                          }
                        : undefined,
                });
            },
            onError: (error) => {
                showToastError({
                    title: 'Failed to write back draft',
                    subtitle: error.error.message,
                });
            },
        },
    );
};

export const useDismissDraftMutation = (projectUuid: string | undefined) => {
    const { showToastSuccess, showToastError } = useToaster();
    const queryClient = useQueryClient();
    return useMutation<undefined, ApiError, string>(
        (draftUuid) =>
            lightdashApi<undefined>({
                url: `/projects/${projectUuid}/code/drafts/${draftUuid}/dismiss`,
                method: 'POST',
                body: undefined,
            }),
        {
            onSuccess: () => {
                void queryClient.invalidateQueries([
                    'content-drafts',
                    projectUuid,
                ]);
                showToastSuccess({ title: 'Draft dismissed' });
            },
            onError: (error) => {
                showToastError({
                    title: 'Failed to dismiss draft',
                    subtitle: error.error.message,
                });
            },
        },
    );
};
