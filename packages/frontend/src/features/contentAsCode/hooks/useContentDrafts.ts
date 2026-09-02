import {
    type ApiContentDraftStalenessResponse,
    type ContentDraftRebaseRequest,
    type ApiContentDraftReviewResponse,
    type ApiContentDraftsResponse,
    type ApiError,
    type ContentDraftSummary,
} from '@lightdash/common';
import { IconArrowRight } from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { lightdashApi } from '../../../api';
import useToaster from '../../../hooks/toaster/useToaster';

// refresh asks the server to reconcile open write-back PRs with the git
// provider; the server throttles that to once a minute per project
export const useContentDrafts = (projectUuid: string | undefined) =>
    useQuery<ApiContentDraftsResponse['results'], ApiError>({
        queryKey: ['content-drafts', projectUuid],
        queryFn: () =>
            lightdashApi<ApiContentDraftsResponse['results']>({
                url: `/projects/${projectUuid}/code/drafts?refresh=true`,
                method: 'GET',
                body: undefined,
            }),
        enabled: projectUuid !== undefined,
        refetchInterval: 30000,
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

// Only fetched once a draft is known to be stale
export const useDraftStaleness = (
    projectUuid: string | undefined,
    draftUuid: string | undefined,
) =>
    useQuery<ApiContentDraftStalenessResponse['results'], ApiError>({
        queryKey: ['content-draft-staleness', projectUuid, draftUuid],
        queryFn: () =>
            lightdashApi<ApiContentDraftStalenessResponse['results']>({
                url: `/projects/${projectUuid}/code/drafts/${draftUuid}/staleness`,
                method: 'GET',
                body: undefined,
            }),
        enabled: projectUuid !== undefined && draftUuid !== undefined,
    });

export const useRebaseDraftMutation = (projectUuid: string | undefined) => {
    const { showToastSuccess, showToastError } = useToaster();
    const queryClient = useQueryClient();
    return useMutation<
        ContentDraftSummary,
        ApiError,
        {
            draftUuid: string;
            resolutions: ContentDraftRebaseRequest['resolutions'];
        }
    >(
        ({ draftUuid, resolutions }) =>
            lightdashApi<ContentDraftSummary>({
                url: `/projects/${projectUuid}/code/drafts/${draftUuid}/rebase`,
                method: 'POST',
                body: JSON.stringify({ resolutions }),
            }),
        {
            onSuccess: () => {
                void Promise.all([
                    queryClient.invalidateQueries([
                        'content-drafts',
                        projectUuid,
                    ]),
                    queryClient.invalidateQueries(['content-draft-review']),
                    queryClient.invalidateQueries(['saved_dashboard_query']),
                    queryClient.invalidateQueries(['saved_query']),
                ]);
                showToastSuccess({
                    title: 'Draft updated to the latest version',
                });
            },
            onError: (error) => {
                showToastError({
                    title: 'Failed to update draft',
                    subtitle: error.error.message,
                });
            },
        },
    );
};

export const useReopenDraftMutation = (projectUuid: string | undefined) => {
    const { showToastSuccess, showToastError } = useToaster();
    const queryClient = useQueryClient();
    return useMutation<ContentDraftSummary, ApiError, string>(
        (draftUuid) =>
            lightdashApi<ContentDraftSummary>({
                url: `/projects/${projectUuid}/code/drafts/${draftUuid}/reopen`,
                method: 'POST',
                body: undefined,
            }),
        {
            onSuccess: () => {
                void Promise.all([
                    queryClient.invalidateQueries([
                        'content-drafts',
                        projectUuid,
                    ]),
                    queryClient.invalidateQueries(['saved_dashboard_query']),
                    queryClient.invalidateQueries(['saved_query']),
                ]);
                showToastSuccess({ title: 'Draft reopened' });
            },
            onError: (error) => {
                showToastError({
                    title: 'Failed to reopen draft',
                    subtitle: error.error.message,
                });
            },
        },
    );
};
